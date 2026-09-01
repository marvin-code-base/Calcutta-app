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
  total_decided_games int, -- set once schedule/tie count is known
  jackpot numeric not null default 0,
  locked boolean not null default false, -- true once bidding opens
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  nfl_team_code text not null, -- e.g. 'KC', 'SF' — matches results API
  wins int not null default 0,
  furthest_round text not null default 'none'
    check (furthest_round in
      ('none','wild_card','divisional','conference','super_bowl','won_super_bowl')),
  updated_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  owner_name text not null
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
