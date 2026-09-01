import { useState } from "react";
import {
  createLeague,
  updateLeagueConfig,
  lockLeague,
} from "./db.js";
import { ROUND_TIERS, validateConfig } from "./scoring.js";
import { ROUND_LABELS } from "./nflTeams.js";

export default function Settings({ league, onLeagueChange }) {
  const [name, setName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!league) {
    async function handleCreate(e) {
      e.preventDefault();
      setError("");
      setSaving(true);
      try {
        const created = await createLeague({ name, seasonYear: Number(seasonYear) });
        onLeagueChange(created);
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className="card">
        <h2>Start your pool</h2>
        <form onSubmit={handleCreate}>
          <label htmlFor="league-name">Pool name</label>
          <input
            id="league-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Boys Calcutta"
            required
          />
          <label htmlFor="season-year">Season year</label>
          <input
            id="season-year"
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(e.target.value)}
            required
          />
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create pool"}
          </button>
        </form>
        {error && <p className="negative">{error}</p>}
      </div>
    );
  }

  const locked = league.locked;

  async function handleFieldSave(updates) {
    setError("");
    setSaving(true);
    try {
      const merged = {
        regularSeasonPoolPct: league.regular_season_pool_pct,
        playoffPoolPct: league.playoff_pool_pct,
        roundWeights: league.round_weights,
        ...updates,
      };
      validateConfig(merged);
      const dbUpdates = {};
      if (updates.regularSeasonPoolPct !== undefined) {
        dbUpdates.regular_season_pool_pct = updates.regularSeasonPoolPct;
        dbUpdates.playoff_pool_pct = 1 - updates.regularSeasonPoolPct;
      }
      if (updates.roundWeights !== undefined) {
        dbUpdates.round_weights = updates.roundWeights;
      }
      if (updates.jackpot !== undefined) {
        dbUpdates.jackpot = updates.jackpot;
      }
      if (updates.totalDecidedGames !== undefined) {
        dbUpdates.total_decided_games = updates.totalDecidedGames;
      }
      const updated = await updateLeagueConfig(league.id, dbUpdates);
      onLeagueChange(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLock() {
    if (!confirm("Lock scoring rules for the rest of the season? This can't be undone.")) return;
    setSaving(true);
    try {
      const updated = await lockLeague(league.id);
      onLeagueChange(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>
          {league.name}
          {locked && <span className="locked-badge">Locked</span>}
        </h2>
        <p className="subtitle">Season {league.season_year}</p>

        <label htmlFor="reg-pct">Regular-season pool share (playoff gets the rest)</label>
        <input
          id="reg-pct"
          type="number"
          step="0.01"
          min="0"
          max="1"
          disabled={locked}
          defaultValue={league.regular_season_pool_pct}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== league.regular_season_pool_pct) handleFieldSave({ regularSeasonPoolPct: v });
          }}
        />

        <label htmlFor="jackpot">Total pot ($)</label>
        <input
          id="jackpot"
          type="number"
          step="0.01"
          min="0"
          defaultValue={league.jackpot}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== league.jackpot) handleFieldSave({ jackpot: v });
          }}
        />

        <label htmlFor="total-games">Total regular-season games decided league-wide (games minus ties)</label>
        <input
          id="total-games"
          type="number"
          min="1"
          defaultValue={league.total_decided_games ?? ""}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v && v !== league.total_decided_games) handleFieldSave({ totalDecidedGames: v });
          }}
        />

        {!locked && (
          <button className="secondary" onClick={handleLock} disabled={saving}>
            Lock scoring rules (do this once bidding opens)
          </button>
        )}
        {error && <p className="negative">{error}</p>}
      </div>

      <div className="card">
        <h2>Playoff point weights</h2>
        <p className="subtitle">
          A team's points come from the furthest round it reaches — a bye team
          and a Wild Card winner get identical points once both reach Divisional.
        </p>
        <table>
          <thead>
            <tr>
              <th>Round reached</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {ROUND_TIERS.filter((t) => t !== "none").map((tier) => (
              <tr key={tier}>
                <td>{ROUND_LABELS[tier]}</td>
                <td className="num">
                  <input
                    style={{ marginBottom: 0, textAlign: "right" }}
                    type="number"
                    min="0"
                    disabled={locked}
                    defaultValue={league.round_weights[tier]}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== league.round_weights[tier]) {
                        handleFieldSave({
                          roundWeights: { ...league.round_weights, [tier]: v },
                        });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
