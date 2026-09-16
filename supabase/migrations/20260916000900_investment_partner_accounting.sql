-- Internal-only partner accounting. Partners are accounting records, not application users.
-- Cash movement is recorded only after explicit human confirmation; this migration moves no money.

create extension if not exists pgcrypto;

create table if not exists public.investment_partner_classes (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  class_code text not null check (char_length(btrim(class_code)) between 1 and 30),
  class_name text not null check (char_length(btrim(class_name)) between 1 and 120),
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  fee_configuration jsonb not null default '{}'::jsonb,
  expense_configuration jsonb not null default '{}'::jsonb,
  distribution_configuration jsonb not null default '{}'::jsonb,
  liquidity_configuration jsonb not null default '{}'::jsonb,
  reporting_configuration jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, class_code),
  unique (id, pool_id),
  check (
    (status = 'DRAFT' and approved_at is null and approved_by is null)
    or (status in ('ACTIVE', 'RETIRED') and approved_at is not null and approved_by is not null)
  )
);

create table if not exists public.investment_partners (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  default_class_id uuid,
  legal_account_name text not null check (char_length(btrim(legal_account_name)) between 1 and 200),
  internal_reference text not null check (char_length(btrim(internal_reference)) between 1 and 100),
  investment_start_date date not null,
  status text not null default 'PROSPECTIVE' check (
    status in ('PROSPECTIVE', 'ACTIVE', 'WITHDRAWAL_PENDING', 'CLOSED', 'RESTRICTED')
  ),
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, internal_reference),
  unique (id, pool_id),
  constraint investment_partners_default_class_fk
    foreign key (default_class_id, pool_id)
    references public.investment_partner_classes(id, pool_id)
    on delete restrict
);

alter table public.neuro_capital_accounts
  add column if not exists investment_partner_id uuid,
  add column if not exists investment_partner_class_id uuid;

