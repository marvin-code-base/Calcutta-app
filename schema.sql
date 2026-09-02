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
  reg_season_over_under numeric, -- entered manually on auction night
  super_bowl_odds text, -- entered manually on auction night (e.g. "+2500")
  updated_at timestamptz not null default now()
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
