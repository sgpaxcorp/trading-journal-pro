create table if not exists public.goal_achievement_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete cascade,
  goal_scope text not null check (goal_scope in ('day', 'week', 'month', 'quarter')),
  period_key text not null,
  channel text not null check (channel in ('inapp', 'push')),
  delivery_target text,
  rule_id uuid references public.ntj_alert_rules(id) on delete set null,
  event_id uuid references public.ntj_alert_events(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists goal_achievement_deliveries_user_id_idx
  on public.goal_achievement_deliveries(user_id);

create unique index if not exists goal_achievement_deliveries_inapp_uidx
  on public.goal_achievement_deliveries(
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    goal_scope,
    period_key,
    channel
  )
  where channel = 'inapp';

create unique index if not exists goal_achievement_deliveries_push_uidx
  on public.goal_achievement_deliveries(
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    goal_scope,
    period_key,
    channel,
    delivery_target
  )
  where channel = 'push';

alter table public.goal_achievement_deliveries enable row level security;
