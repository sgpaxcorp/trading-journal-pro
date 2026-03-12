create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  status text not null default 'inactive',
  source text not null default 'stripe',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  started_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements
  add column if not exists source text not null default 'stripe',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists started_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists user_entitlements_user_id_entitlement_key_idx
  on public.user_entitlements (user_id, entitlement_key);

create index if not exists user_entitlements_entitlement_key_status_idx
  on public.user_entitlements (entitlement_key, status);

alter table public.user_entitlements enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_entitlements'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.user_entitlements', pol.policyname);
  end loop;
end
$$;

create policy "user_entitlements_select_own"
  on public.user_entitlements
  for select
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists set_user_entitlements_updated_at on public.user_entitlements;
create trigger set_user_entitlements_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();

insert into public.user_entitlements (
  user_id,
  entitlement_key,
  status,
  source,
  stripe_customer_id,
  stripe_subscription_id,
  metadata
)
select
  p.id,
  'platform_access',
  case
    when lower(coalesce(p.subscription_status, '')) = 'paid' then 'active'
    else lower(coalesce(p.subscription_status, ''))
  end,
  'profile_backfill',
  p.stripe_customer_id,
  p.stripe_subscription_id,
  jsonb_strip_nulls(
    jsonb_build_object(
      'plan', nullif(lower(coalesce(p.plan, '')), ''),
      'backfilled_from', 'profiles'
    )
  )
from public.profiles p
where lower(coalesce(p.subscription_status, '')) in ('active', 'trialing', 'paid')
  and (p.stripe_customer_id is not null or p.stripe_subscription_id is not null)
on conflict (user_id, entitlement_key) do update
set
  status = excluded.status,
  source = case
    when public.user_entitlements.source in ('admin', 'manual', 'demo') then public.user_entitlements.source
    else excluded.source
  end,
  stripe_customer_id = coalesce(excluded.stripe_customer_id, public.user_entitlements.stripe_customer_id),
  stripe_subscription_id = coalesce(excluded.stripe_subscription_id, public.user_entitlements.stripe_subscription_id),
  metadata = coalesce(public.user_entitlements.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
  updated_at = now();

notify pgrst, 'reload schema';
