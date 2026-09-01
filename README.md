# Calcutta App

NFL Calcutta auction pool tracker: manual bid entry, automated regular-season
and playoff results, ROI by team/aggregate, and (later) bidding-assist
analytics.

## Status (built so far)

- ✅ Scoring engine (`src/lib/scoring.js`) — fully tested, implements:
  - 65% playoff / 35% regular-season split (both adjustable per league)
  - Playoff points by *furthest round reached* (not summed per win) —
    equalizes bye teams and Wild Card winners once both reach Divisional
  - Regular-season share = team's wins ÷ league-wide decided games
  - Config locks once bidding opens
- ✅ Database schema (`supabase/schema.sql`) — leagues, teams, entries, bids
- ✅ Data-access layer (`src/lib/db.js`) — the only file that talks to
  Supabase directly, so swapping DB hosts or wrapping this in a native app
  shell later only touches this one file
- ⬜ UI (settings screen, entry/bid entry, dashboards) — not started yet
- ⬜ ESPN results/playoff-clinch auto-pull — not started yet
- ⬜ Bidding-night manual odds input + over/underpaying analytics — not started

## Setup

1. Create a free Supabase project at supabase.com
2. In the Supabase SQL editor, run `supabase/schema.sql`
3. Copy `.env.example` to `.env` and fill in your project URL + anon key
4. `npm install`
5. `npm run dev`

Run tests any time with `npm test`.
