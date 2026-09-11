-- Calcutta pool schema. Plain Postgres — works on Supabase as-is, and
-- migrates cleanly to any other Postgres host if you ever outgrow Supabase.

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_year int not null,
  regular_season_pool_pct numeric not null default 0.35,
  playoff_pool_pct numeric not null default 0.65,
  round_weights jsonb not null default '{
    "none": 0, "wild_card": 1, "divisional": 2,
    "conference": 4, "super_bowl": 8, "won_super_bowl": 16
  }',
  total_decided_games int not null default 272, -- 272 regular-season games minus ties; ties auto-subtracted once results sync
  jackpot numeric not null default 0, -- legacy column, no longer used (pot is derived from bids)
  locked boolean not null default false, -- true once bidding opens
  starting_bid numeric not null default 1,
  increment_rules jsonb not null default '[
    {"threshold": 0, "increment": 1}
  ]',
  bid_timeout_seconds int not null default 30, -- 0 disables the countdown/auto-sell
  bid_cap numeric, -- max total spend per entry across all their teams; null = no cap
  join_password text not null default '', -- shared with friends to find & join the pool
  host_password text not null default '', -- unlocks settings editing; claimed by whoever sets it first
  created_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  owner_name text not null,
  pin_code text -- set by the bidder themselves the first time they claim their name
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  nfl_team_code text not null, -- e.g. 'KC', 'SF' — matches results API
  wins int not null default 0,
  furthest_round text not null default 'tbd'
    check (furthest_round in
      ('tbd','none','wild_card','divisional','conference','super_bowl','won_super_bowl')),
  auction_status text not null default 'pending'
    check (auction_status in ('pending','active','sold')),
  current_bid numeric,
  current_bidder_entry_id uuid references entries(id),
  bid_deadline timestamptz,
  updated_at timestamptz not null default now()
);

-- Betting odds are the same fact for everyone regardless of which pool
-- they're in, so this is shared across leagues by season year + team code
-- rather than duplicated per-league. Entered directly via SQL, not the app.
create table if not exists team_odds (
  id uuid primary key default gen_random_uuid(),
  season_year int not null,
  nfl_team_code text not null,
  reg_season_over_under numeric,
  super_bowl_odds text,
  unique (season_year, nfl_team_code)
);

create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  bid_amount numeric not null check (bid_amount >= 0),
  created_at timestamptz not null default now(),
  unique (team_id) -- a team can only be won by one entry
);

create index if not exists idx_teams_league on teams(league_id);
create index if not exists idx_entries_league on entries(league_id);
create index if not exists idx_bids_entry on bids(entry_id);

-- Enables live updates to stream to every connected phone during the auction.
alter publication supabase_realtime add table teams;

-- Game-by-game results, shared across leagues by season year (like team_odds) —
-- needed to attribute head-to-head winnings to the specific opponent beaten,
-- not just aggregate win counts.
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  espn_event_id text not null unique,
  season_year int not null,
  season_type text not null
    check (season_type in ('regular','wild_card','divisional','conference','super_bowl')),
  week int,
  home_team_code text not null,
  away_team_code text not null,
  winner_team_code text,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_games_season on games(season_year);
