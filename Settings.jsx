import { useState } from "react";
import {
  createLeague,
  updateLeagueConfig,
  lockLeague,
} from "./db.js";
import { ROUND_TIERS, validateConfig } from "./scoring.js";
import { validateIncrementRules } from "./auctionRules.js";
import { ROUND_LABELS } from "./nflTeams.js";

export default function Settings({ league, entries, onLeagueChange }) {
  const [name, setName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const intro = (
    <div className="card">
      <p className="subtitle" style={{ margin: 0 }}>
        A Calcutta pool is an NFL auction: everyone bids to "own" teams, and
        payouts are split based on how those teams actually perform — some
        of the pot goes to regular-season wins, the rest to how far each
        team goes in the playoffs. See league specific settings below.
      </p>
    </div>
  );

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
      <div>
        {intro}
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
      if (updates.startingBid !== undefined) {
        dbUpdates.starting_bid = updates.startingBid;
      }
      if (updates.bidTimeoutSeconds !== undefined) {
        dbUpdates.bid_timeout_seconds = updates.bidTimeoutSeconds;
      }
      if (updates.bidCap !== undefined) {
        dbUpdates.bid_cap = updates.bidCap;
      }
      if (updates.incrementRules !== undefined) {
        dbUpdates.increment_rules = updates.incrementRules;
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
      {intro}
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

        <label htmlFor="jackpot">Total pot</label>
        <p id="jackpot" style={{ margin: "0 0 0.9rem", fontFamily: "var(--font-num)" }}>
          ${(entries ?? []).reduce(
            (sum, entry) => sum + entry.bids.reduce((s, b) => s + Number(b.bid_amount), 0),
            0
          ).toFixed(2)}
          <span className="subtitle" style={{ display: "inline", marginLeft: "0.5rem" }}>
            (adds up automatically from recorded bids)
          </span>
        </p>

        <label htmlFor="total-games">Total regular-season games decided league-wide</label>
        <p id="total-games" style={{ margin: "0 0 0.9rem", fontFamily: "var(--font-num)" }}>
          {league.total_decided_games}
          <span className="subtitle" style={{ display: "inline", marginLeft: "0.5rem" }}>
            (272 games, minus any ties — adjusts automatically once results sync)
          </span>
        </p>

        <label htmlFor="starting-bid">Starting bid ($)</label>
        <input
          id="starting-bid"
          type="number"
          step="1"
          min="0"
          disabled={locked}
          defaultValue={league.starting_bid}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== league.starting_bid) handleFieldSave({ startingBid: v });
          }}
        />

        <label htmlFor="bid-timeout">Time between bids before it sells (seconds, 0 = off)</label>
        <input
          id="bid-timeout"
          type="number"
          step="1"
          min="0"
          disabled={locked}
          defaultValue={league.bid_timeout_seconds}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== league.bid_timeout_seconds) handleFieldSave({ bidTimeoutSeconds: v });
          }}
        />

        <label htmlFor="bid-cap">Max total bids per player ($, blank = no cap)</label>
        <input
          id="bid-cap"
          type="number"
          step="1"
          min="0"
          disabled={locked}
          defaultValue={league.bid_cap ?? ""}
          onBlur={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? null : Number(raw);
            if (v !== league.bid_cap) handleFieldSave({ bidCap: v });
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
        <h2>Bid increments</h2>
        <p className="subtitle">
          Below each threshold, bids go up by that increment. The first row
          must start at $0.
        </p>
        <table>
          <thead>
            <tr>
              <th>At bid amount ($)</th>
              <th className="num">Increment ($)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {league.increment_rules.map((rule, i) => (
              <tr key={i}>
                <td>
                  <input
                    style={{ marginBottom: 0 }}
                    type="number"
                    min="0"
                    disabled={locked || i === 0}
                    defaultValue={rule.threshold}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== rule.threshold) {
                        const updated = league.increment_rules.map((r, idx) =>
                          idx === i ? { ...r, threshold: v } : r
                        );
                        try {
                          validateIncrementRules(updated);
                          handleFieldSave({ incrementRules: updated });
                        } catch (err) {
                          setError(err.message);
                        }
                      }
                    }}
                  />
                </td>
                <td className="num">
                  <input
                    style={{ marginBottom: 0, textAlign: "right" }}
                    type="number"
                    min="1"
                    disabled={locked}
                    defaultValue={rule.increment}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== rule.increment) {
                        const updated = league.increment_rules.map((r, idx) =>
                          idx === i ? { ...r, increment: v } : r
                        );
                        try {
                          validateIncrementRules(updated);
                          handleFieldSave({ incrementRules: updated });
                        } catch (err) {
                          setError(err.message);
                        }
                      }
                    }}
                  />
                </td>
                <td>
                  {!locked && i !== 0 && (
                    <button
                      className="secondary"
                      onClick={() => {
                        const updated = league.increment_rules.filter((_, idx) => idx !== i);
                        handleFieldSave({ incrementRules: updated });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!locked && (
          <button
            className="secondary"
            onClick={() => {
              const lastThreshold =
                league.increment_rules[league.increment_rules.length - 1]?.threshold ?? 0;
              const updated = [
                ...league.increment_rules,
                { threshold: lastThreshold + 10, increment: 1 },
              ];
              handleFieldSave({ incrementRules: updated });
            }}
          >
            Add threshold
          </button>
        )}
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
            {ROUND_TIERS.filter((t) => t !== "none" && t !== "tbd").map((tier) => (
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
