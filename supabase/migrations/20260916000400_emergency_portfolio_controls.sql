create extension if not exists pgcrypto;

insert into public.admin_settings (key, value_json)
values (
  'emergency_portfolio_controls',
  jsonb_build_object(
    'ai_trade_proposals_enabled', true,
    'broker_connectivity_enabled', true,
    'new_orders_enabled', true,
    'read_only', false,
    'investor_transactions_enabled', true,
    'manual_reconciliation_required', false,
    'version', 1,
    'updated_at', now(),
    'updated_by', null
  )
)
on conflict (key) do nothing;

create table if not exists public.portfolio_emergency_control_events (
  id uuid primary key,
  event_sequence bigint generated always as identity unique,
  action text not null check (action in ('LOCKDOWN_ACTIVATED', 'CONTROLS_RESTRICTED', 'CONTROLS_RELAXED')),
  actor_type text not null check (actor_type = 'human_admin'),
  actor_user_id uuid not null,
  actor_email text,
  reason text not null check (char_length(reason) >= 10),
  previous_state jsonb not null,
  next_state jsonb not null,
  changed_controls jsonb not null,
  human_approval boolean not null default false,
  approval_confirmation text,
  request_id text,
  ip_address text,
  user_agent text,
  previous_event_hash text not null,
  event_hash text not null unique,
  created_at timestamptz not null
);

create index if not exists portfolio_emergency_events_created_idx
  on public.portfolio_emergency_control_events(created_at desc);
create index if not exists portfolio_emergency_events_actor_idx
  on public.portfolio_emergency_control_events(actor_user_id, created_at desc);

alter table public.portfolio_emergency_control_events enable row level security;

drop policy if exists portfolio_emergency_events_select_admin
  on public.portfolio_emergency_control_events;
create policy portfolio_emergency_events_select_admin
  on public.portfolio_emergency_control_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

revoke all on table public.portfolio_emergency_control_events
  from public, anon, authenticated, service_role;
grant select on table public.portfolio_emergency_control_events
  to authenticated, service_role;

create or replace function public.prevent_portfolio_emergency_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Portfolio emergency audit records are immutable.' using errcode = '42501';
end;
$$;

drop trigger if exists prevent_portfolio_emergency_event_update_delete
  on public.portfolio_emergency_control_events;
create trigger prevent_portfolio_emergency_event_update_delete
  before update or delete on public.portfolio_emergency_control_events
  for each row execute function public.prevent_portfolio_emergency_event_mutation();

create or replace function public.guard_emergency_portfolio_setting_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  protected_key text := 'emergency_portfolio_controls';
  transition_authorized boolean :=
    coalesce(current_setting('app.emergency_portfolio_transition', true), '') = 'authorized_human_transition';
begin
  if (
    (tg_op <> 'INSERT' and old.key = protected_key)
    or (tg_op <> 'DELETE' and new.key = protected_key)
  ) and not transition_authorized then
    raise exception 'Emergency portfolio controls can only be changed through the authorized transition function.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_emergency_portfolio_setting
  on public.admin_settings;
create trigger guard_emergency_portfolio_setting
  before insert or update or delete on public.admin_settings
  for each row execute function public.guard_emergency_portfolio_setting_mutation();

drop policy if exists "admin_settings_upsert_admin" on public.admin_settings;
create policy "admin_settings_upsert_admin"
  on public.admin_settings
  for all
  to authenticated
  using (
    key <> 'emergency_portfolio_controls'
    and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and coalesce(au.active, true) = true
    )
  )
  with check (
    key <> 'emergency_portfolio_controls'
    and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and coalesce(au.active, true) = true
    )
  );

