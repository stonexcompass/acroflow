-- AcroFlow v1.1 migration: flow training set + goal stars.
-- Run this ONCE in the Supabase SQL editor. Safe to re-run.
alter table profiles add column if not exists training_flow_ids text[] not null default '{}';
alter table profiles add column if not exists goal_flow_ids text[] not null default '{}';