alter table public.neuro_capital_accounts
  add constraint neuro_capital_accounts_id_pool_unique unique (id, pool_id),
  add constraint neuro_capital_accounts_partner_fk
    foreign key (investment_partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  add constraint neuro_capital_accounts_partner_class_fk
    foreign key (investment_partner_class_id, pool_id)
    references public.investment_partner_classes(id, pool_id)
    on delete restrict;

create unique index if not exists neuro_capital_accounts_partner_unique
  on public.neuro_capital_accounts(pool_id, investment_partner_id)
  where investment_partner_id is not null;

create table if not exists public.investment_partner_transaction_workflows (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid not null,
  capital_account_id uuid not null,
  transaction_type text not null check (
    transaction_type in ('CONTRIBUTION', 'WITHDRAWAL', 'DISTRIBUTION')
  ),
  status text not null default 'REQUESTED' check (
    status in (
      'REQUESTED', 'REVIEWED', 'APPROVED', 'CALCULATED', 'PAID',
      'POSTED', 'RECONCILED', 'REJECTED', 'CANCELLED'
    )
  ),
  requested_amount numeric(30, 8) not null check (requested_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  requested_effective_date date not null,
  calculation_nav_date date,
  calculation_nav_per_unit numeric(30, 12),
  calculated_units_delta numeric(38, 12),
  accounting_classification text not null default 'CAPITAL_FLOW' check (
    accounting_classification in ('CAPITAL_FLOW', 'DISTRIBUTION_NOT_RETURN_CLASSIFICATION')
  ),
  external_cash_flow boolean not null default true check (external_cash_flow),
  payment_status text not null default 'NOT_INITIATED' check (
    payment_status in ('NOT_INITIATED', 'EXTERNALLY_CONFIRMED', 'RECONCILED', 'FAILED', 'CANCELLED')
  ),
  external_payment_reference text,
  capital_event_id uuid unique references public.neuro_capital_account_events(id) on delete restrict,
  journal_entry_id uuid references public.investment_journal_entries(id) on delete restrict,
  idempotency_key text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  paid_confirmed_by uuid references auth.users(id) on delete restrict,
  posted_by uuid references auth.users(id) on delete restrict,
  reconciled_by uuid references auth.users(id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, idempotency_key),
  constraint investment_partner_transactions_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  constraint investment_partner_transactions_account_fk
    foreign key (capital_account_id, pool_id)
    references public.neuro_capital_accounts(id, pool_id)
    on delete restrict,
  check (
    (transaction_type in ('CONTRIBUTION', 'WITHDRAWAL') and accounting_classification = 'CAPITAL_FLOW')
    or (transaction_type = 'DISTRIBUTION' and accounting_classification = 'DISTRIBUTION_NOT_RETURN_CLASSIFICATION')
  ),
  check (
    (status in ('REQUESTED', 'REVIEWED', 'APPROVED') and calculation_nav_date is null)
    or (status in ('CALCULATED', 'PAID', 'POSTED', 'RECONCILED') and calculation_nav_date is not null)
    or status in ('REJECTED', 'CANCELLED')
  ),
  check (
    (transaction_type = 'DISTRIBUTION' and calculated_units_delta = 0)
    or (transaction_type = 'CONTRIBUTION' and (calculated_units_delta is null or calculated_units_delta > 0))
    or (transaction_type = 'WITHDRAWAL' and (calculated_units_delta is null or calculated_units_delta < 0))
  )
);

create table if not exists public.investment_partner_transaction_events (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.investment_partner_transaction_workflows(id) on delete restrict,
  previous_status text,
  new_status text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null default '',
  state_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_fee_rules (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_class_id uuid,
  partner_id uuid,
  rule_name text not null check (char_length(btrim(rule_name)) between 1 and 160),
  fee_type text not null check (
    fee_type in ('MANAGEMENT', 'PERFORMANCE_BASED', 'ADMINISTRATIVE', 'PARTNER_SPECIFIC', 'OTHER')
  ),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED')),
  calculation_method text not null,
  configuration jsonb not null,
  effective_from date,
  effective_through date,
  legal_review_reference text,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_fee_rules_class_fk
    foreign key (partner_class_id, pool_id)
    references public.investment_partner_classes(id, pool_id)
    on delete restrict,
  constraint investment_fee_rules_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  check (partner_class_id is null or partner_id is null),
  check (effective_through is null or effective_from is null or effective_through >= effective_from),
  check (
    (status = 'DRAFT' and approved_by is null and approved_at is null)
    or (status in ('APPROVED', 'ACTIVE', 'RETIRED') and approved_by is not null and approved_at is not null)
  ),
  unique (id, pool_id)
);

create table if not exists public.investment_fee_assessments (
  id uuid primary key default gen_random_uuid(),
  fee_rule_id uuid not null references public.investment_fee_rules(id) on delete restrict,
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid,
  capital_account_id uuid,
  period_start date not null,
  period_end date not null,
  base_amount numeric(30, 8) not null,
  assessed_amount numeric(30, 8) not null check (assessed_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  formula text not null,
  formula_inputs jsonb not null,
  calculation_version text not null,
  calculation_timestamp timestamptz not null default now(),
  status text not null default 'CALCULATED' check (
    status in ('CALCULATED', 'REVIEWED', 'APPROVED', 'POSTED', 'REVERSED')
  ),
  approved_by uuid references auth.users(id) on delete restrict,
  journal_entry_id uuid references public.investment_journal_entries(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint investment_fee_assessments_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  constraint investment_fee_assessments_account_fk
    foreign key (capital_account_id, pool_id)
    references public.neuro_capital_accounts(id, pool_id)
    on delete restrict,
  constraint investment_fee_assessments_rule_pool_fk
    foreign key (fee_rule_id, pool_id)
    references public.investment_fee_rules(id, pool_id)
    on delete restrict,
  check (period_end >= period_start)
);

create table if not exists public.investment_distribution_declarations (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  declaration_date date not null,
  record_date date not null,
  payment_date date,
  total_amount numeric(30, 8) not null check (total_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source_classification text not null check (
    source_classification in (
      'CURRENT_PERIOD_INCOME', 'REALIZED_GAIN', 'RETURN_OF_CAPITAL',
      'PRIOR_PERIOD_EARNINGS', 'OTHER_DOCUMENTED_SOURCE'
    )
  ),
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'RECONCILED', 'CANCELLED')
  ),
  allocation_method text not null,
  allocation_inputs jsonb not null,
  approval_notes text not null default '',
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (record_date >= declaration_date),
  check (payment_date is null or payment_date >= record_date),
  check (
    (status = 'DRAFT' and approved_by is null and approved_at is null)
    or (status in ('APPROVED', 'PAYMENT_PENDING', 'PAID', 'RECONCILED') and approved_by is not null and approved_at is not null)
    or status = 'CANCELLED'
  ),
  unique (id, pool_id)
);

create table if not exists public.investment_distribution_allocations (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.investment_distribution_declarations(id) on delete restrict,
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid not null,
  capital_account_id uuid not null,
  amount numeric(30, 8) not null check (amount > 0),
  units_on_record_date numeric(38, 12) not null check (units_on_record_date >= 0),
  allocation_basis numeric(38, 12) not null check (allocation_basis >= 0),
  payment_status text not null default 'NOT_INITIATED' check (
    payment_status in ('NOT_INITIATED', 'EXTERNALLY_CONFIRMED', 'RECONCILED', 'FAILED', 'CANCELLED')
  ),
  external_payment_reference text,
  capital_event_id uuid unique references public.neuro_capital_account_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint investment_distribution_allocations_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  constraint investment_distribution_allocations_account_fk
    foreign key (capital_account_id, pool_id)
    references public.neuro_capital_accounts(id, pool_id)
    on delete restrict,
  constraint investment_distribution_allocations_declaration_pool_fk
    foreign key (declaration_id, pool_id)
    references public.investment_distribution_declarations(id, pool_id)
    on delete restrict,
  unique (declaration_id, capital_account_id)
);

create index if not exists investment_partners_pool_status_idx
  on public.investment_partners(pool_id, status, investment_start_date);
create index if not exists investment_partner_transactions_partner_idx
  on public.investment_partner_transaction_workflows(partner_id, created_at desc);
create index if not exists investment_fee_assessments_partner_period_idx
  on public.investment_fee_assessments(partner_id, period_end desc);
create index if not exists investment_distribution_allocations_partner_idx
  on public.investment_distribution_allocations(partner_id, declaration_id);

create or replace function public.create_investment_partner_account(
  p_actor_user_id uuid,
  p_pool_id uuid,
  p_legal_account_name text,
  p_internal_reference text,
  p_investment_start_date date,
  p_partner_class_id uuid default null,
  p_notes text default '',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pool_row public.neuro_capital_pools;
  created_partner public.investment_partners;
  capital_result jsonb;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'partners.modify') then
    raise exception 'Partner modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Partner actor must be an authenticated human user';
  end if;
  if p_investment_start_date > current_date then
    raise exception 'Partner start date cannot be in the future';
  end if;
  select * into pool_row
  from public.neuro_capital_pools
  where id = p_pool_id and status = 'active';
  if pool_row.id is null then raise exception 'Active capital pool not found'; end if;
  if p_partner_class_id is not null and not exists (
    select 1 from public.investment_partner_classes
    where id = p_partner_class_id and pool_id = p_pool_id and status = 'ACTIVE'
  ) then
    raise exception 'Active partner class not found for this pool';
  end if;

  insert into public.investment_partners (
    pool_id, default_class_id, legal_account_name, internal_reference,
    investment_start_date, notes, created_by
  ) values (
    p_pool_id, p_partner_class_id, btrim(p_legal_account_name),
    btrim(p_internal_reference), p_investment_start_date,
    left(coalesce(p_notes, ''), 4000), p_actor_user_id
  ) returning * into created_partner;

  capital_result := public.create_neuro_capital_account(
    pool_row.user_id,
    p_pool_id,
    created_partner.legal_account_name,
    created_partner.internal_reference,
    p_investment_start_date,
    null,
    null,
    p_notes,
    coalesce(nullif(p_idempotency_key, ''), created_partner.id::text)
  );

  update public.neuro_capital_accounts
  set investment_partner_id = created_partner.id,
      investment_partner_class_id = p_partner_class_id
  where id = (capital_result->>'accountId')::uuid;

  return jsonb_build_object(
    'partnerId', created_partner.id,
    'capitalAccountId', capital_result->>'accountId'
  );
end;
$$;

create or replace function public.create_investment_partner_transaction(
  p_actor_user_id uuid,
  p_partner_id uuid,
  p_capital_account_id uuid,
  p_transaction_type text,
  p_requested_amount numeric,
  p_currency text,
  p_requested_effective_date date,
  p_idempotency_key text,
  p_notes text default ''
)
returns public.investment_partner_transaction_workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  partner_row public.investment_partners;
  created_workflow public.investment_partner_transaction_workflows;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'partners.modify') then
    raise exception 'Partner modification permission required';
  end if;
  if p_transaction_type not in ('CONTRIBUTION', 'WITHDRAWAL', 'DISTRIBUTION') then
    raise exception 'Unsupported partner transaction type';
  end if;
  if p_requested_amount <= 0 then raise exception 'Transaction amount must be positive'; end if;
  if p_requested_effective_date > current_date then
    raise exception 'Partner transaction cannot be future dated';
  end if;

  select * into partner_row from public.investment_partners where id = p_partner_id;
  if partner_row.id is null or partner_row.status not in ('PROSPECTIVE', 'ACTIVE', 'WITHDRAWAL_PENDING') then
    raise exception 'Eligible partner not found';
  end if;
  if not exists (
    select 1 from public.neuro_capital_accounts
    where id = p_capital_account_id
      and pool_id = partner_row.pool_id
      and investment_partner_id = p_partner_id
      and status = 'active'
  ) then
    raise exception 'Active capital account not found for partner';
  end if;

  insert into public.investment_partner_transaction_workflows (
    pool_id, partner_id, capital_account_id, transaction_type,
    requested_amount, currency, requested_effective_date,
    accounting_classification, idempotency_key, requested_by, notes
  ) values (
    partner_row.pool_id, p_partner_id, p_capital_account_id, p_transaction_type,
    p_requested_amount, upper(p_currency), p_requested_effective_date,
    case when p_transaction_type = 'DISTRIBUTION'
      then 'DISTRIBUTION_NOT_RETURN_CLASSIFICATION' else 'CAPITAL_FLOW' end,
    p_idempotency_key, p_actor_user_id, left(coalesce(p_notes, ''), 4000)
  ) returning * into created_workflow;

  insert into public.investment_partner_transaction_events (
    workflow_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    created_workflow.id, null, 'REQUESTED', p_actor_user_id,
    'Partner transaction requested.', to_jsonb(created_workflow)
  );
  if p_transaction_type = 'WITHDRAWAL' then
    update public.investment_partners
    set status = 'WITHDRAWAL_PENDING'
    where id = p_partner_id and status = 'ACTIVE';
  end if;
  return created_workflow;
end;
$$;

create or replace function public.transition_investment_partner_transaction(
  p_actor_user_id uuid,
  p_workflow_id uuid,
  p_new_status text,
  p_reason text default '',
  p_external_payment_reference text default null,
  p_seed_nav_per_unit numeric default null,
  p_journal_entry_id uuid default null
)
returns public.investment_partner_transaction_workflows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  workflow_row public.investment_partner_transaction_workflows;
  updated_row public.investment_partner_transaction_workflows;
  latest_nav public.neuro_capital_nav_history;
  pool_owner uuid;
  existing_event_count bigint;
  current_units numeric;
  calculated_units numeric;
  calculation_nav_date_value date;
  calculation_nav_per_unit_value numeric(30, 12);
  created_event public.neuro_capital_account_events;
  opening_nav public.neuro_capital_nav_history;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'partners.modify') then
    raise exception 'Partner modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Transaction actor must be an authenticated human user';
  end if;

  select * into workflow_row
  from public.investment_partner_transaction_workflows
  where id = p_workflow_id
  for update;
  if workflow_row.id is null then raise exception 'Partner transaction workflow not found'; end if;

  if not (
    (workflow_row.status = 'REQUESTED' and p_new_status in ('REVIEWED', 'REJECTED', 'CANCELLED'))
    or (workflow_row.status = 'REVIEWED' and p_new_status in ('APPROVED', 'REJECTED', 'CANCELLED'))
    or (workflow_row.status = 'APPROVED' and p_new_status in ('CALCULATED', 'CANCELLED'))
    or (workflow_row.status = 'CALCULATED' and p_new_status in ('PAID', 'CANCELLED'))
    or (workflow_row.status = 'PAID' and p_new_status = 'POSTED')
    or (workflow_row.status = 'POSTED' and p_new_status = 'RECONCILED')
  ) then
    raise exception 'Invalid partner-transaction transition from % to %', workflow_row.status, p_new_status;
  end if;

  if p_new_status = 'CALCULATED' then
    select * into latest_nav
    from public.neuro_capital_nav_history
    where pool_id = workflow_row.pool_id
      and nav_date <= workflow_row.requested_effective_date
    order by nav_date desc
    limit 1;

    if latest_nav.id is null then
      if workflow_row.transaction_type <> 'CONTRIBUTION' or p_seed_nav_per_unit is null or p_seed_nav_per_unit <= 0 then
        raise exception 'A verified NAV is required to calculate this partner transaction';
      end if;
      if exists (select 1 from public.neuro_capital_account_events where pool_id = workflow_row.pool_id) then
        raise exception 'Seed NAV is allowed only for the first pool contribution';
      end if;
      calculation_nav_date_value := workflow_row.requested_effective_date;
      calculation_nav_per_unit_value := p_seed_nav_per_unit;
    elsif latest_nav.nav_per_unit is null or latest_nav.nav_per_unit <= 0 then
      raise exception 'Latest verified NAV cannot issue or redeem units';
    else
      calculation_nav_date_value := latest_nav.nav_date;
      calculation_nav_per_unit_value := latest_nav.nav_per_unit;
    end if;

    calculated_units := case workflow_row.transaction_type
      when 'CONTRIBUTION' then workflow_row.requested_amount / calculation_nav_per_unit_value
      when 'WITHDRAWAL' then -(workflow_row.requested_amount / calculation_nav_per_unit_value)
      else 0
    end;
    if workflow_row.transaction_type = 'WITHDRAWAL' then
      select coalesce(sum(units_delta), 0) into current_units
      from public.neuro_capital_account_events
      where account_id = workflow_row.capital_account_id;
      if current_units + calculated_units < -0.0000000001 then
        raise exception 'Withdrawal exceeds current partner units';
      end if;
    end if;
  end if;

  if p_new_status = 'PAID' and nullif(btrim(coalesce(p_external_payment_reference, '')), '') is null then
    raise exception 'External payment confirmation is required before marking a transaction paid';
  end if;

  if p_new_status = 'POSTED' then
    if p_journal_entry_id is null or not exists (
      select 1
      from public.investment_journal_entries entry
      join public.investment_accounting_books book on book.id = entry.book_id
      join public.investment_journal_lines line on line.entry_id = entry.id
      where entry.id = p_journal_entry_id
        and book.pool_id = workflow_row.pool_id
        and line.capital_account_id = workflow_row.capital_account_id
        and entry.entry_type = workflow_row.transaction_type
    ) then
      raise exception 'A matching posted journal entry is required before posting the capital transaction';
    end if;
    select user_id into pool_owner from public.neuro_capital_pools where id = workflow_row.pool_id;
    select count(*) into existing_event_count
    from public.neuro_capital_account_events where account_id = workflow_row.capital_account_id;

    insert into public.neuro_capital_account_events (
      user_id, pool_id, account_id, event_date, event_type, amount,
      nav_per_unit, units_delta, external_cash_flow, source, notes, idempotency_key
    ) values (
      pool_owner, workflow_row.pool_id, workflow_row.capital_account_id,
      workflow_row.requested_effective_date,
      case
        when workflow_row.transaction_type = 'CONTRIBUTION' and existing_event_count = 0 then 'initial_contribution'
        when workflow_row.transaction_type = 'CONTRIBUTION' then 'contribution'
        when workflow_row.transaction_type = 'WITHDRAWAL' then 'withdrawal'
        else 'distribution'
      end,
      workflow_row.requested_amount,
      workflow_row.calculation_nav_per_unit,
      coalesce(workflow_row.calculated_units_delta, 0),
      true,
      'system',
      concat('Partner workflow ', workflow_row.id, '. ', left(coalesce(p_reason, ''), 1800)),
      concat('partner-workflow:', workflow_row.id)
    ) returning * into created_event;

    if workflow_row.transaction_type = 'CONTRIBUTION'
      and existing_event_count = 0
      and not exists (
        select 1 from public.neuro_capital_nav_history where pool_id = workflow_row.pool_id
      ) then
      insert into public.neuro_capital_nav_history (
        user_id, pool_id, nav_date, total_net_assets, total_units,
        nav_per_unit, source, notes
      ) values (
        pool_owner, workflow_row.pool_id, workflow_row.requested_effective_date,
        workflow_row.requested_amount, 0, null, 'system',
        concat('Opening NAV from partner workflow ', workflow_row.id, '.')
      ) returning * into opening_nav;
    end if;

    if workflow_row.transaction_type in ('CONTRIBUTION', 'WITHDRAWAL')
      and abs(created_event.nav_per_unit - workflow_row.calculation_nav_per_unit) > 0.0000000001 then
      raise exception 'NAV changed after calculation; recalculate the partner transaction';
    end if;
  end if;

  perform set_config('app.investment_partner_transaction_transition', 'on', true);
  update public.investment_partner_transaction_workflows
  set status = p_new_status,
      calculation_nav_date = case when p_new_status = 'CALCULATED' then calculation_nav_date_value else calculation_nav_date end,
      calculation_nav_per_unit = case when p_new_status = 'CALCULATED' then calculation_nav_per_unit_value else calculation_nav_per_unit end,
      calculated_units_delta = case when p_new_status = 'CALCULATED' then calculated_units else calculated_units_delta end,
      reviewed_by = case when p_new_status = 'REVIEWED' then p_actor_user_id else reviewed_by end,
      approved_by = case when p_new_status = 'APPROVED' then p_actor_user_id else approved_by end,
      payment_status = case
        when p_new_status = 'PAID' then 'EXTERNALLY_CONFIRMED'
        when p_new_status = 'RECONCILED' then 'RECONCILED'
        when p_new_status = 'CANCELLED' then 'CANCELLED'
        else payment_status
      end,
      external_payment_reference = case when p_new_status = 'PAID' then btrim(p_external_payment_reference) else external_payment_reference end,
      paid_confirmed_by = case when p_new_status = 'PAID' then p_actor_user_id else paid_confirmed_by end,
      capital_event_id = case when p_new_status = 'POSTED' then created_event.id else capital_event_id end,
      journal_entry_id = case when p_new_status = 'POSTED' then p_journal_entry_id else journal_entry_id end,
      posted_by = case when p_new_status = 'POSTED' then p_actor_user_id else posted_by end,
      reconciled_by = case when p_new_status = 'RECONCILED' then p_actor_user_id else reconciled_by end,
      notes = case when nullif(btrim(coalesce(p_reason, '')), '') is null then notes
        else concat_ws(E'\n', nullif(notes, ''), left(btrim(p_reason), 2000)) end
  where id = p_workflow_id
  returning * into updated_row;

  if p_new_status = 'POSTED' and workflow_row.transaction_type = 'CONTRIBUTION' then
    update public.investment_partners
    set status = 'ACTIVE'
    where id = workflow_row.partner_id and status = 'PROSPECTIVE';
  elsif p_new_status in ('REJECTED', 'CANCELLED') and workflow_row.transaction_type = 'WITHDRAWAL' then
    update public.investment_partners
    set status = 'ACTIVE'
    where id = workflow_row.partner_id and status = 'WITHDRAWAL_PENDING';
  elsif p_new_status = 'RECONCILED' and workflow_row.transaction_type = 'WITHDRAWAL' then
    update public.investment_partners partner
    set status = case
      when (
        select coalesce(sum(event.units_delta), 0)
        from public.neuro_capital_account_events event
        where event.account_id = workflow_row.capital_account_id
      ) <= 0.0000000001 then 'CLOSED'
      else 'ACTIVE'
    end
    where partner.id = workflow_row.partner_id;
  end if;

  insert into public.investment_partner_transaction_events (
    workflow_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    p_workflow_id, workflow_row.status, p_new_status, p_actor_user_id,
    left(coalesce(p_reason, ''), 2000), to_jsonb(updated_row)
  );
  return updated_row;
end;
$$;

create or replace function public.guard_investment_partner_transaction_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.investment_partner_transaction_transition', true), '') <> 'on' then
    raise exception 'Partner transactions may change only through the controlled workflow';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_investment_partner_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Partner accounting history is append-only; record a correction or reversal';
end;
$$;

drop trigger if exists investment_partner_transaction_events_immutable on public.investment_partner_transaction_events;
create trigger investment_partner_transaction_events_immutable
  before update or delete on public.investment_partner_transaction_events
  for each row execute function public.prevent_investment_partner_history_mutation();

drop trigger if exists investment_partner_transactions_guard_update on public.investment_partner_transaction_workflows;
create trigger investment_partner_transactions_guard_update
  before update on public.investment_partner_transaction_workflows
  for each row execute function public.guard_investment_partner_transaction_update();

drop trigger if exists investment_fee_assessments_immutable on public.investment_fee_assessments;
create trigger investment_fee_assessments_immutable
  before update or delete on public.investment_fee_assessments
  for each row execute function public.prevent_investment_partner_history_mutation();

drop trigger if exists investment_partner_classes_set_updated_at on public.investment_partner_classes;
create trigger investment_partner_classes_set_updated_at
  before update on public.investment_partner_classes
  for each row execute function public.set_updated_at();
drop trigger if exists investment_partners_set_updated_at on public.investment_partners;
create trigger investment_partners_set_updated_at
  before update on public.investment_partners
  for each row execute function public.set_updated_at();
drop trigger if exists investment_partner_transactions_set_updated_at on public.investment_partner_transaction_workflows;
create trigger investment_partner_transactions_set_updated_at
  before update on public.investment_partner_transaction_workflows
  for each row execute function public.set_updated_at();
drop trigger if exists investment_fee_rules_set_updated_at on public.investment_fee_rules;
create trigger investment_fee_rules_set_updated_at
  before update on public.investment_fee_rules
  for each row execute function public.set_updated_at();
drop trigger if exists investment_distribution_declarations_set_updated_at on public.investment_distribution_declarations;
create trigger investment_distribution_declarations_set_updated_at
  before update on public.investment_distribution_declarations
  for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_partner_classes',
    'investment_partners',
    'investment_partner_transaction_workflows',
    'investment_partner_transaction_events',
    'investment_fee_rules',
    'investment_fee_assessments',
    'investment_distribution_declarations',
    'investment_distribution_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

drop policy if exists investment_partner_classes_read_internal on public.investment_partner_classes;
create policy investment_partner_classes_read_internal on public.investment_partner_classes
  for select to authenticated using (public.investment_current_user_has_permission('partners.view'));
drop policy if exists investment_partners_read_internal on public.investment_partners;
create policy investment_partners_read_internal on public.investment_partners
  for select to authenticated using (public.investment_current_user_has_permission('partners.view'));
drop policy if exists investment_partner_transactions_read_internal on public.investment_partner_transaction_workflows;
create policy investment_partner_transactions_read_internal on public.investment_partner_transaction_workflows
  for select to authenticated using (public.investment_current_user_has_permission('partners.view'));
drop policy if exists investment_partner_transaction_events_read_internal on public.investment_partner_transaction_events;
create policy investment_partner_transaction_events_read_internal on public.investment_partner_transaction_events
  for select to authenticated using (public.investment_current_user_has_permission('partners.view'));
drop policy if exists investment_fee_rules_read_internal on public.investment_fee_rules;
create policy investment_fee_rules_read_internal on public.investment_fee_rules
  for select to authenticated using (public.investment_current_user_has_permission('accounting.view'));
drop policy if exists investment_fee_assessments_read_internal on public.investment_fee_assessments;
create policy investment_fee_assessments_read_internal on public.investment_fee_assessments
  for select to authenticated using (public.investment_current_user_has_permission('accounting.view'));
drop policy if exists investment_distributions_read_internal on public.investment_distribution_declarations;
create policy investment_distributions_read_internal on public.investment_distribution_declarations
  for select to authenticated using (public.investment_current_user_has_permission('accounting.view'));
drop policy if exists investment_distribution_allocations_read_internal on public.investment_distribution_allocations;
create policy investment_distribution_allocations_read_internal on public.investment_distribution_allocations
  for select to authenticated using (public.investment_current_user_has_permission('accounting.view'));

grant select on public.investment_partner_classes to authenticated;
grant select on public.investment_partners to authenticated;
grant select on public.investment_partner_transaction_workflows to authenticated;
grant select on public.investment_partner_transaction_events to authenticated;
grant select on public.investment_fee_rules to authenticated;
grant select on public.investment_fee_assessments to authenticated;
grant select on public.investment_distribution_declarations to authenticated;
grant select on public.investment_distribution_allocations to authenticated;

drop policy if exists neuro_capital_pools_read_internal_investment_staff on public.neuro_capital_pools;
create policy neuro_capital_pools_read_internal_investment_staff
  on public.neuro_capital_pools for select to authenticated
  using (
    public.investment_current_user_has_permission('accounting.view')
    or public.investment_current_user_has_permission('partners.view')
  );
drop policy if exists neuro_capital_accounts_read_internal_investment_staff on public.neuro_capital_accounts;
create policy neuro_capital_accounts_read_internal_investment_staff
  on public.neuro_capital_accounts for select to authenticated
  using (
    public.investment_current_user_has_permission('accounting.view')
    or public.investment_current_user_has_permission('partners.view')
  );
drop policy if exists neuro_capital_events_read_internal_investment_staff on public.neuro_capital_account_events;
create policy neuro_capital_events_read_internal_investment_staff
  on public.neuro_capital_account_events for select to authenticated
  using (
    public.investment_current_user_has_permission('accounting.view')
    or public.investment_current_user_has_permission('partners.view')
  );
drop policy if exists neuro_capital_nav_read_internal_investment_staff on public.neuro_capital_nav_history;
create policy neuro_capital_nav_read_internal_investment_staff
  on public.neuro_capital_nav_history for select to authenticated
  using (
    public.investment_current_user_has_permission('accounting.view')
    or public.investment_current_user_has_permission('partners.view')
  );

revoke all on function public.create_investment_partner_account(uuid, uuid, text, text, date, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_investment_partner_account(uuid, uuid, text, text, date, uuid, text, text)
  to service_role;
revoke all on function public.create_investment_partner_transaction(uuid, uuid, uuid, text, numeric, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.create_investment_partner_transaction(uuid, uuid, uuid, text, numeric, text, date, text, text)
  to service_role;
revoke all on function public.transition_investment_partner_transaction(uuid, uuid, text, text, text, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_investment_partner_transaction(uuid, uuid, text, text, text, numeric, uuid)
  to service_role;

notify pgrst, 'reload schema';
