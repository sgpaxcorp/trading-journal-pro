-- Run this in Supabase SQL Editor to align migration history with the schema
-- that already exists in production.
--
-- This script does not execute old schema changes. It only inserts migration
-- version rows so `supabase db push` does not try to re-apply historical SQL.
--
-- It intentionally avoids DO / $$ blocks so the Supabase SQL Editor cannot
-- break execution by selecting only part of a dollar-quoted block.

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[] null,
  name text null
);

alter table supabase_migrations.schema_migrations
  add column if not exists statements text[],
  add column if not exists name text;

insert into supabase_migrations.schema_migrations (version, name, statements)
select version, 'manual_history_repair', array[]::text[]
from (
  values
    -- Legacy date-only rows that may already exist from manual history repair.
    ('20260215'),
    ('20260217'),
    ('20260218'),
    ('20260219'),
    ('20260226'),
    ('20260303'),
    ('20260304'),
    ('20260305'),
    ('20260308'),
    ('20260309'),
    ('20260310'),
    ('20260311'),
    ('20260312'),
    ('20260318'),
    ('20260408'),
    ('20260414'),

    -- Normalized unique local migration versions.
    ('20260215000100'),
    ('20260215000200'),
    ('20260215000300'),
    ('20260217000100'),
    ('20260217000200'),
    ('20260217000300'),
    ('20260217000400'),
    ('20260218000100'),
    ('20260218000200'),
    ('20260218000300'),
    ('20260218000400'),
    ('20260218000500'),
    ('20260218000600'),
    ('20260305000100'),
    ('20260305000200'),
    ('20260305000300'),
    ('20260308000100'),
    ('20260308000200'),
    ('20260310000100'),
    ('20260310000200'),
    ('20260310000300'),
    ('20260311000100'),
    ('20260311000200'),
    ('20260311000300'),
    ('20260311000400'),
    ('20260311000500'),
    ('20260312000100'),
    ('20260312000200'),
    ('20260318000100'),
    ('20260318000200')
) as repaired(version)
where not exists (
  select 1
  from supabase_migrations.schema_migrations sm
  where sm.version = repaired.version
);
