/**
 * Data-access layer. This is the ONLY file that should import supabaseClient
 * directly — every other part of the app (UI, scoring engine) goes through
 * these functions instead. Two payoffs:
 *   1. Swapping database hosts later means editing this one file.
 *   2. Wrapping the UI in a native shell (React Native/Capacitor) later
 *      means the UI can keep calling these same functions unchanged.
 */
import { supabase } from "./supabaseClient.js";

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
  return data;
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
