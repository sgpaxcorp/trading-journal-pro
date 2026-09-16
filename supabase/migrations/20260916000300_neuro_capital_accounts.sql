-- Individual investor capital accounts backed by an append-only unit ledger.
-- Portfolio performance remains separate; this ledger calculates investor ownership and cash-flow timing.

create table if not exists public.neuro_capital_pools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.neuro_capital_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pool_id uuid not null,
  investor_name text not null check (char_length(btrim(investor_name)) between 1 and 160),
  investor_reference text,
  opened_on date not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neuro_capital_accounts_pool_owner_fk
    foreign key (pool_id, user_id)
    references public.neuro_capital_pools(id, user_id)
    on delete cascade,
  unique (id, pool_id, user_id),
  unique (user_id, idempotency_key)
);

create table if not exists public.neuro_capital_account_events (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  pool_id uuid not null,
  account_id uuid not null,
  event_date date not null,
  event_type text not null check (
    event_type in ('initial_contribution', 'contribution', 'withdrawal', 'distribution', 'allocated_expense')
  ),
  amount numeric(24, 6) not null check (amount > 0),
  nav_per_unit numeric(24, 10),
  units_delta numeric(30, 12) not null default 0,
  external_cash_flow boolean not null default false,
  expense_treatment text check (expense_treatment in ('included_in_nav', 'investor_paid')),
  source text not null default 'manual' check (source in ('manual', 'import', 'system')),
  notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint neuro_capital_events_account_owner_fk
    foreign key (account_id, pool_id, user_id)
    references public.neuro_capital_accounts(id, pool_id, user_id)
    on delete cascade,
  unique (user_id, idempotency_key),
  check (
    (event_type in ('initial_contribution', 'contribution') and nav_per_unit > 0 and units_delta > 0 and external_cash_flow and expense_treatment is null)
    or (event_type = 'withdrawal' and nav_per_unit > 0 and units_delta < 0 and external_cash_flow and expense_treatment is null)
    or (event_type = 'distribution' and nav_per_unit is null and units_delta = 0 and external_cash_flow and expense_treatment is null)
    or (event_type = 'allocated_expense' and nav_per_unit is null and units_delta = 0 and expense_treatment is not null
      and external_cash_flow = (expense_treatment = 'investor_paid'))
  )
);

create table if not exists public.neuro_capital_nav_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pool_id uuid not null,
  nav_date date not null,
  total_net_assets numeric(24, 6) not null check (total_net_assets >= 0),
  total_units numeric(30, 12) not null check (total_units >= 0),
  nav_per_unit numeric(24, 10),
  event_sequence_cutoff bigint not null default 0 check (event_sequence_cutoff >= 0),
  source text not null default 'manual' check (source in ('manual', 'import', 'system')),
  notes text,
  calculation_version text not null default 'capital-accounts-v1',
  created_at timestamptz not null default now(),
  constraint neuro_capital_nav_pool_owner_fk
    foreign key (pool_id, user_id)
    references public.neuro_capital_pools(id, user_id)
    on delete cascade,
  unique (pool_id, nav_date),
  check (
    (total_units = 0 and total_net_assets = 0 and nav_per_unit is null)
    or (total_units > 0 and nav_per_unit >= 0)
  )
);

create index if not exists neuro_capital_pools_user_updated_idx
  on public.neuro_capital_pools(user_id, updated_at desc);

create index if not exists neuro_capital_accounts_pool_opened_idx
  on public.neuro_capital_accounts(pool_id, opened_on, created_at);

create index if not exists neuro_capital_events_account_sequence_idx
  on public.neuro_capital_account_events(account_id, sequence_no);

create index if not exists neuro_capital_events_pool_date_idx
  on public.neuro_capital_account_events(pool_id, event_date, sequence_no);

create index if not exists neuro_capital_nav_pool_date_idx
  on public.neuro_capital_nav_history(pool_id, nav_date desc);

