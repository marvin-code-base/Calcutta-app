-- Run in Supabase SQL Editor after migrations 001-007.

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
