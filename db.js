/**
 * Data-access layer. This is the ONLY file that should import supabaseClient
 * directly — every other part of the app (UI, scoring engine) goes through
 * these functions instead. Two payoffs:
 *   1. Swapping database hosts later means editing this one file.
 *   2. Wrapping the UI in a native shell (React Native/Capacitor) later
 *      means the UI can keep calling these same functions unchanged.
 */
import { supabase } from "./supabaseClient.js";
import { NFL_TEAMS } from "./nflTeams.js";

export async function getFirstLeague() {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createLeague({ name, seasonYear, joinPassword, hostPassword }) {
  const { data, error } = await supabase
    .from("leagues")
    .insert({
      name,
      season_year: seasonYear,
      join_password: joinPassword || "",
      host_password: hostPassword || "",
    })
    .select()
    .single();
  if (error) throw error;

  const { error: teamsError } = await supabase
    .from("teams")
    .insert(NFL_TEAMS.map((t) => ({ league_id: data.id, nfl_team_code: t.code })));
  if (teamsError) throw teamsError;

  return data;
}

export async function searchLeagues(query) {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, season_year")
    .ilike("name", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

/** Blank stored password (legacy leagues from before this feature) means open — anyone can join. */
export async function verifyJoinPassword(leagueId, password) {
  const { data, error } = await supabase
    .from("leagues")
    .select("join_password")
    .eq("id", leagueId)
    .single();
  if (error) throw error;
  return !data.join_password || data.join_password === password;
}

/**
 * Claims host for a league whose host_password is still blank — first
 * come, first served. Fails harmlessly if someone else claimed it a moment
 * earlier (the .eq("host_password", "") guard means zero rows come back).
 */
export async function claimHostPassword(leagueId, password) {
  const { data, error } = await supabase
    .from("leagues")
    .update({ host_password: password })
    .eq("id", leagueId)
    .eq("host_password", "")
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Someone already claimed host for this league — ask them for the host password.");
  }
  return data[0];
}

export async function verifyHostPassword(leagueId, password) {
  const { data, error } = await supabase
    .from("leagues")
    .select("host_password")
    .eq("id", leagueId)
    .single();
  if (error) throw error;
  return data.host_password === password;
}

/**
 * Odds are shared across every league for a given season — entered
 * directly via SQL, not through the app. Returns a map keyed by team code.
 */
export async function getTeamOdds(seasonYear) {
  const { data, error } = await supabase
    .from("team_odds")
    .select("nfl_team_code, reg_season_over_under, super_bowl_odds")
    .eq("season_year", seasonYear);
  if (error) throw error;
  const map = {};
  for (const row of data) {
    map[row.nfl_team_code] = {
      regSeasonOverUnder: row.reg_season_over_under,
      superBowlOdds: row.super_bowl_odds,
    };
  }
  return map;
}

/**
 * Subscribe to any change in a league's bids (a sale happening). Realtime
 * filters only support equality on columns of the subscribed table itself,
 * and bids doesn't carry league_id — so this listens to all bid changes and
 * lets the caller refetch its own league-scoped data. Fine at friend-group
 * scale.
 */
export function subscribeToBids(onChange) {
  const channel = supabase
    .channel("bids-all")
    .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function addTeam(leagueId, nflTeamCode) {
  const { data, error } = await supabase
    .from("teams")
    .insert({ league_id: leagueId, nfl_team_code: nflTeamCode })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function startAuction(teamId, deadline) {
  const { data, error } = await supabase
    .from("teams")
    .update({
      auction_status: "active",
      current_bid: null,
      current_bidder_entry_id: null,
      bid_deadline: deadline ?? null,
    })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Place a bid on the currently active team. expectedCurrentBid is whatever
 * the bidder last saw as the high bid (null if no bids yet) — the update
 * only succeeds if the row still matches that, which prevents two people's
 * simultaneous bids from silently overwriting each other. If someone else's
 * bid landed first, this returns null so the UI can refetch and show the
 * new high bid instead of a false success. newDeadline (if the league uses
 * a bid timer) extends the countdown on a successful bid.
 */
export async function placeBid(teamId, entryId, amount, expectedCurrentBid, newDeadline) {
  let query = supabase
    .from("teams")
    .update({
      current_bid: amount,
      current_bidder_entry_id: entryId,
      bid_deadline: newDeadline ?? null,
    })
    .eq("id", teamId)
    .eq("auction_status", "active");

  query = expectedCurrentBid === null
    ? query.is("current_bid", null)
    : query.eq("current_bid", expectedCurrentBid);

  const { data, error } = await query.select();
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function cancelAuction(teamId) {
  const { data, error } = await supabase
    .from("teams")
    .update({ auction_status: "pending", current_bid: null, current_bidder_entry_id: null })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Marks a team sold and records the winning bid — but only if the team's
 * current_bid and current_bidder_entry_id in the database still match what
 * the caller is trying to sell for. This guards against two devices (or a
 * stale screen) both trying to close out the same team with different
 * numbers; whichever request matches the true database state wins, and the
 * other safely no-ops instead of recording the wrong winner or amount.
 */
export async function sellCurrentTeam(teamId, entryId, amount) {
  const { data, error: teamError } = await supabase
    .from("teams")
    .update({ auction_status: "sold" })
    .eq("id", teamId)
    .eq("auction_status", "active")
    .eq("current_bid", amount)
    .eq("current_bidder_entry_id", entryId)
    .select();
  if (teamError) throw teamError;
  if (!data || data.length === 0) {
    // Someone else's version of "current" didn't match the database — the
    // bid must have changed (or it already got sold) between when this was
    // triggered and now. Safe to skip; the caller's next refresh will show
    // the real state.
    return null;
  }
  return recordBid(entryId, teamId, amount);
}

/**
 * Subscribe to live changes on a league's teams (bids, status changes).
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToLeagueTeams(leagueId, onChange) {
  const channel = supabase
    .channel(`teams-${leagueId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teams", filter: `league_id=eq.${leagueId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/**
 * Game-by-game results are shared across leagues for a given season, same
 * as team_odds — entered via the sync-games serverless function.
 */
export async function getGames(seasonYear) {
  const { data, error } = await supabase
    .from("games")
    .select("season_type, home_team_code, away_team_code, winner_team_code, completed")
    .eq("season_year", seasonYear);
  if (error) throw error;
  return data.map((g) => ({
    seasonType: g.season_type,
    homeTeamCode: g.home_team_code,
    awayTeamCode: g.away_team_code,
    winnerTeamCode: g.winner_team_code,
    completed: g.completed,
  }));
}

export async function getLeague(leagueId) {
  const { data, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateLeagueConfig(leagueId, updates) {
  // Callers should check league.locked before calling this — bidding-locked
  // leagues shouldn't have their scoring rules changed mid-season.
  const { data, error } = await supabase
    .from("leagues")
    .update(updates)
    .eq("id", leagueId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function lockLeague(leagueId) {
  return updateLeagueConfig(leagueId, { locked: true });
}

export async function getTeams(leagueId) {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("league_id", leagueId);
  if (error) throw error;
  return data;
}

export async function updateTeamResult(teamId, { wins, furthestRound }) {
  const { data, error } = await supabase
    .from("teams")
    .update({
      wins,
      furthest_round: furthestRound,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getEntries(leagueId) {
  const { data, error } = await supabase
    .from("entries")
    .select("*, bids(*, teams(*))")
    .eq("league_id", leagueId);
  if (error) throw error;
  return data;
}

export async function createEntry(leagueId, ownerName) {
  const { data, error } = await supabase
    .from("entries")
    .insert({ league_id: leagueId, owner_name: ownerName })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setEntryPin(entryId, pin) {
  const { data, error } = await supabase
    .from("entries")
    .update({ pin_code: pin })
    .eq("id", entryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordBid(entryId, teamId, bidAmount) {
  const { data, error } = await supabase
    .from("bids")
    .insert({ entry_id: entryId, team_id: teamId, bid_amount: bidAmount })
    .select()
    .single();
  if (error) throw error;
  return data;
}