create or replace function public.validate_neuro_capital_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_opened_on date;
  latest_event_date date;
  latest_nav record;
  current_account_units numeric;
  prior_initial_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.pool_id::text, 0));

  if new.event_date > current_date then
    raise exception 'Capital events cannot be dated in the future';
  end if;

  select opened_on
  into account_opened_on
  from public.neuro_capital_accounts
  where id = new.account_id and pool_id = new.pool_id and user_id = new.user_id;

  if account_opened_on is null then
    raise exception 'Capital account not found';
  end if;
  if new.event_date < account_opened_on then
    raise exception 'Capital events cannot predate the account opening date';
  end if;

  select max(event_date)
  into latest_event_date
  from public.neuro_capital_account_events
  where pool_id = new.pool_id;

  if latest_event_date is not null and new.event_date < latest_event_date then
    raise exception 'Capital events are append-only and cannot be backdated before the latest pool event';
  end if;

  select nav_date, nav_per_unit
  into latest_nav
  from public.neuro_capital_nav_history
  where pool_id = new.pool_id
  order by nav_date desc
  limit 1;

  if latest_nav.nav_date is not null and new.event_date < latest_nav.nav_date then
    raise exception 'Capital events cannot be backdated before the latest frozen NAV';
  end if;

  select count(*)
  into prior_initial_count
  from public.neuro_capital_account_events
  where account_id = new.account_id and event_type = 'initial_contribution';

  if new.event_type = 'initial_contribution' then
    if prior_initial_count > 0 then
      raise exception 'A capital account can have only one initial contribution';
    end if;
    if exists (select 1 from public.neuro_capital_account_events where account_id = new.account_id) then
      raise exception 'Initial contribution must be the first account event';
    end if;
  elsif new.event_type in ('contribution', 'withdrawal') and prior_initial_count = 0 then
    raise exception 'Record an initial contribution before additional unit transactions';
  end if;

  if new.event_type in ('initial_contribution', 'contribution', 'withdrawal') then
    if latest_nav.nav_date is not null then
      if latest_nav.nav_per_unit is null or latest_nav.nav_per_unit <= 0 then
        raise exception 'The latest frozen NAV cannot issue or redeem units';
      end if;
      new.nav_per_unit := latest_nav.nav_per_unit;
    elsif new.event_type <> 'initial_contribution' or new.nav_per_unit is null or new.nav_per_unit <= 0 then
      raise exception 'A positive seed NAV per unit is required for the first contribution';
    end if;

    if new.event_type = 'withdrawal' then
      new.units_delta := -(new.amount / new.nav_per_unit);
    else
      new.units_delta := new.amount / new.nav_per_unit;
    end if;
    new.external_cash_flow := true;
    new.expense_treatment := null;
  elsif new.event_type = 'distribution' then
    new.nav_per_unit := null;
    new.units_delta := 0;
    new.external_cash_flow := true;
    new.expense_treatment := null;
  elsif new.event_type = 'allocated_expense' then
    new.nav_per_unit := null;
    new.units_delta := 0;
    if new.expense_treatment not in ('included_in_nav', 'investor_paid') then
      raise exception 'Allocated expenses require a valid expense treatment';
    end if;
    new.external_cash_flow := new.expense_treatment = 'investor_paid';
  end if;

  select coalesce(sum(units_delta), 0)
  into current_account_units
  from public.neuro_capital_account_events
  where account_id = new.account_id;

  if current_account_units + new.units_delta < -0.0000000001 then
    raise exception 'Withdrawal exceeds the investor current units';
  end if;

  return new;
end;
$$;

