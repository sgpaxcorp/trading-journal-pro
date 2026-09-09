alter table public.trading_accounts
  add column if not exists account_type text not null default 'personal';

update public.trading_accounts
set account_type = 'personal'
where account_type is null or account_type not in ('personal', 'funded');

alter table public.trading_accounts
  drop constraint if exists trading_accounts_account_type_check;

alter table public.trading_accounts
  add constraint trading_accounts_account_type_check
  check (account_type in ('personal', 'funded'));

create table if not exists public.funded_account_profiles (
  account_id uuid primary key references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'evaluation'
    check (stage in ('evaluation', 'verification', 'funded')),
  firm_name text not null default '',
  program_name text not null default '',
  nominal_account_size numeric(18,2) not null default 0 check (nominal_account_size >= 0),
  current_equity numeric(18,2) not null default 0 check (current_equity >= 0),
  profit_target numeric(18,2) not null default 0 check (profit_target >= 0),
  daily_loss_limit numeric(18,2) not null default 0 check (daily_loss_limit >= 0),
  max_drawdown numeric(18,2) not null default 0 check (max_drawdown >= 0),
  drawdown_type text not null default 'static'
    check (drawdown_type in ('static', 'trailing_intraday', 'trailing_eod')),
  drawdown_floor numeric(18,2) check (drawdown_floor is null or drawdown_floor >= 0),
  minimum_trading_days integer not null default 0 check (minimum_trading_days >= 0),
  evaluation_deadline date,
  consistency_rule_percent numeric(7,4)
    check (consistency_rule_percent is null or consistency_rule_percent between 0 and 100),
  max_positions integer check (max_positions is null or max_positions >= 0),
  profit_split_percent numeric(7,4)
    check (profit_split_percent is null or profit_split_percent between 0 and 100),
  payout_minimum numeric(18,2) check (payout_minimum is null or payout_minimum >= 0),
  payout_eligible_days integer check (payout_eligible_days is null or payout_eligible_days >= 0),
  news_trading_allowed boolean not null default false,
  overnight_allowed boolean not null default false,
  weekend_allowed boolean not null default false,
  rules_version integer not null default 1 check (rules_version >= 1),
  rules_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funded_account_profiles_user_id_idx
  on public.funded_account_profiles(user_id);

create table if not exists public.funded_account_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'rules_updated', 'stage_changed', 'equity_updated')),
  from_stage text,
  to_stage text,
  rules_version integer not null default 1,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funded_account_events_account_created_idx
  on public.funded_account_events(account_id, created_at desc);

create or replace function public.prevent_trading_account_type_reclassification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_type is distinct from old.account_type and (
    exists (
      select 1 from public.journal_entries entry
      where entry.user_id = old.user_id and entry.account_id = old.id
    )
    or exists (
      select 1 from public.journal_trades trade
      where trade.user_id = old.user_id and trade.account_id = old.id
    )
  ) then
    raise exception 'Account type cannot be changed after execution records exist.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trading_accounts_prevent_type_reclassification on public.trading_accounts;
create trigger trading_accounts_prevent_type_reclassification
before update of account_type on public.trading_accounts
for each row execute function public.prevent_trading_account_type_reclassification();

create or replace function public.enforce_funded_growth_plan_guardrails()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_account_type text;
  v_profile public.funded_account_profiles%rowtype;
  v_breach_floor numeric;
  v_remaining_drawdown numeric;
  v_firm_daily_limit numeric;
  v_operating_daily_stop numeric;
  v_risk_per_trade numeric;
  v_daily_stop_percent numeric;
  v_risk_per_trade_percent numeric;
