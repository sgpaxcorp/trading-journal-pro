-- Partner Program MVP

create table if not exists public.partner_profiles (
  user_id uuid primary key,
  referral_code text not null unique,
  legal_name text not null,
  payout_preference text not null default 'credit',
  payout_email text null,
  agreement_version text not null default 'partner-v1-2026-02-17',
  agreement_accepted boolean not null default false,
  agreement_accepted_at timestamptz null,
  status text not null default 'active',
  app_credit_balance numeric(12,2) not null default 0,
  total_commissions_earned numeric(12,2) not null default 0,
  total_commissions_paid numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_profiles_payout_preference_check
    check (payout_preference in ('credit', 'cash')),
  constraint partner_profiles_status_check
    check (status in ('active', 'paused'))
);

create index if not exists partner_profiles_referral_code_idx
  on public.partner_profiles (referral_code);

create index if not exists partner_profiles_status_idx
  on public.partner_profiles (status);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null,
  referred_user_id uuid null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  stripe_invoice_id text null,
  stripe_checkout_session_id text null,
  plan_id text null,
  billing_cycle text null,
  commission_rate numeric(5,2) not null,
  gross_amount numeric(12,2) not null,
  commission_amount numeric(12,2) not null,
  payout_method text not null default 'cash',
  status text not null default 'pending',
  available_on timestamptz not null,
  description text null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_on timestamptz null,
  constraint partner_commissions_billing_cycle_check
    check (billing_cycle is null or billing_cycle in ('monthly', 'annual')),
  constraint partner_commissions_payout_method_check
    check (payout_method in ('credit', 'cash')),
  constraint partner_commissions_status_check
    check (status in ('pending', 'available', 'paid', 'reversed'))
);

create index if not exists partner_commissions_partner_status_created_idx
  on public.partner_commissions (partner_user_id, status, created_at desc);

create index if not exists partner_commissions_subscription_idx
  on public.partner_commissions (stripe_subscription_id, created_at desc);

create unique index if not exists partner_commissions_partner_invoice_uidx
  on public.partner_commissions (partner_user_id, stripe_invoice_id)
  where stripe_invoice_id is not null;

create table if not exists public.partner_payout_requests (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null,
  amount numeric(12,2) not null,
  payout_method text not null,
  status text not null default 'requested',
  notes text null,
  requested_at timestamptz not null default now(),
  eligible_on timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_payout_requests_amount_check
    check (amount > 0),
  constraint partner_payout_requests_payout_method_check
    check (payout_method in ('credit', 'cash')),
  constraint partner_payout_requests_status_check
    check (status in ('requested', 'processing', 'paid', 'rejected'))
);

create index if not exists partner_payout_requests_partner_status_idx
  on public.partner_payout_requests (partner_user_id, status, created_at desc);

alter table public.partner_profiles enable row level security;
alter table public.partner_commissions enable row level security;
alter table public.partner_payout_requests enable row level security;

create policy "partner_profiles_select_own"
  on public.partner_profiles
  for select
  using (auth.uid() = user_id);

create policy "partner_profiles_insert_own"
  on public.partner_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "partner_profiles_update_own"
  on public.partner_profiles
  for update
  using (auth.uid() = user_id);

create policy "partner_commissions_select_own"
  on public.partner_commissions
  for select
  using (auth.uid() = partner_user_id);

create policy "partner_payout_requests_select_own"
  on public.partner_payout_requests
  for select
  using (auth.uid() = partner_user_id);

create policy "partner_payout_requests_insert_own"
  on public.partner_payout_requests
  for insert
  with check (auth.uid() = partner_user_id);

create policy "partner_payout_requests_update_own"
  on public.partner_payout_requests
  for update
  using (auth.uid() = partner_user_id);
