import { useState } from "react";
import { getTeams, addTeam, updateTeamResult } from "./db.js";
import { NFL_TEAMS, ROUND_LABELS } from "./nflTeams.js";
import { ROUND_TIERS } from "./scoring.js";

export default function Teams({ league, teams, onTeamsChange }) {
  const [selectedCode, setSelectedCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addedCodes = new Set(teams.map((t) => t.nfl_team_code));
  const available = NFL_TEAMS.filter((t) => !addedCodes.has(t.code));

  async function handleAdd(e) {
    e.preventDefault();
    if (!selectedCode) return;
    setSaving(true);
    setError("");
    try {
      await addTeam(league.id, selectedCode);
      const refreshed = await getTeams(league.id);
      onTeamsChange(refreshed);
      setSelectedCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResultChange(team, updates) {
    setError("");
    try {
      await updateTeamResult(team.id, {
        wins: updates.wins ?? team.wins,
        furthestRound: updates.furthestRound ?? team.furthest_round,
      });
      const refreshed = await getTeams(league.id);
      onTeamsChange(refreshed);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Add teams to the pool</h2>
        <form onSubmit={handleAdd}>
          <label htmlFor="team-select">Team</label>
          <select
            id="team-select"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            <option value="">Choose a team…</option>
            {available.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="primary" type="submit" disabled={!selectedCode || saving}>
            Add team
          </button>
        </form>
        {error && <p className="negative">{error}</p>}
      </div>

      <div className="card">
        <h2>Results</h2>
        {teams.length === 0 ? (
          <div className="empty-state">No teams added yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th className="num">Wins</th>
                <th>Furthest round</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const meta = NFL_TEAMS.find((t) => t.code === team.nfl_team_code);
                return (
                  <tr key={team.id}>
                    <td>{meta ? meta.name : team.nfl_team_code}</td>
                    <td className="num">
                      <input
                        style={{ marginBottom: 0, textAlign: "right", width: "4.5rem" }}
                        type="number"
                        min="0"
                        max="17"
                        defaultValue={team.wins}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== team.wins) handleResultChange(team, { wins: v });
                        }}
                      />
                    </td>
                    <td>
                      <select
                        defaultValue={team.furthest_round}
                        onChange={(e) =>
                          handleResultChange(team, { furthestRound: e.target.value })
                        }
                      >
                        {ROUND_TIERS.map((tier) => (
                          <option key={tier} value={tier}>
                            {ROUND_LABELS[tier]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
