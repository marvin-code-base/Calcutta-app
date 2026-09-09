import { useEffect, useState } from "react";
import {
  createLeague,
  updateLeagueConfig,
  lockLeague,
  searchLeagues,
  verifyJoinPassword,
  claimHostPassword,
  verifyHostPassword,
  getLeague,
} from "./db.js";
import { ROUND_TIERS, validateConfig } from "./scoring.js";
import { validateIncrementRules } from "./auctionRules.js";
import { ROUND_LABELS } from "./nflTeams.js";

const hostKey = (leagueId) => `calcutta_host_${leagueId}`;

export default function Settings({ league, entries, onLeagueUpdate, onLeagueSelected, onLeaveLeague }) {
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

  // ---- No league selected: search or create ----
  const [name, setName] = useState("");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [createJoinPw, setCreateJoinPw] = useState("");
  const [createHostPw, setCreateHostPw] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [joiningResult, setJoiningResult] = useState(null);
  const [joinPwInput, setJoinPwInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  // ---- Host gate + settings (hooks declared unconditionally, even though
  // this state only matters once a league is selected — React requires the
  // same hooks in the same order on every render of this component) ----
  const [isHost, setIsHost] = useState(
    () => (league ? localStorage.getItem(hostKey(league.id)) === "true" : false)
  );
  useEffect(() => {
    if (league) setIsHost(localStorage.getItem(hostKey(league.id)) === "true");
  }, [league?.id]);

  const [hostPwInput, setHostPwInput] = useState("");
  const [hostError, setHostError] = useState("");
  const [hostBusy, setHostBusy] = useState(false);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setSearchError("");
    setSearching(true);
    setResults([]);
    setJoiningResult(null);
    try {
      const found = await searchLeagues(query.trim());
      setResults(found);
      if (found.length === 0) setSearchError("No pools found with that name.");
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function startJoin(result) {
    setJoiningResult(result);
    setJoinPwInput("");
    setJoinError("");
  }

  async function handleJoinSubmit(e) {
    e.preventDefault();
    setJoinError("");
    setJoining(true);
    try {
      const ok = await verifyJoinPassword(joiningResult.id, joinPwInput);
      if (!ok) {
        setJoinError("Wrong password.");
        return;
      }
      const full = await getLeague(joiningResult.id);
      onLeagueSelected(full);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    if (!createJoinPw || !createHostPw) {
      setCreateError("Set both a password to share with friends and a host password.");
      return;
    }
    setCreating(true);
    try {
      const created = await createLeague({
        name,
        seasonYear: Number(seasonYear),
        joinPassword: createJoinPw,
        hostPassword: createHostPw,
      });
      localStorage.setItem(hostKey(created.id), "true");
      onLeagueSelected(created);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (!league) {
    return (
      <div>
        {intro}
        <div className="card">
          <h2>Find your league</h2>
          <form onSubmit={handleSearch}>
            <label htmlFor="league-search">Pool name</label>
            <input
              id="league-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. The Boys Calcutta"
            />
            <button className="primary" type="submit" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          {searchError && <p className="negative">{searchError}</p>}
          {results.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span>
                    {r.name} <span className="subtitle">· {r.season_year}</span>
                  </span>
                  <button className="secondary" onClick={() => startJoin(r)}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
          {joiningResult && (
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
              <p className="subtitle" style={{ margin: "0 0 0.5rem" }}>
                Enter the password for "{joiningResult.name}"
              </p>
              <form onSubmit={handleJoinSubmit}>
                <input
                  type="password"
                  value={joinPwInput}
                  onChange={(e) => setJoinPwInput(e.target.value)}
                  placeholder="Pool password"
                  autoFocus
                />
                <button className="primary" type="submit" disabled={joining} style={{ marginRight: "0.5rem" }}>
                  {joining ? "Joining…" : "Join"}
                </button>
                <button className="secondary" type="button" onClick={() => setJoiningResult(null)}>
                  Cancel
                </button>
              </form>
              {joinError && <p className="negative">{joinError}</p>}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Or create a new pool</h2>
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
            <label htmlFor="join-pw">Password to share with friends</label>
            <input
              id="join-pw"
              type="password"
              value={createJoinPw}
              onChange={(e) => setCreateJoinPw(e.target.value)}
              required
            />
            <label htmlFor="host-pw">Host password (keep this one to yourself)</label>
            <input
              id="host-pw"
              type="password"
              value={createHostPw}
              onChange={(e) => setCreateHostPw(e.target.value)}
              required
            />
            <button className="primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create pool"}
            </button>
          </form>
          {createError && <p className="negative">{createError}</p>}
        </div>
      </div>
    );
  }

  // ---- A league is selected: host gate + settings ----

  async function handleClaimHost(e) {
    e.preventDefault();
    setHostError("");
    setHostBusy(true);
    try {
      const updated = await claimHostPassword(league.id, hostPwInput);
      localStorage.setItem(hostKey(league.id), "true");
      setIsHost(true);
      onLeagueUpdate(updated);
    } catch (err) {
      setHostError(err.message);
    } finally {
      setHostBusy(false);
    }
  }

  async function handleEnterHost(e) {
    e.preventDefault();
    setHostError("");
    setHostBusy(true);
    try {
      const ok = await verifyHostPassword(league.id, hostPwInput);
      if (!ok) {
        setHostError("Wrong password.");
        return;
      }
      localStorage.setItem(hostKey(league.id), "true");
      setIsHost(true);
    } catch (err) {
      setHostError(err.message);
    } finally {
      setHostBusy(false);
    }
  }

  const locked = league.locked;
  const canEdit = isHost && !locked;

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
      if (updates.joinPassword !== undefined) {
        dbUpdates.join_password = updates.joinPassword;
      }
      if (updates.hostPassword !== undefined) {
        dbUpdates.host_password = updates.hostPassword;
      }
      const updated = await updateLeagueConfig(league.id, dbUpdates);
      onLeagueUpdate(updated);
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
      onLeagueUpdate(updated);
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
        <p className="subtitle" style={{ margin: 0 }}>
          {league.name} · Season {league.season_year} —{" "}
          <span style={{ textDecoration: "underline", cursor: "pointer" }} onClick={onLeaveLeague}>
            not your league? search again
          </span>
        </p>
      </div>

      {!isHost && (
        <div className="card">
          <h2>{league.host_password ? "Host access" : "Claim host"}</h2>
          {league.host_password ? (
            <>
              <p className="subtitle">Only the host can change settings. Enter the host password to unlock editing.</p>
              <form onSubmit={handleEnterHost}>
                <input
                  type="password"
                  value={hostPwInput}
                  onChange={(e) => setHostPwInput(e.target.value)}
                  placeholder="Host password"
                />
                <button className="primary" type="submit" disabled={hostBusy}>
                  Unlock settings
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="subtitle">No one has claimed host for this league yet. Set a password to become host.</p>
              <form onSubmit={handleClaimHost}>
                <input
                  type="password"
                  value={hostPwInput}
                  onChange={(e) => setHostPwInput(e.target.value)}
                  placeholder="Set host password"
                />
                <button className="primary" type="submit" disabled={hostBusy}>
                  Become host
                </button>
              </form>
            </>
          )}
          {hostError && <p className="negative">{hostError}</p>}
        </div>
      )}

      <div className="card">
        <h2>
          {league.name}
          {locked && <span className="locked-badge">Locked</span>}
        </h2>
        <p className="subtitle">Season {league.season_year}</p>

        {isHost && (
          <>
            <label htmlFor="join-pw-edit">Password to share with friends</label>
            <input
              id="join-pw-edit"
              type="text"
              defaultValue={league.join_password}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== league.join_password) handleFieldSave({ joinPassword: v });
              }}
            />
            <label htmlFor="host-pw-edit">Host password</label>
            <input
              id="host-pw-edit"
              type="text"
              defaultValue={league.host_password}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== league.host_password) handleFieldSave({ hostPassword: v });
              }}
            />
          </>
        )}

        <label htmlFor="reg-pct">Regular-season pool share (playoff gets the rest)</label>
        <input
          id="reg-pct"
          type="number"
          step="0.01"
          min="0"
          max="1"
          disabled={!canEdit}
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
          disabled={!canEdit}
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
          disabled={!canEdit}
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
          disabled={!canEdit}
          defaultValue={league.bid_cap ?? ""}
          onBlur={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? null : Number(raw);
            if (v !== league.bid_cap) handleFieldSave({ bidCap: v });
          }}
        />

        {canEdit && !locked && (
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
                    disabled={!canEdit || i === 0}
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
                    disabled={!canEdit}
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
                  {canEdit && i !== 0 && (
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
        {canEdit && (
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
                    disabled={!canEdit}
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
