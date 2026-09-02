-- Run in Supabase SQL Editor after migrations 001-003.
-- Adds a "To be determined" option, distinct from "Missed playoffs".

alter table teams drop constraint if exists teams_furthest_round_check;
alter table teams add constraint teams_furthest_round_check
  check (furthest_round in ('tbd','none','wild_card','divisional','conference','super_bowl','won_super_bowl'));
alter table teams alter column furthest_round set default 'tbd';

-- Existing teams still sitting at the old default should read as
-- "not yet determined" rather than "confirmed missed the playoffs".
update teams set furthest_round = 'tbd' where furthest_round = 'none';
