import { useEffect, useState } from "react";
import { getLeague, getTeams, getEntries, subscribeToBids, getTeamOdds } from "./db.js";
import Settings from "./Settings.jsx";
import Entries from "./Entries.jsx";
import Auction from "./Auction.jsx";
import Dashboard from "./Dashboard.jsx";
import "./styles.css";

const TABS = ["Dashboard", "Bidders", "Auction", "Settings"];
const LEAGUE_KEY = "calcutta_selected_league_id";

export default function App() {
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [entries, setEntries] = useState([]);
  const [odds, setOdds] = useState({});
  const [tab, setTab] = useState("Dashboard");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const storedId = localStorage.getItem(LEAGUE_KEY);
        if (storedId) {
          try {
            const found = await getLeague(storedId);
            setLeague(found);
            const [t, e, o] = await Promise.all([
              getTeams(found.id),
              getEntries(found.id),
              getTeamOdds(found.season_year),
            ]);
            setTeams(t);
            setEntries(e);
            setOdds(o);
          } catch {
            // League no longer exists (or a stale id) — fall back to the picker.
            localStorage.removeItem(LEAGUE_KEY);
            setTab("Settings");
          }
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

  // Called when creating a brand-new pool or successfully joining an
  // existing one — switches the device over to that league entirely.
  async function handleLeagueSelected(selectedLeague) {
    localStorage.setItem(LEAGUE_KEY, selectedLeague.id);
    setLeague(selectedLeague);
    const [t, e, o] = await Promise.all([
      getTeams(selectedLeague.id),
      getEntries(selectedLeague.id),
      getTeamOdds(selectedLeague.season_year),
    ]);
    setTeams(t);
    setEntries(e);
    setOdds(o);
    setTab("Dashboard");
  }

  // Called for in-place edits to the currently selected league's settings —
  // just refreshes the data, doesn't change tabs or re-fetch teams/entries.
  function handleLeagueUpdate(updatedLeague) {
    setLeague(updatedLeague);
  }

  function handleLeaveLeague() {
    localStorage.removeItem(LEAGUE_KEY);
    setLeague(null);
    setTeams([]);
    setEntries([]);
    setOdds({});
    setTab("Settings");
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
            <Settings
              league={league}
              entries={entries}
              onLeagueUpdate={handleLeagueUpdate}
              onLeagueSelected={handleLeagueSelected}
              onLeaveLeague={handleLeaveLeague}
            />
          )}
          {tab === "Bidders" && league && (
            <Entries
              league={league}
              entries={entries}
              onEntriesChange={setEntries}
            />
          )}
          {tab === "Auction" && league && (
            <Auction
              league={league}
              teams={teams}
              entries={entries}
              odds={odds}
              onTeamsChange={setTeams}
            />
          )}
          {tab === "Dashboard" && league && (
            <Dashboard
              league={league}
              teams={teams}
              entries={entries}
              odds={odds}
              onTeamsChange={setTeams}
            />
          )}
          {tab !== "Settings" && !league && (
            <div className="card">
              <div className="empty-state">Find or create your pool in Settings first.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
