-- Run in Supabase SQL Editor after migrations 001-005.

alter table leagues add column if not exists join_password text not null default '';
alter table leagues add column if not exists host_password text not null default '';

-- Your existing league will show up as "no password to join" and
-- "unclaimed host" until you set both from the Settings tab.
