-- ============================================================================
-- AcroFlow — Supabase schema (cloud sync, wired up via supabase-adapter.js)
-- ----------------------------------------------------------------------------
-- Run this once in your Supabase project's SQL editor, then paste your
-- project URL + publishable key into the app's Data tab (💾 → Cloud sync)
-- and create an account / sign in.
--
-- Design notes:
--   * One row per user in `profiles`; everything else keys off it.
--   * `progress` mirrors the localStorage `progress` map 1:1, so migration
--     is a straight upload of existing device data.
--   * The "Partner" jam profile is device-local in v1; here it becomes
--     `partner_progress` owned by the user (it's *your* notes about a
--     partner, not the partner's own account).
--   * Seed poses/transitions/flows stay static in data.js (works offline,
--     zero read latency). Moving them into tables is sketched at the bottom.
--   * `updated_at` on every data table drives per-record last-write-wins
--     merging when two devices edit the same record (see README "Sync
--     strategy"). The adapter always writes it explicitly.
-- ============================================================================

-- One profile per authenticated user.
-- `meta` (jsonb) carries future settings. NEW FIELDS GO IN meta —
-- never add another column (see supabase-migration-v1.2.sql).
create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  primary_roles text[] not null default '{base,flyer}',
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- v1.1: flow training set + goal stars live on the profile (flow *progress*
-- needs no schema change — flow ids are just more rows in `progress`).
alter table profiles add column if not exists training_flow_ids text[] not null default '{}';
alter table profiles add column if not exists goal_flow_ids text[] not null default '{}';

-- Per-skill, per-role progress. skill_id matches the ids in data.js
-- (poses, transitions and flows share one id namespace, e.g. 'bird',
-- 't_bird_to_throne', 'f_ninja_star'). Flow progress needs no schema change:
-- a flow's id is just another row here.
create table if not exists progress (
  user_id    uuid not null references profiles (id) on delete cascade,
  skill_id   text not null,
  role       text not null check (role in ('base', 'flyer', 'spotter')),
  level      text not null check (level in ('unstarted', 'learning', 'drilling', 'solid', 'teach')),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id, role)
);

-- The on-device "Partner" profile from the Jam screen, stored per user.
create table if not exists partner_progress (
  user_id    uuid not null references profiles (id) on delete cascade,
  skill_id   text not null,
  role       text not null check (role in ('base', 'flyer', 'spotter')),
  level      text not null check (level in ('unstarted', 'learning', 'drilling', 'solid', 'teach')),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id, role)
);

-- Practice log entries.
create table if not exists practice_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  date       date not null,
  partner    text,
  role       text check (role in ('base', 'flyer', 'spotter')),
  skill_ids  text[] not null default '{}',
  confidence smallint check (confidence between 1 and 5),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- User-created flows from the Flow Builder.
-- `transitions` is aligned to `steps` (transition id per link, or NULL where
-- the link is unknown — Postgres text[] does support NULL elements; use
-- jsonb instead if you prefer explicit nulls).
-- `meta` (jsonb) carries every flow-level extra: incomplete, tutorials, and
-- anything future. NEW FIELDS GO IN meta — never add another column
-- (see supabase-migration-v1.2.sql).
create table if not exists user_flows (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles (id) on delete cascade,
  name            text not null,
  steps           text[] not null,              -- pose ids in order
  transitions     text[] not null default '{}', -- transition ids aligned to steps
  washing_machine boolean not null default false,
  note            text,
  meta            jsonb not null default '{}',  -- { incomplete, tutorials, … }
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Backfill for databases created from the earlier sketch of this file
-- (which lacked updated_at on these two tables):
alter table practice_logs add column if not exists updated_at timestamptz not null default now();
alter table user_flows   add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- Row Level Security: users can only ever touch their own rows.
-- ----------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table progress          enable row level security;
alter table partner_progress  enable row level security;
alter table practice_logs     enable row level security;
alter table user_flows        enable row level security;

-- profiles: users manage their own row
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- everything else: users manage rows where user_id is themselves
create policy "own progress" on progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own partner_progress" on partner_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own practice_logs" on practice_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own user_flows" on user_flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful index for the log history view (newest first per user).
create index if not exists practice_logs_user_date_idx
  on practice_logs (user_id, date desc);

-- ============================================================================
-- OPTIONAL, FUTURE: seed curriculum as tables
-- ----------------------------------------------------------------------------
-- Tradeoff (also in README.md):
--   KEEP IN data.js (v1 choice): the curriculum ships with the app, so the
--     app works fully offline and loads instantly. Fixing a typo or a dead
--     tutorial link means cutting a new release (trivial on GitHub Pages).
--   MOVE TO TABLES: you can add a pose, fix a link, or correct a sequence
--     without shipping the app — but the app then needs network on first
--     load, a local cache/version check (seed_version table), and a merge
--     strategy for user data that references renamed skill ids.
-- If you outgrow data.js, create these and have the Supabase adapter merge
-- them over (or replace) window.SEED at load time:
--
--   create table seed_poses (
--     id text primary key, name text not null, aliases text[] default '{}',
--     discipline text not null default 'lbase',
--     difficulty smallint not null check (difficulty between 1 and 5),
--     description text, safety jsonb, tutorials jsonb, prereq_poses text[] default '{}'
--   );
--   create table seed_transitions (
--     id text primary key, name text not null, from_pose text not null,
--     to_pose text not null, aliases text[] default '{}',
--     difficulty smallint not null check (difficulty between 1 and 5),
--     description text, safety jsonb, tutorials jsonb,
--     prereq_transitions text[] default '{}'
--   );
--   create table seed_flows (
--     id text primary key, name text not null, steps text[] not null,
--     transitions text[] not null default '{}', washing_machine boolean default false,
--     note text, tutorials jsonb
--   );
--   create table seed_meta (key text primary key, value text not null);
--   -- e.g. insert into seed_meta values ('version', '1.0.0');
-- ============================================================================
