-- Run this ONLY after the RLS hardening SQL completed successfully.
-- This version intentionally avoids DO / $$ blocks because the Supabase SQL
-- Editor can fail if only part of a dollar-quoted block is executed.

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
select '20260420', 'plan_feature_rls_hardening', array[]::text[]
where not exists (
  select 1
  from supabase_migrations.schema_migrations
  where version = '20260420'
);
