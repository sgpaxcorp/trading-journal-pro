-- Enable RLS and add owner-only policies (auth.uid()).
-- Safe to re-run: policies are dropped/recreated.

-- Tables that should be private per-user
alter table public.profiles enable row level security;
alter table public.push_tokens enable row level security;
alter table public.option_flow_uploads enable row level security;
alter table public.trades enable row level security;
alter table public.broker_transactions enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_sessions enable row level security;
alter table public.admin_users enable row level security;
alter table public.forum_ai_log enable row level security;

-- profiles (owner-only)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using (id = auth.uid());

-- push_tokens (owner-only)
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());

-- option_flow_uploads (owner-only)
drop policy if exists "option_flow_uploads_select_own" on public.option_flow_uploads;
create policy "option_flow_uploads_select_own"
  on public.option_flow_uploads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "option_flow_uploads_insert_own" on public.option_flow_uploads;
create policy "option_flow_uploads_insert_own"
  on public.option_flow_uploads
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "option_flow_uploads_update_own" on public.option_flow_uploads;
create policy "option_flow_uploads_update_own"
  on public.option_flow_uploads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "option_flow_uploads_delete_own" on public.option_flow_uploads;
create policy "option_flow_uploads_delete_own"
  on public.option_flow_uploads
  for delete
  to authenticated
  using (user_id = auth.uid());

-- trades (owner-only)
drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own"
  on public.trades
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own"
  on public.trades
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "trades_update_own" on public.trades;
create policy "trades_update_own"
  on public.trades
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trades_delete_own" on public.trades;
create policy "trades_delete_own"
  on public.trades
  for delete
  to authenticated
  using (user_id = auth.uid());

-- broker_transactions (owner-only)
drop policy if exists "broker_transactions_select_own" on public.broker_transactions;
create policy "broker_transactions_select_own"
  on public.broker_transactions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "broker_transactions_insert_own" on public.broker_transactions;
create policy "broker_transactions_insert_own"
  on public.broker_transactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "broker_transactions_update_own" on public.broker_transactions;
create policy "broker_transactions_update_own"
  on public.broker_transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "broker_transactions_delete_own" on public.broker_transactions;
create policy "broker_transactions_delete_own"
  on public.broker_transactions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- usage_events (owner-only)
drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "usage_events_insert_own" on public.usage_events;
create policy "usage_events_insert_own"
  on public.usage_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "usage_events_update_own" on public.usage_events;
create policy "usage_events_update_own"
  on public.usage_events
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "usage_events_delete_own" on public.usage_events;
create policy "usage_events_delete_own"
  on public.usage_events
  for delete
  to authenticated
  using (user_id = auth.uid());

-- usage_sessions (owner-only)
drop policy if exists "usage_sessions_select_own" on public.usage_sessions;
create policy "usage_sessions_select_own"
  on public.usage_sessions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "usage_sessions_insert_own" on public.usage_sessions;
create policy "usage_sessions_insert_own"
  on public.usage_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "usage_sessions_update_own" on public.usage_sessions;
create policy "usage_sessions_update_own"
  on public.usage_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "usage_sessions_delete_own" on public.usage_sessions;
create policy "usage_sessions_delete_own"
  on public.usage_sessions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- admin_users (read own row only; no writes from client)
drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- forum_ai_log (internal only; deny all for authenticated)
drop policy if exists "forum_ai_log_deny_all" on public.forum_ai_log;
create policy "forum_ai_log_deny_all"
  on public.forum_ai_log
  for all
  to authenticated
  using (false)
  with check (false);