create or replace function public.validate_neuro_capital_nav()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_nav_date date;
  latest_event_date date;
  calculated_units numeric;
  cutoff bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.pool_id::text, 0));

  if new.nav_date > current_date then
    raise exception 'NAV cannot be dated in the future';
  end if;

  select max(nav_date)
  into latest_nav_date
  from public.neuro_capital_nav_history
  where pool_id = new.pool_id;

  if latest_nav_date is not null and new.nav_date <= latest_nav_date then
    raise exception 'NAV history is append-only and requires a later date';
  end if;

  select max(event_date)
  into latest_event_date
  from public.neuro_capital_account_events
  where pool_id = new.pool_id;

  if latest_event_date is not null and new.nav_date < latest_event_date then
    raise exception 'NAV date cannot precede the latest capital event';
  end if;

  select coalesce(max(sequence_no), 0), coalesce(sum(units_delta), 0)
  into cutoff, calculated_units
  from public.neuro_capital_account_events
  where pool_id = new.pool_id and event_date <= new.nav_date;

  if calculated_units < -0.0000000001 then
    raise exception 'Pool unit balance cannot be negative';
  end if;

  new.event_sequence_cutoff := cutoff;
  new.total_units := greatest(0, calculated_units);
  new.calculation_version := 'capital-accounts-v1';

  if new.total_units <= 0.0000000001 then
    if new.total_net_assets <> 0 then
      raise exception 'A pool without units cannot carry net assets';
    end if;
    new.total_units := 0;
    new.nav_per_unit := null;
  else
    new.nav_per_unit := new.total_net_assets / new.total_units;
  end if;

  return new;
end;
$$;

drop trigger if exists neuro_capital_events_validate on public.neuro_capital_account_events;
create trigger neuro_capital_events_validate
  before insert on public.neuro_capital_account_events
  for each row execute function public.validate_neuro_capital_event();

drop trigger if exists neuro_capital_nav_validate on public.neuro_capital_nav_history;
create trigger neuro_capital_nav_validate
  before insert on public.neuro_capital_nav_history
  for each row execute function public.validate_neuro_capital_nav();

create or replace function public.prevent_neuro_capital_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('app.neuro_capital_erasure', true) = 'on' then
    return old;
  end if;

  raise exception 'Capital account events and NAV history are append-only';
end;
$$;

drop trigger if exists neuro_capital_events_prevent_mutation on public.neuro_capital_account_events;
create trigger neuro_capital_events_prevent_mutation
  before update or delete on public.neuro_capital_account_events
  for each row execute function public.prevent_neuro_capital_ledger_mutation();

drop trigger if exists neuro_capital_nav_prevent_mutation on public.neuro_capital_nav_history;
create trigger neuro_capital_nav_prevent_mutation
  before update or delete on public.neuro_capital_nav_history
  for each row execute function public.prevent_neuro_capital_ledger_mutation();

