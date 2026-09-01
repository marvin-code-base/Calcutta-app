import { useEffect, useRef, useState } from "react";
import {
  getTeams,
  startAuction,
  placeBid,
  sellCurrentTeam,
  cancelAuction,
  subscribeToLeagueTeams,
} from "./db.js";
import { minimumNextBid, isValidBid, secondsRemaining, computeDeadline } from "./auctionRules.js";
import { NFL_TEAMS } from "./nflTeams.js";

const IDENTITY_KEY = "calcutta_my_entry_id";

export default function Auction({ league, teams, entries, onTeamsChange }) {
  const [myEntryId, setMyEntryId] = useState(
    () => localStorage.getItem(IDENTITY_KEY) || ""
  );
  const [bidValue, setBidValue] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToLeagueTeams(league.id, async () => {
      const refreshed = await getTeams(league.id);
      onTeamsChange(refreshed);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id]);

  const [nowTick, setNowTick] = useState(() => new Date());
  const attemptedSellRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeTeamForTimer = teams.find((t) => t.auction_status === "active");
  const remaining = activeTeamForTimer
    ? secondsRemaining(activeTeamForTimer.bid_deadline, nowTick)
    : null;

  useEffect(() => {
    if (!activeTeamForTimer) return;
    if (remaining !== 0) return;
    if (!activeTeamForTimer.current_bidder_entry_id) return; // no bids yet — timer hasn't started
    const key = `${activeTeamForTimer.id}-${activeTeamForTimer.bid_deadline}`;
    if (attemptedSellRef.current === key) return;
    attemptedSellRef.current = key;
    sellCurrentTeam(
      activeTeamForTimer.id,
      activeTeamForTimer.current_bidder_entry_id,
      activeTeamForTimer.current_bid
    ).catch(() => {
      // Another connected phone already sold it — safe to ignore.
    });
  }, [activeTeamForTimer, remaining]);

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
      const newDeadline =
        Number(league.bid_timeout_seconds) > 0
          ? computeDeadline(Number(league.bid_timeout_seconds))
          : null;
      const result = await placeBid(activeTeam.id, myEntryId, amount, activeTeam.current_bid, newDeadline);
      if (!result) {
        setMessage("Someone else's bid landed first — check the new high bid and try again.");
      } else {
        setBidValue("");
      }
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleDraw() {
    if (pendingTeams.length === 0) return;
    const randomTeam = pendingTeams[Math.floor(Math.random() * pendingTeams.length)];
    await startAuction(randomTeam.id);
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
            {activeTeam.current_bidder_entry_id && remaining !== null && (
              <p style={{ color: remaining <= 5 ? "var(--brick)" : "var(--gold)", fontWeight: 600 }}>
                {remaining > 0 ? `Selling in ${remaining}s unless outbid` : "Selling…"}
              </p>
            )}
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
              <p className="subtitle">{pendingTeams.length} team{pendingTeams.length === 1 ? "" : "s"} left in the hat</p>
              <button className="primary" onClick={handleDraw}>
                Draw next team
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
