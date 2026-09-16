-- ============================================================================
-- AcroFlow — FINAL schema migration.
-- ----------------------------------------------------------------------------
-- SCHEMA EVOLUTION RULE — READ BEFORE ADDING A SYNC FIELD:
--   NEW FIELDS GO IN `meta` (jsonb) — NEVER ADD ANOTHER COLUMN.
--
-- `user_flows.meta` carries flow-level extras (incomplete, tutorials, and
-- anything future); `profiles.meta` carries future settings. The adapter
-- round-trips both opaquely, so new features ship with ZERO migrations.
-- This file is idempotent: safe to run any number of times, on a database
-- where no earlier migration ever ran, or one where parts of v1.2 did.
-- ============================================================================

-- 1. The flexible catch-alls. This is the only DDL this project should
--    ever need again.
alter table user_flows add column if not exists meta jsonb not null default '{}';
alter table profiles   add column if not exists meta jsonb not null default '{}';

-- 2. Backfill: the original v1.2 migration added dedicated `incomplete` /
--    `tutorials` columns. If they exist (that migration was run), fold their
--    values into `meta` — meta wins when both are set. The old columns are
--    then simply ignored by the app (left in place, never read or written,
--    so older cached app versions keep working).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'user_flows' and column_name = 'incomplete') then
    update user_flows
       set meta = coalesce(meta, '{}') || jsonb_build_object('incomplete', incomplete)
     where (meta -> 'incomplete') is null and incomplete is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'user_flows' and column_name = 'tutorials') then
    update user_flows
       set meta = coalesce(meta, '{}') || jsonb_build_object('tutorials', tutorials)
     where (meta -> 'tutorials') is null and tutorials is not null;
  end if;
end $$;