create or replace function public.erase_neuro_capital_data(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_pools bigint;
begin
  perform set_config('app.neuro_capital_erasure', 'on', true);

  delete from public.neuro_capital_pools
  where user_id = p_user_id;

  get diagnostics deleted_pools = row_count;
  return deleted_pools;
end;
$$;

revoke all on function public.erase_neuro_capital_data(uuid)
  from public, anon, authenticated;
grant execute on function public.erase_neuro_capital_data(uuid)
  to service_role;

create or replace function public.create_neuro_capital_account(
  p_user_id uuid,
  p_pool_id uuid,
  p_investor_name text,
  p_investor_reference text,
  p_opened_on date,
  p_initial_contribution numeric,
  p_initial_nav_per_unit numeric,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_account public.neuro_capital_accounts;
  created_event public.neuro_capital_account_events;
  created_nav public.neuro_capital_nav_history;
  latest_nav public.neuro_capital_nav_history;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_pool_id::text, 0));

  if not exists (
    select 1 from public.neuro_capital_pools where id = p_pool_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Active capital pool not found';
  end if;
  if p_opened_on > current_date then
    raise exception 'Capital account opening date cannot be in the future';
  end if;

  insert into public.neuro_capital_accounts (
    user_id, pool_id, investor_name, investor_reference, opened_on, idempotency_key
  ) values (
    p_user_id,
    p_pool_id,
    btrim(p_investor_name),
    nullif(btrim(coalesce(p_investor_reference, '')), ''),
    p_opened_on,
    p_idempotency_key
  )
  returning * into created_account;

  if p_initial_contribution is not null and p_initial_contribution > 0 then
    select *
    into latest_nav
    from public.neuro_capital_nav_history
    where pool_id = p_pool_id
    order by nav_date desc
    limit 1;

    insert into public.neuro_capital_account_events (
      user_id,
      pool_id,
      account_id,
      event_date,
      event_type,
      amount,
      nav_per_unit,
      units_delta,
      external_cash_flow,
      notes,
      idempotency_key
    ) values (
      p_user_id,
      p_pool_id,
      created_account.id,
      p_opened_on,
      'initial_contribution',
      p_initial_contribution,
      case when latest_nav.id is null then p_initial_nav_per_unit else latest_nav.nav_per_unit end,
      1,
      true,
      nullif(btrim(coalesce(p_notes, '')), ''),
      p_idempotency_key || ':initial'
    )
    returning * into created_event;

    if latest_nav.id is null then
      insert into public.neuro_capital_nav_history (
        user_id,
        pool_id,
        nav_date,
        total_net_assets,
        total_units,
        nav_per_unit,
        source,
        notes
      ) values (
        p_user_id,
        p_pool_id,
        p_opened_on,
        p_initial_contribution,
        0,
        null,
        'system',
        'Opening NAV created from the first investor contribution.'
      )
      returning * into created_nav;
    end if;
  end if;

  return jsonb_build_object(
    'accountId', created_account.id,
    'eventId', created_event.id,
    'navId', created_nav.id
  );
end;
$$;

revoke all on function public.create_neuro_capital_account(uuid, uuid, text, text, date, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_neuro_capital_account(uuid, uuid, text, text, date, numeric, numeric, text, text)
  to service_role;

drop trigger if exists neuro_capital_pools_set_updated_at on public.neuro_capital_pools;
create trigger neuro_capital_pools_set_updated_at
  before update on public.neuro_capital_pools
  for each row execute function public.set_updated_at();

drop trigger if exists neuro_capital_accounts_set_updated_at on public.neuro_capital_accounts;
create trigger neuro_capital_accounts_set_updated_at
  before update on public.neuro_capital_accounts
  for each row execute function public.set_updated_at();

alter table public.neuro_capital_pools enable row level security;
alter table public.neuro_capital_accounts enable row level security;
alter table public.neuro_capital_account_events enable row level security;
alter table public.neuro_capital_nav_history enable row level security;

drop policy if exists "neuro_capital_pools_select_own" on public.neuro_capital_pools;
create policy "neuro_capital_pools_select_own"
  on public.neuro_capital_pools for select using (auth.uid() = user_id);

drop policy if exists "neuro_capital_accounts_select_own" on public.neuro_capital_accounts;
create policy "neuro_capital_accounts_select_own"
  on public.neuro_capital_accounts for select using (auth.uid() = user_id);

drop policy if exists "neuro_capital_events_select_own" on public.neuro_capital_account_events;
create policy "neuro_capital_events_select_own"
  on public.neuro_capital_account_events for select using (auth.uid() = user_id);

drop policy if exists "neuro_capital_nav_select_own" on public.neuro_capital_nav_history;
create policy "neuro_capital_nav_select_own"
  on public.neuro_capital_nav_history for select using (auth.uid() = user_id);

revoke insert, update, delete on public.neuro_capital_pools from anon, authenticated;
revoke insert, update, delete on public.neuro_capital_accounts from anon, authenticated;
revoke insert, update, delete on public.neuro_capital_account_events from anon, authenticated;
revoke insert, update, delete on public.neuro_capital_nav_history from anon, authenticated;
grant select on public.neuro_capital_pools to authenticated;
grant select on public.neuro_capital_accounts to authenticated;
grant select on public.neuro_capital_account_events to authenticated;
grant select on public.neuro_capital_nav_history to authenticated;

notify pgrst, 'reload schema';
