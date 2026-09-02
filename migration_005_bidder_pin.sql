-- Run in Supabase SQL Editor after migrations 001-004.

alter table entries add column if not exists pin_code text;
