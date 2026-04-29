-- Launch hardening: paid-feature data must be protected at the database layer,
-- not only hidden in the UI.

create or replace function public.user_has_advanced_plan(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and p_user_id = auth.uid()
    and (
      coalesce(
        exists (
          select 1
          from public.user_entitlements ue
          where ue.user_id = p_user_id
            and ue.entitlement_key = 'platform_access'
            and lower(coalesce(ue.status, '')) in ('active', 'trialing')
            and lower(coalesce(ue.metadata->>'plan', '')) in ('advanced', 'pro')
        ),
        false
      )
      or
      coalesce(
        exists (
          select 1
          from public.profiles p
          where p.id = p_user_id
            and lower(coalesce(p.subscription_status, '')) in ('active', 'trialing', 'paid')
            and lower(coalesce(p.plan, '')) in ('advanced', 'pro')
        ),
        false
      )
    );
$$;

create or replace function public.user_has_broker_sync_addon(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and p_user_id = auth.uid()
    and coalesce(
      exists (
        select 1
        from public.user_entitlements ue
        where ue.user_id = p_user_id
          and ue.entitlement_key = 'broker_sync'
          and lower(coalesce(ue.status, '')) in ('active', 'trialing')
      ),
      false
    );
$$;

revoke all on function public.user_has_advanced_plan(uuid) from public;
revoke all on function public.user_has_broker_sync_addon(uuid) from public;
grant execute on function public.user_has_advanced_plan(uuid) to authenticated;
grant execute on function public.user_has_broker_sync_addon(uuid) to authenticated;

-- Production schema catch-up for environments where historical SQL was applied
-- manually and Supabase migration history was not tracked. Every statement is
-- idempotent so this can safely run more than once.
create extension if not exists pgcrypto;

create table if not exists public.ai_coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_coach_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'global',
  scope_key text not null default 'default',
  memory text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, scope_key)
);

create table if not exists public.ai_coach_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_coach_threads(id) on delete cascade,
  message_id uuid not null references public.ai_coach_messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_coach_threads
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_coach_messages
  add column if not exists meta jsonb;

alter table public.ai_coach_memory
  add column if not exists scope text not null default 'global',
  add column if not exists scope_key text not null default 'default',
  add column if not exists memory text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_coach_feedback
  add column if not exists thread_id uuid references public.ai_coach_threads(id) on delete cascade,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists ai_coach_threads_user_idx on public.ai_coach_threads(user_id);
create index if not exists ai_coach_threads_updated_idx on public.ai_coach_threads(updated_at);
create index if not exists ai_coach_messages_thread_idx on public.ai_coach_messages(thread_id);
create index if not exists ai_coach_memory_user_idx on public.ai_coach_memory(user_id);
create unique index if not exists ai_coach_memory_user_scope_key_uidx
  on public.ai_coach_memory(user_id, scope, scope_key);
create index if not exists ai_coach_feedback_user_idx on public.ai_coach_feedback(user_id);
create unique index if not exists ai_coach_feedback_user_message_uidx
  on public.ai_coach_feedback(user_id, message_id);

