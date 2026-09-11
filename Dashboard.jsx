import { useState } from "react";
import {
  computePlayoffShares,
  computeRegularSeasonShares,
  computeTeamRoi,
  ROUND_TIERS,
} from "./scoring.js";
import { computeGameBasedHeadToHead } from "./gameLedger.js";
import { updateTeamResult, getTeams } from "./db.js";
import { NFL_TEAMS, ROUND_LABELS } from "./nflTeams.js";

export default function Dashboard({ league, teams, entries, odds, games, onTeamsChange, onGamesSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncingGames, setSyncingGames] = useState(false);
  const [syncGamesMessage, setSyncGamesMessage] = useState("");

  async function handleSync() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/sync-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Sync failed");
      setSyncMessage(
        `Synced ${result.updatedTeams} teams · ${result.totalDecidedGames} games decided so far.`
      );
      const refreshed = await getTeams(league.id);
      onTeamsChange(refreshed);
    } catch (err) {
      setSyncMessage(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncGames() {
    setSyncingGames(true);
    setSyncGamesMessage("");
    try {
      const res = await fetch("/api/sync-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Sync failed");
      setSyncGamesMessage(
        `Synced ${result.totalGames} games · ${result.completedGames} completed so far.`
      );
      await onGamesSynced();
    } catch (err) {
      setSyncGamesMessage(`Sync failed: ${err.message}`);
    } finally {
      setSyncingGames(false);
    }
  }

  async function handleRoundChange(team, furthestRound) {
    await updateTeamResult(team.id, { wins: team.wins, furthestRound });
    const refreshed = await getTeams(league.id);
    onTeamsChange(refreshed);
  }

  const teamName = (code) => NFL_TEAMS.find((t) => t.code === code)?.name ?? code;

  if (teams.length === 0 || entries.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          Once bids are recorded, ROI shows up here.
        </div>
      </div>
    );
  }

  const scoringTeams = teams.map((t) => ({
    id: t.id,
    furthestRound: t.furthest_round,
    wins: t.wins,
  }));

  const playoffShares = computePlayoffShares(scoringTeams, league.round_weights);
  const regularSeasonShares = computeRegularSeasonShares(
    scoringTeams,
    league.total_decided_games
  );

  const config = {
    playoffPoolPct: league.playoff_pool_pct,
    regularSeasonPoolPct: league.regular_season_pool_pct,
  };
  // The pot is whatever's actually been bid so far, not a manually-set number —
  // this keeps ROI accurate in real time as the auction progresses.
  const jackpot = entries.reduce(
    (sum, entry) => sum + entry.bids.reduce((s, b) => s + Number(b.bid_amount), 0),
    0
  );

  const entrySummaries = entries.map((entry) => {
    const rows = entry.bids.map((bid) => {
      const team = teams.find((t) => t.id === bid.team_id);
      const { wonBack, roiPct } = computeTeamRoi(
        { teamId: bid.team_id, bidAmount: Number(bid.bid_amount) },
        playoffShares[bid.team_id] ?? 0,
        regularSeasonShares[bid.team_id] ?? 0,
        config,
        jackpot
      );
      return { team, bidAmount: Number(bid.bid_amount), wonBack, roiPct };
    });
    const totalBid = rows.reduce((s, r) => s + r.bidAmount, 0);
    const totalWonBack = rows.reduce((s, r) => s + r.wonBack, 0);
    return {
      entry,
      rows,
      totalBid,
      totalWonBack,
      aggregateRoi: totalBid > 0 ? totalWonBack / totalBid : 0,
    };
  });

  // Gross head-to-head: who's won money from who, based on actual game
  // matchups (not just net profit/loss) — see gameLedger.js for the rules.
  const teamCodeToEntryId = {};
  const teamCodeToFurthestRound = {};
  for (const team of teams) {
    teamCodeToFurthestRound[team.nfl_team_code] = team.furthest_round;
  }
  for (const entry of entries) {
    for (const bid of entry.bids) {
      const team = teams.find((t) => t.id === bid.team_id);
      if (team) teamCodeToEntryId[team.nfl_team_code] = entry.id;
    }
  }
  const headToHead = computeGameBasedHeadToHead({
    games,
    teamCodeToEntryId,
    teamCodeToFurthestRound,
    roundWeights: league.round_weights,
    playoffPoolPct: league.playoff_pool_pct,
    regularSeasonPoolPct: league.regular_season_pool_pct,
    jackpot,
    totalDecidedGames: league.total_decided_games,
  });
  const hasAnyHeadToHeadMoney = Object.values(headToHead).some(
    (row) => Object.keys(row).length > 0
  );

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: 0 }}>Total pot: ${jackpot.toFixed(2)}</h2>
      </div>

      <div className="card">
        <h2>Head-to-head</h2>
        <p className="subtitle">
          Money won from each other bidder, based on actual games — a
          regular-season win transfers a fixed amount from the loser's
          bidder; making the playoffs spreads that credit across the
          regular-season wins that got you there; each playoff win takes an
          incremental amount from the specific opponent beaten.
        </p>
        {games.length === 0 ? (
          <p className="subtitle" style={{ marginBottom: 0 }}>
            No game results synced yet — tap below to pull this season's schedule and scores.
          </p>
        ) : !hasAnyHeadToHeadMoney ? (
          <p className="subtitle" style={{ marginBottom: 0 }}>
            No completed games between different bidders' teams yet.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Bidder</th>
                {entrySummaries.map((s) => (
                  <th key={s.entry.id} className="num">{s.entry.owner_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entrySummaries.map((rowSummary) => (
                <tr key={rowSummary.entry.id}>
                  <td>{rowSummary.entry.owner_name}</td>
                  {entrySummaries.map((colSummary) => {
                    if (rowSummary.entry.id === colSummary.entry.id) {
                      return <td key={colSummary.entry.id} className="num">—</td>;
                    }
                    const amount = headToHead[rowSummary.entry.id]?.[colSummary.entry.id];
                    if (!amount) {
                      return <td key={colSummary.entry.id} className="num">—</td>;
                    }
                    return (
                      <td
                        key={colSummary.entry.id}
                        className={`num ${amount >= 0 ? "positive" : "negative"}`}
                      >
                        {amount >= 0 ? "+" : "-"}${Math.abs(amount).toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="secondary" onClick={handleSyncGames} disabled={syncingGames} style={{ marginTop: "0.75rem" }}>
          {syncingGames ? "Syncing…" : "Sync game results now"}
        </button>
        {syncGamesMessage && <p className="subtitle" style={{ marginTop: "0.5rem", marginBottom: 0 }}>{syncGamesMessage}</p>}
      </div>

      <div className="card">
        <button className="secondary" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync regular-season results (wins) now"}
        </button>
        {syncMessage && <p className="subtitle" style={{ marginTop: "0.5rem" }}>{syncMessage}</p>}
        <p className="subtitle" style={{ marginBottom: 0 }}>
          Pulls current NFL win totals for the ROI table below. Playoff round
          still needs to be set by hand once the postseason starts.
        </p>
      </div>

      {entrySummaries.map(({ entry, rows, totalBid, totalWonBack, aggregateRoi }) => (
        <div className="card" key={entry.id}>
          <h2>{entry.owner_name}</h2>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Bid</th>
                <th className="num">Won back</th>
                <th className="num">ROI</th>
                <th>Playoff round</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const teamOdds = row.team ? odds?.[row.team.nfl_team_code] : null;
                return (
                  <tr key={row.team?.id}>
                    <td>
                      {row.team ? teamName(row.team.nfl_team_code) : "—"}
                      {teamOdds && (teamOdds.regSeasonOverUnder || teamOdds.superBowlOdds) && (
                        <div className="subtitle" style={{ fontSize: "0.7rem" }}>
                          {teamOdds.regSeasonOverUnder ? `O/U ${teamOdds.regSeasonOverUnder}` : ""}
                          {teamOdds.regSeasonOverUnder && teamOdds.superBowlOdds ? " · " : ""}
                          {teamOdds.superBowlOdds ? `SB ${teamOdds.superBowlOdds}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="num">${row.bidAmount.toFixed(2)}</td>
                    <td className="num">${row.wonBack.toFixed(2)}</td>
                    <td className={`num ${row.roiPct >= 1 ? "positive" : "negative"}`}>
                      {(row.roiPct * 100).toFixed(0)}%
                    </td>
                    <td>
                      {row.team && (
                        <select
                          defaultValue={row.team.furthest_round}
                          onChange={(e) => handleRoundChange(row.team, e.target.value)}
                        >
                          {ROUND_TIERS.map((tier) => (
                            <option key={tier} value={tier}>
                              {ROUND_LABELS[tier]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th className="num">${totalBid.toFixed(2)}</th>
                <th className="num">${totalWonBack.toFixed(2)}</th>
                <th className={`num ${aggregateRoi >= 1 ? "positive" : "negative"}`}>
                  {(aggregateRoi * 100).toFixed(0)}%
                </th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
    </div>
  );
}
