-- Private internal investment operating model and granular staff authorization.
-- Partners are accounting records only and never receive application identities.

create extension if not exists pgcrypto;

create table if not exists public.investment_operating_configuration (
  singleton boolean primary key default true check (singleton),
  operating_model text not null default 'PRIVATE_INTERNAL'
    check (operating_model = 'PRIVATE_INTERNAL'),
  partner_portal_enabled boolean not null default false
    check (partner_portal_enabled = false),
  automated_report_delivery_enabled boolean not null default false
    check (automated_report_delivery_enabled = false),
  real_money_processing_enabled boolean not null default false
    check (real_money_processing_enabled = false),
  default_base_currency text not null default 'USD'
    check (default_base_currency ~ '^[A-Z]{3}$'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.investment_operating_configuration (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.investment_internal_permissions (
  permission_key text primary key check (permission_key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_internal_roles (
  role_key text primary key check (
    role_key in (
      'ADMINISTRATOR',
      'INVESTMENT_MANAGER',
      'ANALYST',
      'ACCOUNTING',
      'REPORT_REVIEWER',
      'READ_ONLY_INTERNAL'
    )
  ),
  display_name text not null,
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_internal_role_permissions (
  role_key text not null references public.investment_internal_roles(role_key) on delete restrict,
  permission_key text not null references public.investment_internal_permissions(permission_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.investment_internal_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.investment_internal_roles(role_key) on delete restrict,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, role_key),
  check (expires_at is null or expires_at > granted_at),
  check (
    (active and revoked_at is null and revoked_by is null)
    or (not active and revoked_at is not null)
  )
);

create table if not exists public.investment_internal_role_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.investment_internal_roles(role_key) on delete restrict,
  event_type text not null check (event_type in ('GRANTED', 'REVOKED', 'EXPIRED', 'REACTIVATED')),
  actor_user_id uuid references auth.users(id) on delete set null,
  previous_state jsonb,
  new_state jsonb not null,
  reason text not null default '',
  occurred_at timestamptz not null default now()
);

insert into public.investment_internal_permissions (permission_key, description)
values
  ('internal_users.manage', 'Grant and revoke internal investment roles.'),
  ('research.view', 'View internal investment research and evidence.'),
  ('research.modify', 'Create and modify internal research work products.'),
  ('research.run_ai', 'Run AI-assisted research under internal policy.'),
  ('investments.approve', 'Record authorized human investment decisions.'),
  ('portfolio.view', 'View portfolio holdings, exposures and risk.'),
  ('portfolio.transact', 'Enter controlled portfolio transactions.'),
  ('accounting.view', 'View fund and partner accounting records.'),
  ('accounting.modify', 'Post accounting entries and controlled corrections.'),
  ('partners.view', 'View partner identity and capital-account information.'),
  ('partners.modify', 'Create and maintain internal partner accounting records.'),
  ('reports.view', 'View reporting datasets and report history.'),
  ('reports.generate', 'Generate and revise report drafts.'),
  ('reports.review', 'Move report drafts into and through human review.'),
  ('reports.approve', 'Approve and issue partner reports.'),
  ('exports.create', 'Export approved internal or reporting information.'),
  ('integrations.configure', 'Configure approved data, broker and custodian integrations.')
on conflict (permission_key) do update
set description = excluded.description;

insert into public.investment_internal_roles (role_key, display_name, description)
values
  ('ADMINISTRATOR', 'Administrator', 'Full internal investment-system administration.'),
  ('INVESTMENT_MANAGER', 'Investment Manager', 'Research, portfolio and investment-decision authority.'),
  ('ANALYST', 'Analyst', 'Internal research and AI-assisted analysis without approval authority.'),
  ('ACCOUNTING', 'Accounting', 'Fund, partner, reconciliation and accounting operations.'),
  ('REPORT_REVIEWER', 'Report Reviewer', 'Reporting review and approval workflow.'),
  ('READ_ONLY_INTERNAL', 'Read Only Internal', 'Read-only access to approved internal surfaces.')
on conflict (role_key) do update
set display_name = excluded.display_name,
    description = excluded.description;

insert into public.investment_internal_role_permissions (role_key, permission_key)
select 'ADMINISTRATOR', permission_key
from public.investment_internal_permissions
on conflict do nothing;

insert into public.investment_internal_role_permissions (role_key, permission_key)
values
  ('INVESTMENT_MANAGER', 'research.view'),
  ('INVESTMENT_MANAGER', 'research.modify'),
  ('INVESTMENT_MANAGER', 'research.run_ai'),
  ('INVESTMENT_MANAGER', 'investments.approve'),
  ('INVESTMENT_MANAGER', 'portfolio.view'),
  ('INVESTMENT_MANAGER', 'portfolio.transact'),
  ('INVESTMENT_MANAGER', 'accounting.view'),
  ('INVESTMENT_MANAGER', 'partners.view'),
  ('INVESTMENT_MANAGER', 'reports.view'),
  ('INVESTMENT_MANAGER', 'reports.generate'),
  ('INVESTMENT_MANAGER', 'reports.review'),
  ('INVESTMENT_MANAGER', 'exports.create'),
  ('ANALYST', 'research.view'),
  ('ANALYST', 'research.modify'),
  ('ANALYST', 'research.run_ai'),
  ('ANALYST', 'portfolio.view'),
  ('ACCOUNTING', 'portfolio.view'),
  ('ACCOUNTING', 'accounting.view'),
  ('ACCOUNTING', 'accounting.modify'),
  ('ACCOUNTING', 'partners.view'),
  ('ACCOUNTING', 'partners.modify'),
  ('ACCOUNTING', 'reports.view'),
  ('ACCOUNTING', 'reports.generate'),
  ('ACCOUNTING', 'reports.review'),
  ('ACCOUNTING', 'exports.create'),
  ('REPORT_REVIEWER', 'portfolio.view'),
  ('REPORT_REVIEWER', 'accounting.view'),
  ('REPORT_REVIEWER', 'partners.view'),
  ('REPORT_REVIEWER', 'reports.view'),
  ('REPORT_REVIEWER', 'reports.generate'),
  ('REPORT_REVIEWER', 'reports.review'),
  ('REPORT_REVIEWER', 'reports.approve'),
  ('REPORT_REVIEWER', 'exports.create'),
  ('READ_ONLY_INTERNAL', 'research.view'),
  ('READ_ONLY_INTERNAL', 'portfolio.view'),
  ('READ_ONLY_INTERNAL', 'accounting.view'),
  ('READ_ONLY_INTERNAL', 'reports.view')
on conflict do nothing;

create or replace function public.investment_user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.admin_users admin_user
      where admin_user.user_id = p_user_id
        and coalesce(admin_user.active, true)
    )
    or exists (
      select 1
      from public.investment_internal_user_roles user_role
      join public.investment_internal_role_permissions role_permission
        on role_permission.role_key = user_role.role_key
      where user_role.user_id = p_user_id
        and user_role.active
        and (user_role.expires_at is null or user_role.expires_at > now())
        and role_permission.permission_key = p_permission_key
    )
  );
$$;

create or replace function public.investment_current_user_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.investment_user_has_permission(auth.uid(), p_permission_key);
$$;

create or replace function public.assign_investment_internal_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role_key text,
  p_expires_at timestamptz default null,
  p_reason text default ''
)
returns public.investment_internal_user_roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_row public.investment_internal_user_roles;
  assigned_row public.investment_internal_user_roles;
  event_type_value text;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'internal_users.manage') then
    raise exception 'Authorized internal-user administrator required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Role actor must be an authenticated human user';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Internal user does not exist';
  end if;
  if not exists (select 1 from public.investment_internal_roles where role_key = p_role_key) then
    raise exception 'Unknown internal investment role';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Role expiration must be in the future';
  end if;

  select * into previous_row
  from public.investment_internal_user_roles
  where user_id = p_user_id and role_key = p_role_key;

  event_type_value := case when previous_row.user_id is null then 'GRANTED' else 'REACTIVATED' end;

  insert into public.investment_internal_user_roles (
    user_id, role_key, active, granted_by, granted_at, expires_at,
    revoked_by, revoked_at, notes
  ) values (
    p_user_id, p_role_key, true, p_actor_user_id, now(), p_expires_at,
    null, null, left(coalesce(p_reason, ''), 1000)
  )
  on conflict (user_id, role_key) do update
  set active = true,
      granted_by = excluded.granted_by,
      granted_at = excluded.granted_at,
      expires_at = excluded.expires_at,
      revoked_by = null,
      revoked_at = null,
      notes = excluded.notes
  returning * into assigned_row;

  insert into public.investment_internal_role_events (
    user_id, role_key, event_type, actor_user_id, previous_state, new_state, reason
  ) values (
    p_user_id,
    p_role_key,
    event_type_value,
    p_actor_user_id,
    case when previous_row.user_id is null then null else to_jsonb(previous_row) end,
    to_jsonb(assigned_row),
    left(coalesce(p_reason, ''), 1000)
  );

  return assigned_row;
end;
$$;

create or replace function public.revoke_investment_internal_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_role_key text,
  p_reason text default ''
)
returns public.investment_internal_user_roles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_row public.investment_internal_user_roles;
  revoked_row public.investment_internal_user_roles;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'internal_users.manage') then
    raise exception 'Authorized internal-user administrator required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Role actor must be an authenticated human user';
  end if;

  select * into previous_row
  from public.investment_internal_user_roles
  where user_id = p_user_id and role_key = p_role_key and active
  for update;
  if previous_row.user_id is null then
    raise exception 'Active internal role assignment not found';
  end if;

  update public.investment_internal_user_roles
  set active = false,
      revoked_by = p_actor_user_id,
      revoked_at = now(),
      notes = left(coalesce(p_reason, ''), 1000)
  where user_id = p_user_id and role_key = p_role_key
  returning * into revoked_row;

  insert into public.investment_internal_role_events (
    user_id, role_key, event_type, actor_user_id, previous_state, new_state, reason
  ) values (
    p_user_id, p_role_key, 'REVOKED', p_actor_user_id,
    to_jsonb(previous_row), to_jsonb(revoked_row), left(coalesce(p_reason, ''), 1000)
  );

  return revoked_row;
