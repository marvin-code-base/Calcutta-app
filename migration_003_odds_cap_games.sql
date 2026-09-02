-- Run in Supabase SQL Editor after migrations 001 and 002.

alter table teams add column if not exists reg_season_over_under numeric;
alter table teams add column if not exists super_bowl_odds text;

alter table leagues add column if not exists bid_cap numeric; -- null = no cap
alter table leagues alter column total_decided_games set default 272;
update leagues set total_decided_games = 272 where total_decided_games is null;
