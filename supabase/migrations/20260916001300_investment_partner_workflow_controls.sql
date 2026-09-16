-- Human approval controls for partner classes, fee rules, fee assessments, and distributions.

create table if not exists public.investment_partner_class_events (
  id uuid primary key default gen_random_uuid(),
  partner_class_id uuid not null references public.investment_partner_classes(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  state_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_fee_rule_events (
  id uuid primary key default gen_random_uuid(),
  fee_rule_id uuid not null references public.investment_fee_rules(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  state_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_fee_assessment_events (
  id uuid primary key default gen_random_uuid(),
  fee_assessment_id uuid not null references public.investment_fee_assessments(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('CALCULATED', 'REVIEWED', 'APPROVED', 'POSTED', 'REVERSED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  state_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_distribution_events (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.investment_distribution_declarations(id) on delete restrict,
  previous_status text,
  new_status text not null check (
    new_status in ('DRAFT', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'RECONCILED', 'CANCELLED')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  state_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_distribution_allocation_payment_events (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.investment_distribution_allocations(id) on delete restrict,
  previous_status text,
  new_status text not null check (
    new_status in ('NOT_INITIATED', 'EXTERNALLY_CONFIRMED', 'RECONCILED', 'FAILED', 'CANCELLED')
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  external_payment_reference text,
  capital_event_id uuid references public.neuro_capital_account_events(id) on delete restrict,
  reason text not null,
  occurred_at timestamptz not null default now()
);

create or replace function public.transition_investment_partner_class(
  p_actor_user_id uuid,
  p_partner_class_id uuid,
  p_new_status text,
  p_reason text
)
returns public.investment_partner_classes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  class_row public.investment_partner_classes;
  updated_row public.investment_partner_classes;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'partners.modify') then
    raise exception 'Partner modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Partner-class actor must be an authenticated human user';
  end if;
  select * into class_row from public.investment_partner_classes where id = p_partner_class_id for update;
  if class_row.id is null then raise exception 'Partner class not found'; end if;
  if not (
    (class_row.status = 'DRAFT' and p_new_status = 'ACTIVE')
    or (class_row.status = 'ACTIVE' and p_new_status = 'RETIRED')
  ) then
    raise exception 'Invalid partner-class transition from % to %', class_row.status, p_new_status;
  end if;

  perform set_config('app.investment_partner_class_transition', 'on', true);
  update public.investment_partner_classes
  set status = p_new_status,
      approved_by = coalesce(approved_by, p_actor_user_id),
      approved_at = coalesce(approved_at, now())
  where id = p_partner_class_id
  returning * into updated_row;

  insert into public.investment_partner_class_events (
    partner_class_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    p_partner_class_id, class_row.status, p_new_status, p_actor_user_id,
    left(btrim(p_reason), 4000), to_jsonb(updated_row)
  );
  return updated_row;
end;
$$;

create or replace function public.transition_investment_fee_rule(
  p_actor_user_id uuid,
  p_fee_rule_id uuid,
  p_new_status text,
  p_reason text
)
returns public.investment_fee_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rule_row public.investment_fee_rules;
  updated_row public.investment_fee_rules;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Fee-rule actor must be an authenticated human user';
  end if;
  select * into rule_row from public.investment_fee_rules where id = p_fee_rule_id for update;
  if rule_row.id is null then raise exception 'Fee rule not found'; end if;
  if not (
    (rule_row.status = 'DRAFT' and p_new_status = 'APPROVED')
    or (rule_row.status = 'APPROVED' and p_new_status = 'ACTIVE')
    or (rule_row.status in ('APPROVED', 'ACTIVE') and p_new_status = 'RETIRED')
  ) then
    raise exception 'Invalid fee-rule transition from % to %', rule_row.status, p_new_status;
  end if;
  if p_new_status = 'ACTIVE' and (rule_row.effective_from is null or rule_row.configuration = '{}'::jsonb) then
    raise exception 'A fee rule requires an effective date and explicit configuration before activation';
  end if;

  perform set_config('app.investment_fee_rule_transition', 'on', true);
  update public.investment_fee_rules
  set status = p_new_status,
      approved_by = case when p_new_status = 'APPROVED' then p_actor_user_id else approved_by end,
      approved_at = case when p_new_status = 'APPROVED' then now() else approved_at end
  where id = p_fee_rule_id
  returning * into updated_row;

  insert into public.investment_fee_rule_events (
    fee_rule_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    p_fee_rule_id, rule_row.status, p_new_status, p_actor_user_id,
    left(btrim(p_reason), 4000), to_jsonb(updated_row)
  );
  return updated_row;
end;
$$;

create or replace function public.transition_investment_fee_assessment(
  p_actor_user_id uuid,
  p_fee_assessment_id uuid,
  p_new_status text,
  p_reason text,
  p_journal_entry_id uuid default null
)
returns public.investment_fee_assessments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_row public.investment_fee_assessments;
  updated_row public.investment_fee_assessments;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Fee-assessment actor must be an authenticated human user';
  end if;
  select * into assessment_row
  from public.investment_fee_assessments where id = p_fee_assessment_id for update;
  if assessment_row.id is null then raise exception 'Fee assessment not found'; end if;
  if not (
    (assessment_row.status = 'CALCULATED' and p_new_status = 'REVIEWED')
    or (assessment_row.status = 'REVIEWED' and p_new_status = 'APPROVED')
    or (assessment_row.status = 'APPROVED' and p_new_status = 'POSTED')
    or (assessment_row.status = 'POSTED' and p_new_status = 'REVERSED')
  ) then
    raise exception 'Invalid fee-assessment transition from % to %', assessment_row.status, p_new_status;
  end if;
  if p_new_status in ('POSTED', 'REVERSED') and p_journal_entry_id is null then
    raise exception 'Posted and reversed fee assessments require a journal entry';
  end if;

  perform set_config('app.investment_fee_assessment_transition', 'on', true);
  update public.investment_fee_assessments
  set status = p_new_status,
      approved_by = case when p_new_status = 'APPROVED' then p_actor_user_id else approved_by end,
      journal_entry_id = case when p_new_status in ('POSTED', 'REVERSED') then p_journal_entry_id else journal_entry_id end
  where id = p_fee_assessment_id
  returning * into updated_row;

  insert into public.investment_fee_assessment_events (
    fee_assessment_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    p_fee_assessment_id, assessment_row.status, p_new_status, p_actor_user_id,
    left(btrim(p_reason), 4000), to_jsonb(updated_row)
  );
  return updated_row;
end;
$$;

create or replace function public.record_investment_distribution_payment(
  p_actor_user_id uuid,
  p_allocation_id uuid,
  p_new_status text,
  p_external_payment_reference text,
  p_capital_event_id uuid,
  p_reason text
)
returns public.investment_distribution_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allocation_row public.investment_distribution_allocations;
  updated_row public.investment_distribution_allocations;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  select * into allocation_row
  from public.investment_distribution_allocations where id = p_allocation_id for update;
  if allocation_row.id is null then raise exception 'Distribution allocation not found'; end if;
  if not (
    (allocation_row.payment_status = 'NOT_INITIATED' and p_new_status in ('EXTERNALLY_CONFIRMED', 'FAILED', 'CANCELLED'))
    or (allocation_row.payment_status = 'FAILED' and p_new_status = 'EXTERNALLY_CONFIRMED')
    or (allocation_row.payment_status = 'EXTERNALLY_CONFIRMED' and p_new_status = 'RECONCILED')
  ) then
    raise exception 'Invalid distribution-payment transition from % to %', allocation_row.payment_status, p_new_status;
  end if;
  if p_new_status in ('EXTERNALLY_CONFIRMED', 'RECONCILED')
    and nullif(btrim(coalesce(p_external_payment_reference, allocation_row.external_payment_reference, '')), '') is null then
    raise exception 'External payment reference is required';
  end if;
  if p_new_status = 'RECONCILED' and p_capital_event_id is null then
    raise exception 'A reconciled distribution requires its capital event';
  end if;

  perform set_config('app.investment_distribution_payment_transition', 'on', true);
  update public.investment_distribution_allocations
  set payment_status = p_new_status,
      external_payment_reference = coalesce(nullif(btrim(p_external_payment_reference), ''), external_payment_reference),
      capital_event_id = case when p_new_status = 'RECONCILED' then p_capital_event_id else capital_event_id end
  where id = p_allocation_id
  returning * into updated_row;

  insert into public.investment_distribution_allocation_payment_events (
    allocation_id, previous_status, new_status, actor_user_id,
    external_payment_reference, capital_event_id, reason
  ) values (
    p_allocation_id, allocation_row.payment_status, p_new_status, p_actor_user_id,
    updated_row.external_payment_reference, updated_row.capital_event_id,
    left(btrim(p_reason), 4000)
  );
  return updated_row;
end;
$$;

create or replace function public.transition_investment_distribution(
  p_actor_user_id uuid,
  p_declaration_id uuid,
  p_new_status text,
  p_reason text
)
returns public.investment_distribution_declarations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  declaration_row public.investment_distribution_declarations;
  updated_row public.investment_distribution_declarations;
  allocated_total numeric;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Distribution actor must be an authenticated human user';
  end if;
  select * into declaration_row
  from public.investment_distribution_declarations where id = p_declaration_id for update;
  if declaration_row.id is null then raise exception 'Distribution declaration not found'; end if;
  if not (
    (declaration_row.status = 'DRAFT' and p_new_status in ('APPROVED', 'CANCELLED'))
    or (declaration_row.status = 'APPROVED' and p_new_status in ('PAYMENT_PENDING', 'CANCELLED'))
    or (declaration_row.status = 'PAYMENT_PENDING' and p_new_status in ('PAID', 'CANCELLED'))
    or (declaration_row.status = 'PAID' and p_new_status = 'RECONCILED')
  ) then
    raise exception 'Invalid distribution transition from % to %', declaration_row.status, p_new_status;
  end if;

  if p_new_status = 'APPROVED' then
    select coalesce(sum(amount), 0) into allocated_total
    from public.investment_distribution_allocations where declaration_id = p_declaration_id;
    if allocated_total <> declaration_row.total_amount then
      raise exception 'Distribution allocations % do not equal declared total %', allocated_total, declaration_row.total_amount;
    end if;
  elsif p_new_status = 'PAID' and exists (
    select 1 from public.investment_distribution_allocations
    where declaration_id = p_declaration_id
      and payment_status not in ('EXTERNALLY_CONFIRMED', 'RECONCILED')
  ) then
    raise exception 'Every distribution payment requires external confirmation';
  elsif p_new_status = 'RECONCILED' and exists (
    select 1 from public.investment_distribution_allocations
    where declaration_id = p_declaration_id and payment_status <> 'RECONCILED'
  ) then
    raise exception 'Every distribution allocation must be reconciled';
  end if;

  perform set_config('app.investment_distribution_transition', 'on', true);
  update public.investment_distribution_declarations
  set status = p_new_status,
      approved_by = case when p_new_status = 'APPROVED' then p_actor_user_id else approved_by end,
      approved_at = case when p_new_status = 'APPROVED' then now() else approved_at end
  where id = p_declaration_id
  returning * into updated_row;

  insert into public.investment_distribution_events (
    declaration_id, previous_status, new_status, actor_user_id, reason, state_snapshot
  ) values (
    p_declaration_id, declaration_row.status, p_new_status, p_actor_user_id,
    left(btrim(p_reason), 4000), to_jsonb(updated_row)
  );
  return updated_row;
end;
$$;

create or replace function public.guard_investment_partner_configuration_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'investment_partner_classes' and new.status <> 'DRAFT' then
    raise exception 'Partner classes must begin in DRAFT';
  elsif tg_table_name = 'investment_fee_rules' and new.status <> 'DRAFT' then
    raise exception 'Fee rules must begin in DRAFT';
  elsif tg_table_name = 'investment_fee_assessments' and new.status <> 'CALCULATED' then
    raise exception 'Fee assessments must begin in CALCULATED';
  elsif tg_table_name = 'investment_distribution_declarations' and new.status <> 'DRAFT' then
    raise exception 'Distribution declarations must begin in DRAFT';
  elsif tg_table_name = 'investment_partner_transaction_workflows' and new.status <> 'REQUESTED' then
    raise exception 'Partner transactions must begin in REQUESTED';
  end if;
  return new;
end;
$$;

create or replace function public.guard_investment_partner_configuration_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'investment_partner_classes'
    and old.status <> 'DRAFT'
    and (
      to_jsonb(old) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
      is distinct from
      to_jsonb(new) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
    ) then
    raise exception 'Approved partner-class economics are immutable; create a new class version';
  elsif tg_table_name = 'investment_fee_rules'
    and old.status <> 'DRAFT'
    and (
      to_jsonb(old) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
      is distinct from
      to_jsonb(new) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
    ) then
    raise exception 'Approved fee-rule economics are immutable; create a new rule';
  elsif tg_table_name = 'investment_fee_assessments'
    and coalesce(current_setting('app.investment_fee_assessment_transition', true), '') <> 'on' then
    raise exception 'Fee assessments may change only through the controlled workflow';
  elsif tg_table_name = 'investment_distribution_declarations'
    and old.status <> 'DRAFT'
    and (
      to_jsonb(old) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
      is distinct from
      to_jsonb(new) - array['status', 'approved_by', 'approved_at', 'updated_at']::text[]
    ) then
    raise exception 'Approved distribution economics are immutable';
  elsif tg_table_name = 'investment_distribution_allocations'
    and coalesce(current_setting('app.investment_distribution_payment_transition', true), '') <> 'on' then
    raise exception 'Distribution allocations may change only through the controlled workflow';
  end if;

  if tg_table_name = 'investment_partner_classes'
    and old.status is distinct from new.status
    and coalesce(current_setting('app.investment_partner_class_transition', true), '') <> 'on' then
    raise exception 'Partner-class status requires the controlled workflow';
  elsif tg_table_name = 'investment_fee_rules'
    and old.status is distinct from new.status
    and coalesce(current_setting('app.investment_fee_rule_transition', true), '') <> 'on' then
    raise exception 'Fee-rule status requires the controlled workflow';
  elsif tg_table_name = 'investment_distribution_declarations'
    and old.status is distinct from new.status
    and coalesce(current_setting('app.investment_distribution_transition', true), '') <> 'on' then
    raise exception 'Distribution status requires the controlled workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists investment_fee_assessments_immutable on public.investment_fee_assessments;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_partner_classes',
    'investment_fee_rules',
    'investment_fee_assessments',
    'investment_distribution_declarations',
    'investment_partner_transaction_workflows'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_guard_insert', table_name);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.guard_investment_partner_configuration_insert()',
      table_name || '_guard_insert', table_name
    );
  end loop;

  foreach table_name in array array[
    'investment_partner_classes',
    'investment_fee_rules',
    'investment_fee_assessments',
    'investment_distribution_declarations',
    'investment_distribution_allocations'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_guard_update', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.guard_investment_partner_configuration_update()',
      table_name || '_guard_update', table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'investment_partner_class_events',
    'investment_fee_rule_events',
    'investment_fee_assessment_events',
    'investment_distribution_events',
    'investment_distribution_allocation_payment_events'
  ]
  loop
    trigger_name := table_name || '_immutable';
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.prevent_investment_partner_history_mutation()',
      trigger_name, table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.investment_current_user_has_permission(''accounting.view''))',
      table_name || '_read_internal', table_name
    );
  end loop;
end;
$$;

revoke all on function public.transition_investment_partner_class(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_investment_partner_class(uuid, uuid, text, text) to service_role;
revoke all on function public.transition_investment_fee_rule(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_investment_fee_rule(uuid, uuid, text, text) to service_role;
revoke all on function public.transition_investment_fee_assessment(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_investment_fee_assessment(uuid, uuid, text, text, uuid) to service_role;
revoke all on function public.record_investment_distribution_payment(uuid, uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_investment_distribution_payment(uuid, uuid, text, text, uuid, text) to service_role;
revoke all on function public.transition_investment_distribution(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_investment_distribution(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
