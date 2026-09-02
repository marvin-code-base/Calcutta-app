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

export async function createLeague({ name, seasonYear }) {
  const { data, error } = await supabase
    .from("leagues")
    .insert({ name, season_year: seasonYear })
    .select()
    .single();
  if (error) throw error;

  const { error: teamsError } = await supabase
    .from("teams")
    .insert(NFL_TEAMS.map((t) => ({ league_id: data.id, nfl_team_code: t.code })));
  if (teamsError) throw teamsError;

  return data;
}

export async function updateTeamOdds(teamId, { regSeasonOverUnder, superBowlOdds }) {
  const { data, error } = await supabase
    .from("teams")
    .update({
      reg_season_over_under: regSeasonOverUnder,
      super_bowl_odds: superBowlOdds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw error;
  return data;
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

export async function sellCurrentTeam(teamId, entryId, amount) {
  const { error: teamError } = await supabase
    .from("teams")
    .update({ auction_status: "sold" })
    .eq("id", teamId);
  if (teamError) throw teamError;
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

export async function recordBid(entryId, teamId, bidAmount) {
  const { data, error } = await supabase
    .from("bids")
    .insert({ entry_id: entryId, team_id: teamId, bid_amount: bidAmount })
    .select()
    .single();
  if (error) throw error;
  return data;
}
