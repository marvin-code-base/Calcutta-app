import { useState } from "react";
import {
  computePlayoffShares,
  computeRegularSeasonShares,
  computeTeamRoi,
  ROUND_TIERS,
} from "./scoring.js";
import { updateTeamResult, getTeams } from "./db.js";
import { NFL_TEAMS, ROUND_LABELS } from "./nflTeams.js";

export default function Dashboard({ league, teams, entries, onTeamsChange }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

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

  async function handleRoundChange(team, furthestRound) {
    await updateTeamResult(team.id, { wins: team.wins, furthestRound });
    const refreshed = await getTeams(league.id);
    onTeamsChange(refreshed);
  }

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

  const teamName = (code) => NFL_TEAMS.find((t) => t.code === code)?.name ?? code;

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: 0 }}>Total pot: ${jackpot.toFixed(2)}</h2>
      </div>

      <div className="card">
        <button className="secondary" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync regular-season results (wins) now"}
        </button>
        {syncMessage && <p className="subtitle" style={{ marginTop: "0.5rem" }}>{syncMessage}</p>}
        <p className="subtitle" style={{ marginBottom: 0 }}>
          Pulls current NFL win totals automatically. Playoff round still
          needs to be set by hand below once the postseason starts.
        </p>
      </div>

      {entries.map((entry) => {
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
        const aggregateRoi = totalBid > 0 ? totalWonBack / totalBid : 0;

        return (
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
                {rows.map((row) => (
                  <tr key={row.team?.id}>
                    <td>
                      {row.team ? teamName(row.team.nfl_team_code) : "—"}
                      {row.team && (row.team.reg_season_over_under || row.team.super_bowl_odds) && (
                        <div className="subtitle" style={{ fontSize: "0.7rem" }}>
                          {row.team.reg_season_over_under ? `O/U ${row.team.reg_season_over_under}` : ""}
                          {row.team.reg_season_over_under && row.team.super_bowl_odds ? " · " : ""}
                          {row.team.super_bowl_odds ? `SB ${row.team.super_bowl_odds}` : ""}
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
                ))}
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
        );
      })}
    </div>
  );
}
