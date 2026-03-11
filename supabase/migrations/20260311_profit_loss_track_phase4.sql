alter table public.profit_loss_profiles
  add column if not exists finance_alerts_inapp_enabled boolean not null default true,
  add column if not exists finance_alerts_push_enabled boolean not null default true,
  add column if not exists finance_alerts_email_enabled boolean not null default true;

update public.profit_loss_profiles
set finance_alerts_inapp_enabled = true
where finance_alerts_inapp_enabled is null;

update public.profit_loss_profiles
set finance_alerts_push_enabled = true
where finance_alerts_push_enabled is null;

update public.profit_loss_profiles
set finance_alerts_email_enabled = true
where finance_alerts_email_enabled is null;

create table if not exists public.profit_loss_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete cascade,
  alert_kind text not null check (alert_kind in ('renewal', 'overspend', 'variable_cost')),
  alert_key text not null,
  channel text not null check (channel in ('inapp', 'push', 'email')),
  delivery_target text,
  rule_id uuid references public.ntj_alert_rules(id) on delete set null,
  event_id uuid references public.ntj_alert_events(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profit_loss_alert_deliveries_user_idx
  on public.profit_loss_alert_deliveries(user_id, created_at desc);

create unique index if not exists profit_loss_alert_deliveries_inapp_uidx
  on public.profit_loss_alert_deliveries(
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alert_kind,
    alert_key,
    channel
  )
  where channel = 'inapp';

create unique index if not exists profit_loss_alert_deliveries_external_uidx
  on public.profit_loss_alert_deliveries(
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alert_kind,
    alert_key,
    channel,
    coalesce(delivery_target, '')
  )
  where channel in ('push', 'email');

alter table public.profit_loss_alert_deliveries enable row level security;

drop policy if exists "profit_loss_alert_deliveries_select_own" on public.profit_loss_alert_deliveries;
create policy "profit_loss_alert_deliveries_select_own"
  on public.profit_loss_alert_deliveries
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "profit_loss_alert_deliveries_insert_own" on public.profit_loss_alert_deliveries;
create policy "profit_loss_alert_deliveries_insert_own"
  on public.profit_loss_alert_deliveries
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "profit_loss_alert_deliveries_update_own" on public.profit_loss_alert_deliveries;
create policy "profit_loss_alert_deliveries_update_own"
  on public.profit_loss_alert_deliveries
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "profit_loss_alert_deliveries_delete_own" on public.profit_loss_alert_deliveries;
create policy "profit_loss_alert_deliveries_delete_own"
  on public.profit_loss_alert_deliveries
  for delete
  to authenticated
  using (user_id = auth.uid());