end;
$$;

create or replace function public.prevent_investment_role_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Internal role events are append-only';
end;
$$;

drop trigger if exists investment_role_events_prevent_mutation on public.investment_internal_role_events;
create trigger investment_role_events_prevent_mutation
  before update or delete on public.investment_internal_role_events
  for each row execute function public.prevent_investment_role_event_mutation();

drop trigger if exists investment_operating_configuration_set_updated_at on public.investment_operating_configuration;
create trigger investment_operating_configuration_set_updated_at
  before update on public.investment_operating_configuration
  for each row execute function public.set_updated_at();

drop trigger if exists investment_internal_user_roles_set_updated_at on public.investment_internal_user_roles;
create trigger investment_internal_user_roles_set_updated_at
  before update on public.investment_internal_user_roles
  for each row execute function public.set_updated_at();

alter table public.investment_operating_configuration enable row level security;
alter table public.investment_internal_permissions enable row level security;
alter table public.investment_internal_roles enable row level security;
alter table public.investment_internal_role_permissions enable row level security;
alter table public.investment_internal_user_roles enable row level security;
alter table public.investment_internal_role_events enable row level security;

drop policy if exists investment_operating_configuration_read_internal on public.investment_operating_configuration;
create policy investment_operating_configuration_read_internal
  on public.investment_operating_configuration for select to authenticated
  using (
    public.investment_current_user_has_permission('research.view')
    or public.investment_current_user_has_permission('accounting.view')
    or public.investment_current_user_has_permission('reports.view')
  );