begin
  select account.account_type
    into v_account_type
  from public.trading_accounts account
  where account.id = new.account_id
    and account.user_id = new.user_id;

  if coalesce(v_account_type, 'personal') <> 'funded' then
    return new;
  end if;

  select profile.*
    into v_profile
  from public.funded_account_profiles profile
  where profile.account_id = new.account_id
    and profile.user_id = new.user_id;

  if not found
    or v_profile.firm_name = ''
    or v_profile.program_name = ''
    or v_profile.nominal_account_size <= 0
    or v_profile.current_equity <= 0
    or v_profile.profit_target <= 0
    or v_profile.daily_loss_limit <= 0
    or v_profile.max_drawdown <= 0
    or v_profile.rules_confirmed_at is null
    or (
      v_profile.drawdown_type <> 'static'
      and v_profile.drawdown_floor is null
    )
  then
    raise exception 'Complete and confirm funded-account rules before saving a growth plan.'
      using errcode = '23514';
  end if;

  v_breach_floor := coalesce(
    v_profile.drawdown_floor,
    greatest(0, v_profile.nominal_account_size - v_profile.max_drawdown)
  );
  v_remaining_drawdown := greatest(0, v_profile.current_equity - v_breach_floor);

  if v_remaining_drawdown <= 0 then
    raise exception 'Funded account has no remaining drawdown room.'
      using errcode = '23514';
  end if;

  if v_profile.current_equity >= v_profile.nominal_account_size + v_profile.profit_target then
    raise exception 'Funded stage target is complete; update the stage before saving another growth plan.'
      using errcode = '23514';
  end if;

  v_firm_daily_limit := least(v_profile.daily_loss_limit, v_remaining_drawdown);
  v_operating_daily_stop := greatest(
    0,
    least(v_firm_daily_limit * 0.75, v_remaining_drawdown * 0.25)
  );
  v_risk_per_trade := greatest(
    0,
    least(v_operating_daily_stop / 3.0, v_remaining_drawdown / 10.0)
  );
  v_daily_stop_percent := (v_operating_daily_stop / v_profile.current_equity) * 100.0;
  v_risk_per_trade_percent := (v_risk_per_trade / v_profile.current_equity) * 100.0;

  new.starting_balance := v_profile.current_equity;
  new.target_balance := v_profile.nominal_account_size + v_profile.profit_target;
  new.target_multiple := new.target_balance / new.starting_balance;
  new.max_daily_loss_percent := least(
    greatest(0, coalesce(new.max_daily_loss_percent, v_daily_stop_percent)),
    v_daily_stop_percent
  );
  new.max_risk_per_trade_percent := least(
    greatest(0, coalesce(new.max_risk_per_trade_percent, v_risk_per_trade_percent)),
    v_risk_per_trade_percent
  );
  new.max_risk_per_trade_usd := least(
    greatest(0, coalesce(new.max_risk_per_trade_usd, v_risk_per_trade)),
    v_risk_per_trade
  );

  return new;
end;
$$;

drop trigger if exists growth_plans_enforce_funded_guardrails on public.growth_plans;
create trigger growth_plans_enforce_funded_guardrails
before insert or update on public.growth_plans
for each row execute function public.enforce_funded_growth_plan_guardrails();

create or replace function public.set_funded_account_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists funded_account_profiles_set_updated_at on public.funded_account_profiles;
create trigger funded_account_profiles_set_updated_at
before update on public.funded_account_profiles
for each row execute function public.set_funded_account_profile_updated_at();

alter table public.funded_account_profiles enable row level security;
alter table public.funded_account_events enable row level security;

drop policy if exists funded_account_profiles_select_own on public.funded_account_profiles;
create policy funded_account_profiles_select_own
on public.funded_account_profiles for select
using (auth.uid() = user_id);

drop policy if exists funded_account_profiles_insert_own on public.funded_account_profiles;
create policy funded_account_profiles_insert_own
on public.funded_account_profiles for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts account
    where account.id = account_id and account.user_id = auth.uid()
  )
);

drop policy if exists funded_account_profiles_update_own on public.funded_account_profiles;
create policy funded_account_profiles_update_own
on public.funded_account_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists funded_account_profiles_delete_own on public.funded_account_profiles;
create policy funded_account_profiles_delete_own
on public.funded_account_profiles for delete
using (auth.uid() = user_id);

drop policy if exists funded_account_events_select_own on public.funded_account_events;
create policy funded_account_events_select_own
on public.funded_account_events for select
using (auth.uid() = user_id);

drop policy if exists funded_account_events_insert_own on public.funded_account_events;
create policy funded_account_events_insert_own
on public.funded_account_events for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.trading_accounts account
    where account.id = account_id and account.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.funded_account_profiles to authenticated;
grant select, insert on public.funded_account_events to authenticated;
