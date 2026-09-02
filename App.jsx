import { useEffect, useState } from "react";
import { getFirstLeague, getTeams, getEntries, subscribeToBids } from "./db.js";
import Settings from "./Settings.jsx";
import Entries from "./Entries.jsx";
import Auction from "./Auction.jsx";
import Dashboard from "./Dashboard.jsx";
import "./styles.css";

const TABS = ["Dashboard", "Bidders", "Auction", "Settings"];

export default function App() {
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("Dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const found = await getFirstLeague();
        setLeague(found);
        if (found) {
          const [t, e] = await Promise.all([getTeams(found.id), getEntries(found.id)]);
          setTeams(t);
          setEntries(e);
        } else {
          setTab("Settings");
        }
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  // Keeps entries (and their bid totals, used for the bid cap) fresh across
  // every tab whenever any bid is placed or sold, not just the Auction tab.
  useEffect(() => {
    if (!league) return;
    const unsubscribe = subscribeToBids(async () => {
      const [t, e] = await Promise.all([getTeams(league.id), getEntries(league.id)]);
      setTeams(t);
      setEntries(e);
    });
    return unsubscribe;
  }, [league?.id]);

  async function handleLeagueChange(updatedLeague) {
    setLeague(updatedLeague);
    if (updatedLeague) {
      const [t, e] = await Promise.all([
        getTeams(updatedLeague.id),
        getEntries(updatedLeague.id),
      ]);
      setTeams(t);
      setEntries(e);
      setTab("Dashboard");
    }
  }

  return (
    <div className="app-shell">
      <h1>Calcutta</h1>
      <p className="subtitle">NFL auction pool tracker</p>

      {loading && <p className="subtitle">Loading…</p>}
      {loadError && <p className="negative">{loadError}</p>}

      {!loading && !loadError && (
        <>
          <nav className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "Settings" && (
            <Settings league={league} entries={entries} onLeagueChange={handleLeagueChange} />
          )}
          {tab === "Bidders" && league && (
            <Entries
              league={league}
              teams={teams}
              entries={entries}
              onEntriesChange={setEntries}
            />
          )}
          {tab === "Auction" && league && (
            <Auction
              league={league}
              teams={teams}
              entries={entries}
              onTeamsChange={setTeams}
            />
          )}
          {tab === "Dashboard" && league && (
            <Dashboard
              league={league}
              teams={teams}
              entries={entries}
              onTeamsChange={setTeams}
            />
          )}
          {tab !== "Settings" && !league && (
            <div className="card">
              <div className="empty-state">Create your pool in Settings first.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