drop policy if exists investment_permissions_read_internal on public.investment_internal_permissions;
create policy investment_permissions_read_internal
  on public.investment_internal_permissions for select to authenticated
  using (public.investment_current_user_has_permission('internal_users.manage'));

drop policy if exists investment_roles_read_internal on public.investment_internal_roles;
create policy investment_roles_read_internal
  on public.investment_internal_roles for select to authenticated
  using (public.investment_current_user_has_permission('internal_users.manage'));

drop policy if exists investment_role_permissions_read_internal on public.investment_internal_role_permissions;
create policy investment_role_permissions_read_internal
  on public.investment_internal_role_permissions for select to authenticated
  using (public.investment_current_user_has_permission('internal_users.manage'));

drop policy if exists investment_user_roles_read on public.investment_internal_user_roles;
create policy investment_user_roles_read
  on public.investment_internal_user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.investment_current_user_has_permission('internal_users.manage')
  );

drop policy if exists investment_role_events_read on public.investment_internal_role_events;
create policy investment_role_events_read
  on public.investment_internal_role_events for select to authenticated
  using (
    user_id = auth.uid()
    or public.investment_current_user_has_permission('internal_users.manage')
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_operating_configuration',
    'investment_internal_permissions',
    'investment_internal_roles',
    'investment_internal_role_permissions',
    'investment_internal_user_roles',
    'investment_internal_role_events'
  ]
  loop
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on function public.investment_user_has_permission(uuid, text)
  from public, anon, authenticated;
grant execute on function public.investment_user_has_permission(uuid, text)
  to service_role;

revoke all on function public.investment_current_user_has_permission(text)
  from public, anon;
grant execute on function public.investment_current_user_has_permission(text)
  to authenticated, service_role;

revoke all on function public.assign_investment_internal_role(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.assign_investment_internal_role(uuid, uuid, text, timestamptz, text)
  to service_role;

revoke all on function public.revoke_investment_internal_role(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_investment_internal_role(uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';
