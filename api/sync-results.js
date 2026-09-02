import { createClient } from "@supabase/supabase-js";

// ESPN's abbreviations differ from ours in a couple of spots.
const ESPN_TO_OUR_CODE = { WSH: "WAS" };

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
    const espnRes = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings"
    );
    if (!espnRes.ok) {
      throw new Error(`ESPN request failed: ${espnRes.status}`);
    }
    const espnData = await espnRes.json();

    // Walk the standings structure to pull { abbreviation, wins, ties } per team.
    const records = [];
    const groups = espnData.children || [];
    for (const group of groups) {
      const entries = group.standings?.entries || [];
      for (const entry of entries) {
        const abbrev = entry.team?.abbreviation;
        const stats = entry.stats || [];
        const wins = stats.find((s) => s.name === "wins")?.value ?? 0;
        const ties = stats.find((s) => s.name === "ties")?.value ?? 0;
        if (abbrev) records.push({ abbrev, wins, ties });
      }
    }

    if (records.length === 0) {
      throw new Error("ESPN response didn't contain any standings entries");
    }

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, nfl_team_code")
      .eq("league_id", leagueId);
    if (teamsError) throw teamsError;

    let updatedCount = 0;
    let totalTies = 0;
    const notFound = [];

    for (const record of records) {
      const ourCode = ESPN_TO_OUR_CODE[record.abbrev] || record.abbrev;
      const team = teams.find((t) => t.nfl_team_code === ourCode);
      totalTies += record.ties;
      if (!team) {
        notFound.push(record.abbrev);
        continue;
      }
      const { error: updateError } = await supabase
        .from("teams")
        .update({ wins: record.wins, updated_at: new Date().toISOString() })
        .eq("id", team.id);
      if (updateError) throw updateError;
      updatedCount += 1;
    }

    // Each tied game involves two teams, so divide the summed tie count by 2.
    const tiedGames = Math.round(totalTies / 2);
    const totalDecidedGames = 272 - tiedGames;
    const { error: leagueError } = await supabase
      .from("leagues")
      .update({ total_decided_games: totalDecidedGames })
      .eq("id", leagueId);
    if (leagueError) throw leagueError;

    return res.status(200).json({
      updatedTeams: updatedCount,
      totalDecidedGames,
      notFound,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
