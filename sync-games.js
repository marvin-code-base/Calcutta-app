import { createClient } from "@supabase/supabase-js";

const ESPN_TO_OUR_CODE = { WSH: "WAS" };

const POSTSEASON_WEEK_TO_ROUND = {
  1: "wild_card",
  2: "divisional",
  3: "conference",
  4: "super_bowl",
};

async function fetchWeek(seasonYear, seasonType, week) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${seasonYear}&seasontype=${seasonType}&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.events || [];
}

function parseEvent(event, seasonYear, seasonTypeLabel, week) {
  const competition = event.competitions?.[0];
  if (!competition) return null;
  const competitors = competition.competitors || [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const homeCode = ESPN_TO_OUR_CODE[home.team?.abbreviation] || home.team?.abbreviation;
  const awayCode = ESPN_TO_OUR_CODE[away.team?.abbreviation] || away.team?.abbreviation;
  if (!homeCode || !awayCode) return null;

  const completed = Boolean(event.status?.type?.completed);
  let winnerCode = null;
  if (completed) {
    if (home.winner) winnerCode = homeCode;
    else if (away.winner) winnerCode = awayCode;
    // If neither is flagged winner (a tie), winnerCode stays null.
  }

  return {
    espn_event_id: String(event.id),
    season_year: seasonYear,
    season_type: seasonTypeLabel,
    week,
    home_team_code: homeCode,
    away_team_code: awayCode,
    winner_team_code: winnerCode,
    completed,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { leagueId } = req.body || {};
  if (!leagueId) {
    return res.status(400).json({ error: "leagueId is required" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: "Server is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: league, error: leagueLookupError } = await supabase
      .from("leagues")
      .select("season_year")
      .eq("id", leagueId)
      .single();
    if (leagueLookupError) throw leagueLookupError;
    const seasonYear = league.season_year;

    // Regular season: weeks 1-18, seasontype=2.
    const regularWeekFetches = Array.from({ length: 18 }, (_, i) => i + 1).map(
      async (week) => {
        const events = await fetchWeek(seasonYear, 2, week);
        return events
          .map((e) => parseEvent(e, seasonYear, "regular", week))
          .filter(Boolean);
      }
    );

    // Postseason: weeks 1-4, seasontype=3 — wild_card, divisional, conference, super_bowl.
    const postseasonWeekFetches = [1, 2, 3, 4].map(async (week) => {
      const events = await fetchWeek(seasonYear, 3, week);
      return events
        .map((e) => parseEvent(e, seasonYear, POSTSEASON_WEEK_TO_ROUND[week], week))
        .filter(Boolean);
    });

    const results = await Promise.all([...regularWeekFetches, ...postseasonWeekFetches]);
    const allGames = results.flat();

    if (allGames.length === 0) {
      throw new Error("ESPN returned no games for this season — schedule may not be published yet.");
    }

    const { error: upsertError } = await supabase
      .from("games")
      .upsert(allGames, { onConflict: "espn_event_id" });
    if (upsertError) throw upsertError;

    const completedCount = allGames.filter((g) => g.completed).length;

    return res.status(200).json({
      totalGames: allGames.length,
      completedGames: completedCount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
