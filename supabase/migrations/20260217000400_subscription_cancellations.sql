create table if not exists public.subscription_cancellations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stripe_subscription_id text null,
  stripe_customer_id text null,
  cancel_at_period_end boolean not null default true,
  reason text null,
  reason_detail text null,
  requested_at timestamptz not null default now(),
  effective_at timestamptz null,
  followup_at timestamptz null,
  followup_sent_at timestamptz null,
  coupon_id text null,
  promotion_code_id text null,
  promotion_code text null,
  status text not null default 'requested'
);

create index if not exists subscription_cancellations_user_idx
  on public.subscription_cancellations (user_id, requested_at desc);

create index if not exists subscription_cancellations_followup_idx
  on public.subscription_cancellations (followup_sent_at, followup_at);

alter table public.subscription_cancellations enable row level security;

create policy "subscription_cancellations_select_own"
  on public.subscription_cancellations
  for select
  using (auth.uid() = user_id);

create policy "subscription_cancellations_insert_own"
  on public.subscription_cancellations
  for insert
  with check (auth.uid() = user_id);
