-- AcroFlow v1.2 migration: sync draft flags + video tutorials on user flows.
-- Run this ONCE in the Supabase SQL editor. Safe to re-run.
alter table user_flows add column if not exists incomplete boolean not null default false;
alter table user_flows add column if not exists tutorials jsonb not null default '[]';
