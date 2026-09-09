-- Run in Supabase SQL Editor after migrations 001-006.

create table if not exists team_odds (
  id uuid primary key default gen_random_uuid(),
  season_year int not null,
  nfl_team_code text not null,
  reg_season_over_under numeric,
  super_bowl_odds text,
  unique (season_year, nfl_team_code)
);

alter table teams drop column if exists reg_season_over_under;
alter table teams drop column if exists super_bowl_odds;