create or replace function public.set_emergency_portfolio_controls(
  p_next_state jsonb,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_email text,
  p_actor_type text,
  p_reason text,
  p_human_approval boolean,
  p_approval_confirmation text,
  p_request_id text,
  p_ip_address text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_state jsonb;
  next_state jsonb;
  changed_controls jsonb := '{}'::jsonb;
  current_version integer;
  relaxing boolean := false;
  lockdown boolean := false;
  event_action text;
  event_id uuid := gen_random_uuid();
  event_created_at timestamptz := clock_timestamp();
  prior_hash text := 'GENESIS';
  calculated_hash text;
  control_key text;
  current_value boolean;
  next_value boolean;
  enable_keys text[] := array[
    'ai_trade_proposals_enabled',
    'broker_connectivity_enabled',
    'new_orders_enabled',
    'investor_transactions_enabled'
  ];
begin
  if p_actor_type <> 'human_admin' or p_actor_user_id is null then
    raise exception 'Only an authenticated human administrator can change emergency controls.'
      using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'A documented reason of at least 10 characters is required.'
      using errcode = 'P0001';
  end if;

  perform set_config('app.emergency_portfolio_transition', 'authorized_human_transition', true);

  select value_json
  into current_state
  from public.admin_settings
  where key = 'emergency_portfolio_controls'
  for update;

  if current_state is null then
    raise exception 'Emergency portfolio controls are not initialized.' using errcode = 'P0001';
  end if;

  current_version := coalesce((current_state ->> 'version')::integer, 1);
  if p_expected_version is null or p_expected_version <> current_version then
    raise exception 'Emergency controls changed after they were loaded. Refresh before applying another change.'
      using errcode = '40001';
  end if;

  foreach control_key in array array[
    'ai_trade_proposals_enabled',
    'broker_connectivity_enabled',
    'new_orders_enabled',
    'read_only',
    'investor_transactions_enabled',
    'manual_reconciliation_required'
  ] loop
    if jsonb_typeof(p_next_state -> control_key) is distinct from 'boolean' then
      raise exception 'Emergency control % must be boolean.', control_key using errcode = 'P0001';
    end if;
  end loop;

  next_state := jsonb_build_object(
    'ai_trade_proposals_enabled', (p_next_state ->> 'ai_trade_proposals_enabled')::boolean,
    'broker_connectivity_enabled', (p_next_state ->> 'broker_connectivity_enabled')::boolean,
    'new_orders_enabled', (p_next_state ->> 'new_orders_enabled')::boolean,
    'read_only', (p_next_state ->> 'read_only')::boolean,
    'investor_transactions_enabled', (p_next_state ->> 'investor_transactions_enabled')::boolean,
    'manual_reconciliation_required', (p_next_state ->> 'manual_reconciliation_required')::boolean
  );

  if (next_state ->> 'manual_reconciliation_required')::boolean then
    next_state := jsonb_set(next_state, '{new_orders_enabled}', 'false'::jsonb, true);
    next_state := jsonb_set(next_state, '{investor_transactions_enabled}', 'false'::jsonb, true);
  end if;

  foreach control_key in array array[
    'ai_trade_proposals_enabled',
    'broker_connectivity_enabled',
    'new_orders_enabled',
    'read_only',
    'investor_transactions_enabled',
    'manual_reconciliation_required'
  ] loop
    current_value := coalesce((current_state ->> control_key)::boolean, false);
    next_value := (next_state ->> control_key)::boolean;
    if current_value is distinct from next_value then
      changed_controls := changed_controls || jsonb_build_object(
        control_key,
        jsonb_build_object('previous', current_value, 'next', next_value)
      );
      if control_key = any(enable_keys) and not current_value and next_value then
        relaxing := true;
      elsif control_key in ('read_only', 'manual_reconciliation_required') and current_value and not next_value then
        relaxing := true;
      end if;
    end if;
  end loop;

  if changed_controls = '{}'::jsonb then
    raise exception 'No emergency control changed.' using errcode = 'P0001';
  end if;

  if relaxing and (
    not coalesce(p_human_approval, false)
    or coalesce(p_approval_confirmation, '') <> 'RE-ENABLE FINANCIAL ACTIONS'
  ) then
    raise exception 'Explicit human approval is required to re-enable financial actions.'
      using errcode = '42501';
  end if;

  lockdown :=
    not (next_state ->> 'ai_trade_proposals_enabled')::boolean
    and not (next_state ->> 'broker_connectivity_enabled')::boolean
    and not (next_state ->> 'new_orders_enabled')::boolean
    and (next_state ->> 'read_only')::boolean
    and not (next_state ->> 'investor_transactions_enabled')::boolean
    and (next_state ->> 'manual_reconciliation_required')::boolean;

  event_action := case
    when lockdown then 'LOCKDOWN_ACTIVATED'
    when relaxing then 'CONTROLS_RELAXED'
    else 'CONTROLS_RESTRICTED'
  end;

  next_state := next_state || jsonb_build_object(
    'version', current_version + 1,
    'updated_at', event_created_at,
    'updated_by', p_actor_user_id
  );

  select event_hash
  into prior_hash
  from public.portfolio_emergency_control_events
  order by event_sequence desc
  limit 1;
  prior_hash := coalesce(prior_hash, 'GENESIS');

  calculated_hash := encode(
    digest(
      concat_ws(
        '|',
        prior_hash,
        event_id::text,
        event_action,
        p_actor_user_id::text,
        coalesce(p_actor_email, ''),
        trim(p_reason),
        current_state::text,
        next_state::text,
        changed_controls::text,
        event_created_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  update public.admin_settings
  set value_json = next_state,
      updated_by = p_actor_user_id
  where key = 'emergency_portfolio_controls';

  insert into public.portfolio_emergency_control_events (
    id,
    action,
    actor_type,
    actor_user_id,
    actor_email,
    reason,
    previous_state,
    next_state,
    changed_controls,
    human_approval,
    approval_confirmation,
    request_id,
    ip_address,
    user_agent,
    previous_event_hash,
    event_hash,
    created_at
  ) values (
    event_id,
    event_action,
    'human_admin',
    p_actor_user_id,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    trim(p_reason),
    current_state,
    next_state,
    changed_controls,
    coalesce(p_human_approval, false),
    nullif(p_approval_confirmation, ''),
    nullif(p_request_id, ''),
    nullif(p_ip_address, ''),
    nullif(p_user_agent, ''),
    prior_hash,
    calculated_hash,
    event_created_at
  );

  return jsonb_build_object(
    'state', next_state,
    'eventId', event_id,
    'eventHash', calculated_hash,
    'action', event_action
  );
end;
$$;

revoke all on function public.set_emergency_portfolio_controls(
  jsonb, integer, uuid, text, text, text, boolean, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_emergency_portfolio_controls(
  jsonb, integer, uuid, text, text, text, boolean, text, text, text, text
) to service_role;

create or replace function public.enforce_emergency_portfolio_read_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  control_state jsonb;
begin
  select value_json into control_state
  from public.admin_settings
  where key = 'emergency_portfolio_controls';

  if control_state is null or coalesce((control_state ->> 'read_only')::boolean, false) then
    raise exception 'The investment system is in READ ONLY mode.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_emergency_investor_transaction_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  control_state jsonb;
begin
  select value_json into control_state
  from public.admin_settings
  where key = 'emergency_portfolio_controls';

  if coalesce((control_state ->> 'read_only')::boolean, false)
    or not coalesce((control_state ->> 'investor_transactions_enabled')::boolean, false)
    or coalesce((control_state ->> 'manual_reconciliation_required')::boolean, false)
  then
    raise exception 'Investor transaction processing is frozen by Emergency Portfolio Control.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_emergency_broker_connectivity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  control_state jsonb;
begin
  select value_json into control_state
  from public.admin_settings
  where key = 'emergency_portfolio_controls';

  -- Deleting a connection remains available as a defensive action.
  if tg_op <> 'DELETE' and (
    coalesce((control_state ->> 'read_only')::boolean, false)
    or not coalesce((control_state ->> 'broker_connectivity_enabled')::boolean, false)
  ) then
    raise exception 'Broker connectivity is disabled by Emergency Portfolio Control.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_emergency_portfolio_read_only() from public, anon, authenticated;
revoke all on function public.enforce_emergency_investor_transaction_freeze() from public, anon, authenticated;
revoke all on function public.enforce_emergency_broker_connectivity() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'neuro_analysis_cases',
    'neuro_analysis_committee_decisions',
    'neuro_analysis_committee_packets',
    'neuro_analysis_decisions',
    'neuro_analysis_filings',
    'neuro_analysis_jobs',
    'neuro_analysis_original_theses',
    'neuro_analysis_policies',
    'neuro_analysis_position_exit_reviews',
    'neuro_analysis_reports',
    'neuro_analysis_snapshots',
    'neuro_analysis_thesis_reviews',
    'broker_imports',
    'broker_order_events',
    'trade_import_batches',
    'trades'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists emergency_portfolio_read_only on public.%I', table_name);
      execute format(
        'create trigger emergency_portfolio_read_only before insert or update or delete on public.%I for each row execute function public.enforce_emergency_portfolio_read_only()',
        table_name
      );
    end if;
  end loop;

  foreach table_name in array array[
    'neuro_capital_account_events',
    'neuro_capital_accounts',
    'neuro_capital_nav_history',
    'neuro_capital_pools'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists emergency_investor_transaction_freeze on public.%I', table_name);
      execute format(
        'create trigger emergency_investor_transaction_freeze before insert or update or delete on public.%I for each row execute function public.enforce_emergency_investor_transaction_freeze()',
        table_name
      );
    end if;
  end loop;

  foreach table_name in array array[
    'broker_oauth_connections',
    'snaptrade_authorizations',
    'snaptrade_users',
    'neuro_analysis_snaptrade_users'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists emergency_broker_connectivity on public.%I', table_name);
      execute format(
        'create trigger emergency_broker_connectivity before insert or update or delete on public.%I for each row execute function public.enforce_emergency_broker_connectivity()',
        table_name
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
