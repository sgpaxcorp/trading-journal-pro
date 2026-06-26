-- Separate read-only SnapTrade profile for Neuro Analysis research portfolios.

create table if not exists public.neuro_analysis_snaptrade_users (
  owner_user_id uuid primary key,
  snaptrade_user_id text not null,
  snaptrade_user_secret text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists neuro_analysis_snaptrade_users_owner_unique
  on public.neuro_analysis_snaptrade_users(owner_user_id);

alter table public.neuro_analysis_snaptrade_users enable row level security;

drop policy if exists "neuro_analysis_snaptrade_users_select_own"
  on public.neuro_analysis_snaptrade_users;
create policy "neuro_analysis_snaptrade_users_select_own"
  on public.neuro_analysis_snaptrade_users
  for select
  using (auth.uid() = owner_user_id);

drop policy if exists "neuro_analysis_snaptrade_users_insert_own"
  on public.neuro_analysis_snaptrade_users;
create policy "neuro_analysis_snaptrade_users_insert_own"
  on public.neuro_analysis_snaptrade_users
  for insert
  with check (auth.uid() = owner_user_id);

drop policy if exists "neuro_analysis_snaptrade_users_update_own"
  on public.neuro_analysis_snaptrade_users;
create policy "neuro_analysis_snaptrade_users_update_own"
  on public.neuro_analysis_snaptrade_users
  for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "neuro_analysis_snaptrade_users_delete_own"
  on public.neuro_analysis_snaptrade_users;
create policy "neuro_analysis_snaptrade_users_delete_own"
  on public.neuro_analysis_snaptrade_users
  for delete
  using (auth.uid() = owner_user_id);

revoke all on table public.neuro_analysis_snaptrade_users from anon, authenticated;
grant all on table public.neuro_analysis_snaptrade_users to service_role;

comment on table public.neuro_analysis_snaptrade_users is
  'Server-side SnapTrade credentials used only by Neuro Analysis research portfolios.';
