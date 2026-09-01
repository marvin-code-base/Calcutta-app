-- Run this in the Supabase SQL Editor after migration_001_auction.sql.
-- Adds the bid-countdown timer without touching existing data.

alter table leagues add column if not exists bid_timeout_seconds int not null default 30;
alter table teams add column if not exists bid_deadline timestamptz;