create table if not exists public.profit_loss_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  trader_type text not null default 'minimal',
  initial_capital numeric(14,2) not null default 0,
  trading_days_per_month integer not null default 20,
  avg_trades_per_month integer not null default 40,
  include_education_in_break_even boolean not null default true,
  include_owner_pay_in_break_even boolean not null default false,
  owner_pay_target_monthly numeric(14,2) not null default 0,
  renewal_alert_days integer not null default 7,
  overspend_alert_pct numeric(8,4) not null default 0.10,
  variable_cost_alert_ratio numeric(8,4) not null default 0.25,
  finance_alerts_inapp_enabled boolean not null default true,
  finance_alerts_push_enabled boolean not null default true,
  finance_alerts_email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profit_loss_profiles
  add column if not exists account_id uuid,
  add column if not exists trader_type text not null default 'minimal',
  add column if not exists initial_capital numeric(14,2) not null default 0,
  add column if not exists trading_days_per_month integer not null default 20,
  add column if not exists avg_trades_per_month integer not null default 40,
  add column if not exists include_education_in_break_even boolean not null default true,
  add column if not exists include_owner_pay_in_break_even boolean not null default false,
  add column if not exists owner_pay_target_monthly numeric(14,2) not null default 0,
  add column if not exists renewal_alert_days integer not null default 7,
  add column if not exists overspend_alert_pct numeric(8,4) not null default 0.10,
  add column if not exists variable_cost_alert_ratio numeric(8,4) not null default 0.25,
  add column if not exists finance_alerts_inapp_enabled boolean not null default true,
  add column if not exists finance_alerts_push_enabled boolean not null default true,
  add column if not exists finance_alerts_email_enabled boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profit_loss_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null,
  category text not null default 'subscription',
  vendor text,
  billing_cycle text not null default 'monthly',
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  starts_at date,
  ends_at date,
  notes text,
  preset_key text,
  is_active boolean not null default true,
  include_in_break_even boolean not null default true,
  amortization_months integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profit_loss_costs
  add column if not exists account_id uuid,
  add column if not exists name text,
  add column if not exists category text not null default 'subscription',
  add column if not exists vendor text,
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists amount numeric(14,2) not null default 0,
  add column if not exists currency text not null default 'USD',
  add column if not exists starts_at date,
  add column if not exists ends_at date,
  add column if not exists notes text,
  add column if not exists preset_key text,
  add column if not exists is_active boolean not null default true,
  add column if not exists include_in_break_even boolean not null default true,
  add column if not exists amortization_months integer,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profit_loss_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  category text not null,
  monthly_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profit_loss_budgets
  add column if not exists account_id uuid,
  add column if not exists category text,
  add column if not exists monthly_amount numeric(14,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profit_loss_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  alert_kind text not null,
  alert_key text not null,
  channel text not null,
  delivery_target text,
  rule_id uuid,
  event_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profit_loss_alert_deliveries
  add column if not exists account_id uuid,
  add column if not exists delivery_target text,
  add column if not exists rule_id uuid,
  add column if not exists event_id uuid,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists profit_loss_profiles_user_idx on public.profit_loss_profiles(user_id);
create index if not exists profit_loss_costs_user_idx on public.profit_loss_costs(user_id, created_at desc);
create index if not exists profit_loss_budgets_user_idx on public.profit_loss_budgets(user_id);
create index if not exists profit_loss_alert_deliveries_user_idx
  on public.profit_loss_alert_deliveries(user_id, created_at desc);

create table if not exists public.ntj_notebook_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.ntj_notebook_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notebook_id uuid not null references public.ntj_notebook_books(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.ntj_notebook_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notebook_id uuid not null references public.ntj_notebook_books(id) on delete cascade,
  section_id uuid references public.ntj_notebook_sections(id) on delete set null,
  title text not null,
  content text not null default '',
  ink jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.ntj_notebook_free_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  entry_date date not null,
  content text,
  ink jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.ntj_notebook_books
  add column if not exists account_id uuid,
  add column if not exists name text,
  add column if not exists updated_at timestamptz;

alter table public.ntj_notebook_sections
  add column if not exists notebook_id uuid references public.ntj_notebook_books(id) on delete cascade,
  add column if not exists name text,
  add column if not exists updated_at timestamptz;

alter table public.ntj_notebook_pages
  add column if not exists notebook_id uuid references public.ntj_notebook_books(id) on delete cascade,
  add column if not exists section_id uuid references public.ntj_notebook_sections(id) on delete set null,
  add column if not exists title text,
  add column if not exists content text not null default '',
  add column if not exists ink jsonb,
  add column if not exists updated_at timestamptz;

alter table public.ntj_notebook_free_notes
  add column if not exists account_id uuid,
  add column if not exists entry_date date,
  add column if not exists content text,
  add column if not exists ink jsonb,
  add column if not exists updated_at timestamptz;

create index if not exists ntj_notebook_books_user_idx
  on public.ntj_notebook_books(user_id, created_at);
create index if not exists ntj_notebook_sections_notebook_idx
  on public.ntj_notebook_sections(notebook_id, created_at);
create index if not exists ntj_notebook_pages_notebook_idx
  on public.ntj_notebook_pages(notebook_id, created_at);
create unique index if not exists ntj_notebook_free_notes_user_account_date_uidx
  on public.ntj_notebook_free_notes(user_id, account_id, entry_date);

create table if not exists public.snaptrade_users (
  user_id uuid primary key,
  snaptrade_user_id text not null,
  snaptrade_user_secret text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.snaptrade_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  snaptrade_user_id text not null,
  authorization_id text not null,
  brokerage text,
  status text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.broker_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broker text not null,
  access_token text,
  refresh_token text,
  scope text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists snaptrade_users_user_id_unique on public.snaptrade_users(user_id);
create index if not exists snaptrade_authorizations_user_id_idx on public.snaptrade_authorizations(user_id);
create unique index if not exists broker_oauth_connections_user_broker_unique
  on public.broker_oauth_connections(user_id, broker);

-- AI Coach is Advanced-only. APIs also enforce this, but RLS protects direct Supabase clients.
alter table public.ai_coach_threads enable row level security;
alter table public.ai_coach_messages enable row level security;
alter table public.ai_coach_memory enable row level security;
alter table public.ai_coach_feedback enable row level security;

drop policy if exists ai_coach_threads_select on public.ai_coach_threads;
drop policy if exists ai_coach_threads_insert on public.ai_coach_threads;
drop policy if exists ai_coach_threads_update on public.ai_coach_threads;
drop policy if exists "ai_coach_threads_select_advanced_own" on public.ai_coach_threads;
drop policy if exists "ai_coach_threads_insert_advanced_own" on public.ai_coach_threads;
drop policy if exists "ai_coach_threads_update_advanced_own" on public.ai_coach_threads;

create policy "ai_coach_threads_select_advanced_own"
  on public.ai_coach_threads
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_threads_insert_advanced_own"
  on public.ai_coach_threads
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_threads_update_advanced_own"
  on public.ai_coach_threads
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists ai_coach_messages_select on public.ai_coach_messages;
drop policy if exists ai_coach_messages_insert on public.ai_coach_messages;
drop policy if exists "ai_coach_messages_select_advanced_own" on public.ai_coach_messages;
drop policy if exists "ai_coach_messages_insert_advanced_own" on public.ai_coach_messages;

create policy "ai_coach_messages_select_advanced_own"
  on public.ai_coach_messages
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_messages_insert_advanced_own"
  on public.ai_coach_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and exists (
      select 1
      from public.ai_coach_threads t
      where t.id = ai_coach_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists ai_coach_memory_select on public.ai_coach_memory;
drop policy if exists ai_coach_memory_insert on public.ai_coach_memory;
drop policy if exists ai_coach_memory_update on public.ai_coach_memory;
drop policy if exists "ai_coach_memory_select_advanced_own" on public.ai_coach_memory;
drop policy if exists "ai_coach_memory_insert_advanced_own" on public.ai_coach_memory;
drop policy if exists "ai_coach_memory_update_advanced_own" on public.ai_coach_memory;

create policy "ai_coach_memory_select_advanced_own"
  on public.ai_coach_memory
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_memory_insert_advanced_own"
  on public.ai_coach_memory
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_memory_update_advanced_own"
  on public.ai_coach_memory
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists ai_coach_feedback_select on public.ai_coach_feedback;
drop policy if exists ai_coach_feedback_insert on public.ai_coach_feedback;
drop policy if exists ai_coach_feedback_update on public.ai_coach_feedback;
drop policy if exists "ai_coach_feedback_select_advanced_own" on public.ai_coach_feedback;
drop policy if exists "ai_coach_feedback_insert_advanced_own" on public.ai_coach_feedback;
drop policy if exists "ai_coach_feedback_update_advanced_own" on public.ai_coach_feedback;

create policy "ai_coach_feedback_select_advanced_own"
  on public.ai_coach_feedback
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_feedback_insert_advanced_own"
  on public.ai_coach_feedback
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and exists (
      select 1
      from public.ai_coach_messages m
      where m.id = ai_coach_feedback.message_id
        and m.user_id = auth.uid()
    )
  );

create policy "ai_coach_feedback_update_advanced_own"
  on public.ai_coach_feedback
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

-- Profit & Loss Track is Advanced-only.
alter table public.profit_loss_profiles enable row level security;
alter table public.profit_loss_costs enable row level security;
alter table public.profit_loss_budgets enable row level security;
alter table public.profit_loss_alert_deliveries enable row level security;

drop policy if exists "profit_loss_profiles_select_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_insert_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_update_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_delete_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_select_advanced_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_insert_advanced_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_update_advanced_own" on public.profit_loss_profiles;
drop policy if exists "profit_loss_profiles_delete_advanced_own" on public.profit_loss_profiles;

create policy "profit_loss_profiles_select_advanced_own"
  on public.profit_loss_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_profiles_insert_advanced_own"
  on public.profit_loss_profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_profiles_update_advanced_own"
  on public.profit_loss_profiles
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_profiles_delete_advanced_own"
  on public.profit_loss_profiles
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists "profit_loss_costs_select_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_insert_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_update_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_delete_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_select_advanced_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_insert_advanced_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_update_advanced_own" on public.profit_loss_costs;
drop policy if exists "profit_loss_costs_delete_advanced_own" on public.profit_loss_costs;

create policy "profit_loss_costs_select_advanced_own"
  on public.profit_loss_costs
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_costs_insert_advanced_own"
  on public.profit_loss_costs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_costs_update_advanced_own"
  on public.profit_loss_costs
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_costs_delete_advanced_own"
  on public.profit_loss_costs
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists "profit_loss_budgets_select_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_insert_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_update_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_delete_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_select_advanced_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_insert_advanced_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_update_advanced_own" on public.profit_loss_budgets;
drop policy if exists "profit_loss_budgets_delete_advanced_own" on public.profit_loss_budgets;

create policy "profit_loss_budgets_select_advanced_own"
  on public.profit_loss_budgets
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_budgets_insert_advanced_own"
  on public.profit_loss_budgets
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_budgets_update_advanced_own"
  on public.profit_loss_budgets
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and public.user_has_advanced_plan(auth.uid())
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create policy "profit_loss_budgets_delete_advanced_own"
  on public.profit_loss_budgets
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists "profit_loss_alert_deliveries_select_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_insert_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_update_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_delete_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_select_advanced_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_insert_advanced_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_update_advanced_own" on public.profit_loss_alert_deliveries;
drop policy if exists "profit_loss_alert_deliveries_delete_advanced_own" on public.profit_loss_alert_deliveries;

create policy "profit_loss_alert_deliveries_select_advanced_own"
  on public.profit_loss_alert_deliveries
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "profit_loss_alert_deliveries_insert_advanced_own"
  on public.profit_loss_alert_deliveries
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "profit_loss_alert_deliveries_update_advanced_own"
  on public.profit_loss_alert_deliveries
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

create policy "profit_loss_alert_deliveries_delete_advanced_own"
  on public.profit_loss_alert_deliveries
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

-- Broker Sync credentials are add-on-only. These tables contain broker secrets/tokens.
alter table public.snaptrade_users enable row level security;
alter table public.snaptrade_authorizations enable row level security;
alter table public.broker_oauth_connections enable row level security;

drop policy if exists "snaptrade_users_select_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_insert_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_update_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_delete_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_select_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_insert_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_update_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_delete_broker_sync_own" on public.snaptrade_users;

create policy "snaptrade_users_select_broker_sync_own"
  on public.snaptrade_users
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_users_insert_broker_sync_own"
  on public.snaptrade_users
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_users_update_broker_sync_own"
  on public.snaptrade_users
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_users_delete_broker_sync_own"
  on public.snaptrade_users
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

drop policy if exists "snaptrade_auth_select_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_insert_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_update_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_delete_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_select_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_insert_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_update_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_delete_broker_sync_own" on public.snaptrade_authorizations;

create policy "snaptrade_auth_select_broker_sync_own"
  on public.snaptrade_authorizations
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_auth_insert_broker_sync_own"
  on public.snaptrade_authorizations
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_auth_update_broker_sync_own"
  on public.snaptrade_authorizations
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "snaptrade_auth_delete_broker_sync_own"
  on public.snaptrade_authorizations
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

drop policy if exists "broker_oauth_connections_select_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_insert_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_update_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_delete_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_select_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_insert_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_update_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_delete_broker_sync_own" on public.broker_oauth_connections;

create policy "broker_oauth_connections_select_broker_sync_own"
  on public.broker_oauth_connections
  for select
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "broker_oauth_connections_insert_broker_sync_own"
  on public.broker_oauth_connections
  for insert
  to authenticated
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "broker_oauth_connections_update_broker_sync_own"
  on public.broker_oauth_connections
  for update
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()))
  with check (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

create policy "broker_oauth_connections_delete_broker_sync_own"
  on public.broker_oauth_connections
  for delete
  to authenticated
  using (user_id = auth.uid() and public.user_has_broker_sync_addon(auth.uid()));

-- Tables that may exist only in deployed environments are hardened conditionally.
do $$
declare
  pol record;
begin
  if to_regclass('public.cashflows') is not null then
    execute 'alter table public.cashflows enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'cashflows'
    loop
      execute format('drop policy if exists %I on public.cashflows', pol.policyname);
    end loop;

    execute $sql$
      create policy "cashflows_select_advanced_own"
        on public.cashflows
        for select
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "cashflows_insert_advanced_own"
        on public.cashflows
        for insert
        to authenticated
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "cashflows_update_advanced_own"
        on public.cashflows
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "cashflows_delete_advanced_own"
        on public.cashflows
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;

  if to_regclass('public.ntj_cashflows') is not null then
    execute 'alter table public.ntj_cashflows enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'ntj_cashflows'
    loop
      execute format('drop policy if exists %I on public.ntj_cashflows', pol.policyname);
    end loop;

    execute $sql$
      create policy "ntj_cashflows_select_advanced_own"
        on public.ntj_cashflows
        for select
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_cashflows_insert_advanced_own"
        on public.ntj_cashflows
        for insert
        to authenticated
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_cashflows_update_advanced_own"
        on public.ntj_cashflows
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_cashflows_delete_advanced_own"
        on public.ntj_cashflows
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;

  if to_regclass('public.ntj_notebook_books') is not null then
    execute 'alter table public.ntj_notebook_books enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'ntj_notebook_books'
    loop
      execute format('drop policy if exists %I on public.ntj_notebook_books', pol.policyname);
    end loop;

    execute $sql$
      create policy "ntj_notebook_books_select_advanced_own"
        on public.ntj_notebook_books
        for select
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_books_insert_advanced_own"
        on public.ntj_notebook_books
        for insert
        to authenticated
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_books_update_advanced_own"
        on public.ntj_notebook_books
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_books_delete_advanced_own"
        on public.ntj_notebook_books
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;

  if to_regclass('public.ntj_notebook_sections') is not null
     and to_regclass('public.ntj_notebook_books') is not null then
    execute 'alter table public.ntj_notebook_sections enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'ntj_notebook_sections'
    loop
      execute format('drop policy if exists %I on public.ntj_notebook_sections', pol.policyname);
    end loop;

    execute $sql$
      create policy "ntj_notebook_sections_select_advanced_own"
        on public.ntj_notebook_sections
        for select
        to authenticated
        using (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_sections.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_sections_insert_advanced_own"
        on public.ntj_notebook_sections
        for insert
        to authenticated
        with check (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_sections.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_sections_update_advanced_own"
        on public.ntj_notebook_sections
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_sections.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_sections_delete_advanced_own"
        on public.ntj_notebook_sections
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;

  if to_regclass('public.ntj_notebook_pages') is not null
     and to_regclass('public.ntj_notebook_books') is not null then
    execute 'alter table public.ntj_notebook_pages enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'ntj_notebook_pages'
    loop
      execute format('drop policy if exists %I on public.ntj_notebook_pages', pol.policyname);
    end loop;

    execute $sql$
      create policy "ntj_notebook_pages_select_advanced_own"
        on public.ntj_notebook_pages
        for select
        to authenticated
        using (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_pages.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_pages_insert_advanced_own"
        on public.ntj_notebook_pages
        for insert
        to authenticated
        with check (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_pages.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_pages_update_advanced_own"
        on public.ntj_notebook_pages
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (
          user_id = auth.uid()
          and public.user_has_advanced_plan(auth.uid())
          and exists (
            select 1 from public.ntj_notebook_books b
            where b.id = ntj_notebook_pages.notebook_id
              and b.user_id = auth.uid()
          )
        )
    $sql$;

    execute $sql$
      create policy "ntj_notebook_pages_delete_advanced_own"
        on public.ntj_notebook_pages
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;

  if to_regclass('public.ntj_notebook_free_notes') is not null then
    execute 'alter table public.ntj_notebook_free_notes enable row level security';
    for pol in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = 'ntj_notebook_free_notes'
    loop
      execute format('drop policy if exists %I on public.ntj_notebook_free_notes', pol.policyname);
    end loop;

    execute $sql$
      create policy "ntj_notebook_free_notes_select_advanced_own"
        on public.ntj_notebook_free_notes
        for select
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_free_notes_insert_advanced_own"
        on public.ntj_notebook_free_notes
        for insert
        to authenticated
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_free_notes_update_advanced_own"
        on public.ntj_notebook_free_notes
        for update
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
        with check (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;

    execute $sql$
      create policy "ntj_notebook_free_notes_delete_advanced_own"
        on public.ntj_notebook_free_notes
        for delete
        to authenticated
        using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
    $sql$;
  end if;
end
$$;

notify pgrst, 'reload schema';
