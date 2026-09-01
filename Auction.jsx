import { useEffect, useState } from "react";
import {
  getTeams,
  startAuction,
  placeBid,
  sellCurrentTeam,
  cancelAuction,
  subscribeToLeagueTeams,
} from "./db.js";
import { minimumNextBid, isValidBid } from "./auctionRules.js";
import { NFL_TEAMS } from "./nflTeams.js";

const IDENTITY_KEY = "calcutta_my_entry_id";

export default function Auction({ league, teams, entries, onTeamsChange }) {
  const [myEntryId, setMyEntryId] = useState(
    () => localStorage.getItem(IDENTITY_KEY) || ""
  );
  const [bidValue, setBidValue] = useState("");
  const [message, setMessage] = useState("");
  const [pendingTeamToStart, setPendingTeamToStart] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToLeagueTeams(league.id, async () => {
      const refreshed = await getTeams(league.id);
      onTeamsChange(refreshed);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id]);

  function handleChooseIdentity(entryId) {
    localStorage.setItem(IDENTITY_KEY, entryId);
    setMyEntryId(entryId);
  }

  if (!myEntryId || !entries.find((e) => e.id === myEntryId)) {
    return (
      <div className="card">
        <h2>Who are you?</h2>
        {entries.length === 0 ? (
          <div className="empty-state">
            No bidders added yet — add names in the Bidders tab first.
          </div>
        ) : (
          <>
            <p className="subtitle">Pick your name to place bids from this phone.</p>
            {entries.map((entry) => (
              <button
                key={entry.id}
                className="secondary"
                style={{ marginRight: "0.5rem", marginBottom: "0.5rem" }}
                onClick={() => handleChooseIdentity(entry.id)}
              >
                {entry.owner_name}
              </button>
            ))}
          </>
        )}
      </div>
    );
  }

  const me = entries.find((e) => e.id === myEntryId);
  const activeTeam = teams.find((t) => t.auction_status === "active");
  const pendingTeams = teams.filter((t) => t.auction_status === "pending");
  const teamName = (code) => NFL_TEAMS.find((t) => t.code === code)?.name ?? code;
  const entryName = (id) => entries.find((e) => e.id === id)?.owner_name ?? "—";

  const minBid = activeTeam
    ? minimumNextBid(activeTeam.current_bid, Number(league.starting_bid), league.increment_rules)
    : null;

  async function handlePlaceBid(e) {
    e.preventDefault();
    setMessage("");
    const amount = Number(bidValue);
    if (!amount) return;
    if (!isValidBid(amount, activeTeam.current_bid, Number(league.starting_bid), league.increment_rules)) {
      setMessage(`Bid must be at least $${minBid}.`);
      return;
    }
    try {
      const result = await placeBid(activeTeam.id, myEntryId, amount, activeTeam.current_bid);
      if (!result) {
        setMessage("Someone else's bid landed first — check the new high bid and try again.");
      } else {
        setBidValue("");
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleStart() {
    if (!pendingTeamToStart) return;
    await startAuction(pendingTeamToStart);
    setPendingTeamToStart("");
  }

  async function handleSell() {
    if (!activeTeam?.current_bidder_entry_id) return;
    if (!confirm(`Sell ${teamName(activeTeam.nfl_team_code)} to ${entryName(activeTeam.current_bidder_entry_id)} for $${activeTeam.current_bid}?`)) return;
    await sellCurrentTeam(activeTeam.id, activeTeam.current_bidder_entry_id, activeTeam.current_bid);
  }

  async function handleCancel() {
    if (!confirm("Cancel this team's auction with no sale?")) return;
    await cancelAuction(activeTeam.id);
  }

  return (
    <div>
      <div className="card">
        <p className="subtitle" style={{ margin: 0 }}>Bidding as {me.owner_name}</p>
      </div>

      <div className="card">
        <h2>Live bidding</h2>
        {!activeTeam ? (
          <div className="empty-state">Waiting for the next team to go up for bid.</div>
        ) : (
          <>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", margin: "0 0 0.25rem" }}>
              {teamName(activeTeam.nfl_team_code)}
            </p>
            <p className="subtitle">
              {activeTeam.current_bid
                ? `High bid: $${activeTeam.current_bid} (${entryName(activeTeam.current_bidder_entry_id)})`
                : "No bids yet"}
            </p>
            <form onSubmit={handlePlaceBid}>
              <input
                type="number"
                step="1"
                value={bidValue}
                onChange={(e) => setBidValue(e.target.value)}
                placeholder={`Minimum bid $${minBid}`}
              />
              <button className="primary" type="submit">Place bid</button>
            </form>
            {message && <p className="negative">{message}</p>}
          </>
        )}
      </div>

      <div className="card">
        <h2>Host controls</h2>
        {!activeTeam ? (
          pendingTeams.length === 0 ? (
            <div className="empty-state">All teams have been auctioned.</div>
          ) : (
            <>
              <label htmlFor="start-team">Team to put up for bid</label>
              <select
                id="start-team"
                value={pendingTeamToStart}
                onChange={(e) => setPendingTeamToStart(e.target.value)}
              >
                <option value="">Choose a team…</option>
                {pendingTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamName(t.nfl_team_code)}
                  </option>
                ))}
              </select>
              <button className="primary" onClick={handleStart} disabled={!pendingTeamToStart}>
                Start auction
              </button>
            </>
          )
        ) : (
          <>
            <button
              className="primary"
              onClick={handleSell}
              disabled={!activeTeam.current_bidder_entry_id}
              style={{ marginRight: "0.5rem" }}
            >
              Sell to high bidder
            </button>
            <button className="secondary" onClick={handleCancel}>
              Cancel (no sale)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
