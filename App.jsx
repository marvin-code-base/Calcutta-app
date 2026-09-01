import { useEffect, useState } from "react";
import { getFirstLeague, getTeams, getEntries } from "./db.js";
import Settings from "./Settings.jsx";
import Teams from "./Teams.jsx";
import Entries from "./Entries.jsx";
import Dashboard from "./Dashboard.jsx";
import "./styles.css";

const TABS = ["Settings", "Teams", "Bidders", "Dashboard"];

export default function App() {
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [entries, setEntries] = useState([]);
  const [tab, setTab] = useState("Settings");
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
        }
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  async function handleLeagueChange(updatedLeague) {
    setLeague(updatedLeague);
    if (updatedLeague) {
      const [t, e] = await Promise.all([
        getTeams(updatedLeague.id),
        getEntries(updatedLeague.id),
      ]);
      setTeams(t);
      setEntries(e);
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
            <Settings league={league} onLeagueChange={handleLeagueChange} />
          )}
          {tab === "Teams" && league && (
            <Teams league={league} teams={teams} onTeamsChange={setTeams} />
          )}
          {tab === "Bidders" && league && (
            <Entries
              league={league}
              teams={teams}
              entries={entries}
              onEntriesChange={setEntries}
            />
          )}
          {tab === "Dashboard" && league && (
            <Dashboard league={league} teams={teams} entries={entries} />
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
