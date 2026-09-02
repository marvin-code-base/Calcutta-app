import { useState } from "react";
import { createEntry, getEntries } from "./db.js";

export default function Entries({ league, entries, onEntriesChange }) {
  const [ownerName, setOwnerName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <div>
      <div className="card">
        <h2>Add a bidder</h2>
        <p className="subtitle">
          Add everyone's name here before the auction — they'll each claim
          their own name and set a PIN on the Auction tab.
        </p>
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
                  <td>
                    {entry.owner_name}
                    {!entry.pin_code && (
                      <span className="subtitle" style={{ fontSize: "0.7rem", display: "block" }}>
                        no PIN set yet
                      </span>
                    )}
                  </td>
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
