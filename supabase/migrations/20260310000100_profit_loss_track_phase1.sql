create table if not exists public.profit_loss_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete cascade,
  trader_type text not null default 'minimal'
    check (trader_type in ('minimal', 'options', 'futures', 'funded', 'swing')),
  initial_capital numeric(14,2) not null default 0,
  trading_days_per_month integer not null default 20,
  avg_trades_per_month integer not null default 40,
  include_education_in_break_even boolean not null default true,
  include_owner_pay_in_break_even boolean not null default false,
  owner_pay_target_monthly numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profit_loss_profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists account_id uuid references public.trading_accounts(id) on delete cascade,
  add column if not exists trader_type text not null default 'minimal',
  add column if not exists initial_capital numeric(14,2) not null default 0,
  add column if not exists trading_days_per_month integer not null default 20,
  add column if not exists avg_trades_per_month integer not null default 40,
  add column if not exists include_education_in_break_even boolean not null default true,
  add column if not exists include_owner_pay_in_break_even boolean not null default false,
  add column if not exists owner_pay_target_monthly numeric(14,2) not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profit_loss_profiles_trader_type_check'
      and conrelid = 'public.profit_loss_profiles'::regclass
  ) then
    alter table public.profit_loss_profiles
      add constraint profit_loss_profiles_trader_type_check
      check (trader_type in ('minimal', 'options', 'futures', 'funded', 'swing'));
  end if;
end $$;

create unique index if not exists profit_loss_profiles_user_account_uidx
  on public.profit_loss_profiles (
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists profit_loss_profiles_user_idx
  on public.profit_loss_profiles(user_id);

drop trigger if exists set_profit_loss_profiles_updated_at on public.profit_loss_profiles;
create trigger set_profit_loss_profiles_updated_at
  before update on public.profit_loss_profiles
  for each row execute function public.set_updated_at();

alter table public.profit_loss_profiles enable row level security;

drop policy if exists "profit_loss_profiles_select_own" on public.profit_loss_profiles;
create policy "profit_loss_profiles_select_own"
  on public.profit_loss_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_profiles_insert_own" on public.profit_loss_profiles;
create policy "profit_loss_profiles_insert_own"
  on public.profit_loss_profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_profiles_update_own" on public.profit_loss_profiles;
create policy "profit_loss_profiles_update_own"
  on public.profit_loss_profiles
  for update
  to authenticated
  using (
    user_id = auth.uid()
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
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_profiles_delete_own" on public.profit_loss_profiles;
create policy "profit_loss_profiles_delete_own"
  on public.profit_loss_profiles
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_profiles.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

create table if not exists public.profit_loss_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete cascade,
  name text not null,
  category text not null default 'subscription'
    check (category in ('subscription', 'data', 'education', 'funding', 'software', 'mentorship', 'broker', 'admin', 'other')),
  vendor text,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'one_time')),
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
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists account_id uuid references public.trading_accounts(id) on delete cascade,
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
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.profit_loss_costs
set is_active = true
where is_active is null;

update public.profit_loss_costs
set include_in_break_even = true
where include_in_break_even is null;

update public.profit_loss_costs
set currency = 'USD'
where currency is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profit_loss_costs_category_check'
      and conrelid = 'public.profit_loss_costs'::regclass
  ) then
    alter table public.profit_loss_costs
      add constraint profit_loss_costs_category_check
      check (category in ('subscription', 'data', 'education', 'funding', 'software', 'mentorship', 'broker', 'admin', 'other'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profit_loss_costs_billing_cycle_check'
      and conrelid = 'public.profit_loss_costs'::regclass
  ) then
    alter table public.profit_loss_costs
      add constraint profit_loss_costs_billing_cycle_check
      check (billing_cycle in ('weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'one_time'));
  end if;
end $$;

create index if not exists profit_loss_costs_user_idx
  on public.profit_loss_costs(user_id, created_at desc);

create index if not exists profit_loss_costs_user_account_idx
  on public.profit_loss_costs(user_id, account_id);

create index if not exists profit_loss_costs_preset_key_idx
  on public.profit_loss_costs(user_id, preset_key);

drop trigger if exists set_profit_loss_costs_updated_at on public.profit_loss_costs;
create trigger set_profit_loss_costs_updated_at
  before update on public.profit_loss_costs
  for each row execute function public.set_updated_at();

alter table public.profit_loss_costs enable row level security;

drop policy if exists "profit_loss_costs_select_own" on public.profit_loss_costs;
create policy "profit_loss_costs_select_own"
  on public.profit_loss_costs
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_costs_insert_own" on public.profit_loss_costs;
create policy "profit_loss_costs_insert_own"
  on public.profit_loss_costs
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_costs_update_own" on public.profit_loss_costs;
create policy "profit_loss_costs_update_own"
  on public.profit_loss_costs
  for update
  to authenticated
  using (
    user_id = auth.uid()
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
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_costs_delete_own" on public.profit_loss_costs;
create policy "profit_loss_costs_delete_own"
  on public.profit_loss_costs
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_costs.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';
