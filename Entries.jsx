import { useState } from "react";
import { createEntry, recordBid, getEntries } from "./db.js";
import { NFL_TEAMS } from "./nflTeams.js";
import { isWithinBidCap } from "./auctionRules.js";

export default function Entries({ league, teams, entries, onEntriesChange }) {
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [bidEntryId, setBidEntryId] = useState("");
  const [bidTeamId, setBidTeamId] = useState("");
  const [bidAmount, setBidAmount] = useState("");

  const wonTeamIds = new Set(
    entries.flatMap((e) => e.bids.map((b) => b.team_id))
  );
  const availableTeams = teams.filter((t) => !wonTeamIds.has(t.id));

  async function refresh() {
    const refreshed = await getEntries(league.id);
    onEntriesChange(refreshed);
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!ownerName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createEntry(league.id, ownerName.trim());
      setOwnerName("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBid(e) {
    e.preventDefault();
    if (!bidEntryId || !bidTeamId || !bidAmount) return;
    const targetEntry = entries.find((en) => en.id === bidEntryId);
    const currentTotal = targetEntry
      ? targetEntry.bids.reduce((s, b) => s + Number(b.bid_amount), 0)
      : 0;
    if (!isWithinBidCap(currentTotal, Number(bidAmount), league.bid_cap)) {
      setError(`That would put ${targetEntry.owner_name} over the $${league.bid_cap} cap.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await recordBid(bidEntryId, bidTeamId, Number(bidAmount));
      setBidTeamId("");
      setBidAmount("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Add a bidder</h2>
        <form onSubmit={handleAddEntry}>
          <label htmlFor="owner-name">Name</label>
          <input
            id="owner-name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Dave"
          />
          <button className="primary" type="submit" disabled={saving}>
            Add bidder
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Record a bid</h2>
        {teams.length === 0 || entries.length === 0 ? (
          <div className="empty-state">
            Add at least one team and one bidder first.
          </div>
        ) : (
          <form onSubmit={handleAddBid}>
            <label htmlFor="bid-entry">Bidder</label>
            <select
              id="bid-entry"
              value={bidEntryId}
              onChange={(e) => setBidEntryId(e.target.value)}
            >
              <option value="">Choose a bidder…</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.owner_name}
                </option>
              ))}
            </select>

            <label htmlFor="bid-team">Team</label>
            <select
              id="bid-team"
              value={bidTeamId}
              onChange={(e) => setBidTeamId(e.target.value)}
            >
              <option value="">Choose a team…</option>
              {availableTeams.map((team) => {
                const meta = NFL_TEAMS.find((t) => t.code === team.nfl_team_code);
                return (
                  <option key={team.id} value={team.id}>
                    {meta ? meta.name : team.nfl_team_code}
                  </option>
                );
              })}
            </select>

            <label htmlFor="bid-amount">Winning bid ($)</label>
            <input
              id="bid-amount"
              type="number"
              min="0"
              step="0.01"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />

            <button className="primary" type="submit" disabled={saving}>
              Record bid
            </button>
          </form>
        )}
        {error && <p className="negative">{error}</p>}
      </div>

      <div className="card">
        <h2>Bidders</h2>
        {entries.length === 0 ? (
          <div className="empty-state">No bidders added yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Teams owned</th>
                <th className="num">Total bid</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.owner_name}</td>
                  <td>
                    {entry.bids
                      .map((b) => b.teams?.nfl_team_code)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="num">
                    $
                    {entry.bids
                      .reduce((sum, b) => sum + Number(b.bid_amount), 0)
                      .toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
