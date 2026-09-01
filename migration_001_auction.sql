-- Run this once in the Supabase SQL Editor to add live-auction support
-- to a database that already has the original schema applied.

alter table leagues add column if not exists starting_bid numeric not null default 1;
alter table leagues add column if not exists increment_rules jsonb not null default '[
  {"threshold": 0, "increment": 1}
]';

alter table teams add column if not exists auction_status text not null default 'pending'
  check (auction_status in ('pending','active','sold'));
alter table teams add column if not exists current_bid numeric;
alter table teams add column if not exists current_bidder_entry_id uuid references entries(id);

-- Enables live updates to stream to every connected phone during the auction.
alter publication supabase_realtime add table teams;
