import {
  computePlayoffShares,
  computeRegularSeasonShares,
  computeTeamRoi,
} from "./scoring.js";
import { NFL_TEAMS } from "./nflTeams.js";

export default function Dashboard({ league, teams, entries }) {
  if (teams.length === 0 || entries.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          Add teams and record bids to see ROI here.
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
  const hasGameCount = Boolean(league.total_decided_games);
  const regularSeasonShares = hasGameCount
    ? computeRegularSeasonShares(scoringTeams, league.total_decided_games)
    : Object.fromEntries(teams.map((t) => [t.id, 0]));

  const config = {
    playoffPoolPct: league.playoff_pool_pct,
    regularSeasonPoolPct: league.regular_season_pool_pct,
  };
  const jackpot = Number(league.jackpot) || 0;

  const teamName = (code) => NFL_TEAMS.find((t) => t.code === code)?.name ?? code;

  return (
    <div>
      {!hasGameCount && (
        <div className="card">
          <p className="subtitle" style={{ margin: 0 }}>
            Set "Total regular-season games decided" in Settings to include
            regular-season payouts here — playoff ROI is shown below in the
            meantime.
          </p>
        </div>
      )}

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
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team?.id}>
                    <td>{row.team ? teamName(row.team.nfl_team_code) : "—"}</td>
                    <td className="num">${row.bidAmount.toFixed(2)}</td>
                    <td className="num">${row.wonBack.toFixed(2)}</td>
                    <td className={`num ${row.roiPct >= 1 ? "positive" : "negative"}`}>
                      {(row.roiPct * 100).toFixed(0)}%
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
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}
