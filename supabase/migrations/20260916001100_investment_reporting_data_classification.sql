-- Distribution classification and field-level lineage for external reporting.
-- Internal research cannot be promoted directly into a partner report.

create extension if not exists pgcrypto;

create table if not exists public.investment_data_classification_catalog (
  classification_key text primary key check (
    classification_key in (
      'INTERNAL_ONLY', 'DERIVED_DISTRIBUTABLE', 'PUBLIC_SOURCE',
      'FUND_ACCOUNTING', 'APPROVED_FOR_REPORTING', 'RESTRICTED', 'UNKNOWN_LICENSE'
    )
  ),
  definition text not null,
  can_be_reported boolean not null,
  may_be_promoted_to_reporting boolean not null,
  created_at timestamptz not null default now()
);

insert into public.investment_data_classification_catalog (
  classification_key, definition, can_be_reported, may_be_promoted_to_reporting
) values
  ('INTERNAL_ONLY', 'Information permitted for internal use only.', false, false),
  ('DERIVED_DISTRIBUTABLE', 'Derived calculation that may be distributed only after licensing and human approval.', false, true),
  ('PUBLIC_SOURCE', 'Information originating from an approved public source.', false, true),
  ('FUND_ACCOUNTING', 'Information generated from the investment vehicle accounting records.', false, true),
  ('APPROVED_FOR_REPORTING', 'Information explicitly approved by an authorized human for external reporting.', true, false),
  ('RESTRICTED', 'Information that must not leave the internal system.', false, false),
  ('UNKNOWN_LICENSE', 'Information whose distribution rights have not been verified.', false, false)
on conflict (classification_key) do update
set definition = excluded.definition,
    can_be_reported = excluded.can_be_reported,
    may_be_promoted_to_reporting = excluded.may_be_promoted_to_reporting;

create table if not exists public.investment_reportable_data_points (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid,
  field_key text not null check (field_key ~ '^[a-z0-9_\.]+$'),
  field_label text not null check (char_length(btrim(field_label)) between 1 and 200),
  value_status text not null check (value_status in ('DATA_AVAILABLE', 'DATA_NOT_AVAILABLE')),
  original_value jsonb,
  calculated_value jsonb,
  display_value text not null,
  value_type text not null check (
    value_type in ('MONEY', 'DECIMAL', 'PERCENTAGE', 'INTEGER', 'TEXT', 'DATE', 'BOOLEAN', 'JSON')
  ),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  units text not null,
  source_type text not null check (
    source_type in ('PUBLIC_DOCUMENT', 'LICENSED_INTERNAL', 'FUND_LEDGER', 'DETERMINISTIC_CALCULATION', 'MANUAL_VERIFIED')
  ),
  source_id text references public.investment_data_sources(source_id) on delete restrict,
  source_document text not null,
  source_reference text not null,
  source_reporting_period text,
  source_publication_date date,
  source_retrieved_at timestamptz not null,
  license_classification text not null check (
    license_classification in ('PUBLIC', 'LICENSED_INTERNAL_ONLY', 'DISTRIBUTABLE', 'UNKNOWN', 'NOT_APPLICABLE')
  ),
  origin_classification text not null references public.investment_data_classification_catalog(classification_key) on delete restrict,
  calculation_method text,
  formula text,
  formula_inputs jsonb,
  calculation_timestamp timestamptz,
  reporting_period_start date,
  reporting_period_end date,
  effective_date date not null,
  data_version text not null,
  calculation_version text,
  source_sha256 text not null,
  data_point_sha256 text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint investment_reportable_data_points_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  check (
    (value_status = 'DATA_NOT_AVAILABLE'
      and original_value is null
      and calculated_value is null
      and display_value = 'DATA NOT AVAILABLE')
    or (value_status = 'DATA_AVAILABLE'
      and (original_value is not null or calculated_value is not null)
      and display_value <> 'DATA NOT AVAILABLE')
  ),
  check (
    (source_type = 'DETERMINISTIC_CALCULATION'
      and calculated_value is not null
      and calculation_method is not null
      and formula is not null
      and formula_inputs is not null
      and calculation_timestamp is not null
      and calculation_version is not null)
    or source_type <> 'DETERMINISTIC_CALCULATION'
  ),
  check (reporting_period_end is null or reporting_period_start is null or reporting_period_end >= reporting_period_start),
  check (origin_classification <> 'APPROVED_FOR_REPORTING')
);

create table if not exists public.investment_data_point_classification_events (
  id uuid primary key default gen_random_uuid(),
  data_point_id uuid not null references public.investment_reportable_data_points(id) on delete restrict,
  previous_classification text references public.investment_data_classification_catalog(classification_key) on delete restrict,
  new_classification text not null references public.investment_data_classification_catalog(classification_key) on delete restrict,
  decision text not null check (decision in ('CLASSIFIED', 'APPROVED', 'REVOKED', 'REJECTED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  rationale text not null check (char_length(btrim(rationale)) between 1 and 4000),
  licensing_evidence jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (id, data_point_id),
  check (
    (new_classification = 'APPROVED_FOR_REPORTING' and decision = 'APPROVED')
    or (new_classification <> 'APPROVED_FOR_REPORTING' and decision <> 'APPROVED')
  )
);

create index if not exists investment_reportable_data_points_field_period_idx
  on public.investment_reportable_data_points(pool_id, field_key, effective_date desc);
create index if not exists investment_data_point_classification_events_latest_idx
  on public.investment_data_point_classification_events(data_point_id, occurred_at desc, id desc);

create or replace function public.investment_data_point_current_classification(p_data_point_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select event.new_classification
      from public.investment_data_point_classification_events event
      where event.data_point_id = p_data_point_id
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    (
      select point.origin_classification
      from public.investment_reportable_data_points point
      where point.id = p_data_point_id
    )
  );
$$;

create or replace function public.classify_investment_reporting_data_point(
  p_actor_user_id uuid,
  p_data_point_id uuid,
  p_new_classification text,
  p_rationale text,
  p_licensing_evidence jsonb default '[]'::jsonb
)
returns public.investment_data_point_classification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  point_row public.investment_reportable_data_points;
  previous_value text;
  decision_value text;
  created_event public.investment_data_point_classification_events;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.approve') then
    raise exception 'Report approval permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Data-classification actor must be an authenticated human user';
  end if;
  select * into point_row from public.investment_reportable_data_points where id = p_data_point_id;
  if point_row.id is null then raise exception 'Reportable data point not found'; end if;
  if not exists (
    select 1 from public.investment_data_classification_catalog
    where classification_key = p_new_classification
  ) then
    raise exception 'Unknown distribution classification';
  end if;

  previous_value := public.investment_data_point_current_classification(p_data_point_id);
  if p_new_classification = 'APPROVED_FOR_REPORTING' then
    if point_row.value_status <> 'DATA_AVAILABLE' then
      raise exception 'DATA NOT AVAILABLE cannot be approved for reporting';
    end if;
    if previous_value not in ('PUBLIC_SOURCE', 'FUND_ACCOUNTING', 'DERIVED_DISTRIBUTABLE') then
      raise exception 'Classification % cannot be promoted directly into reporting', previous_value;
    end if;
    if point_row.license_classification in ('LICENSED_INTERNAL_ONLY', 'UNKNOWN') then
      raise exception 'Data licensing does not permit external reporting';
    end if;
    if point_row.source_id is not null and not exists (
      select 1 from public.investment_data_sources source
      where source.source_id = point_row.source_id
        and source.investor_display_permitted
    ) then
      raise exception 'The registered data source is not approved for investor display';
    end if;
    decision_value := 'APPROVED';
  elsif previous_value = 'APPROVED_FOR_REPORTING' then
    decision_value := 'REVOKED';
  elsif p_new_classification in ('RESTRICTED', 'UNKNOWN_LICENSE') then
    decision_value := 'REJECTED';
  else
    decision_value := 'CLASSIFIED';
  end if;

  insert into public.investment_data_point_classification_events (
    data_point_id, previous_classification, new_classification, decision,
    actor_user_id, rationale, licensing_evidence
  ) values (
    p_data_point_id, previous_value, p_new_classification, decision_value,
    p_actor_user_id, left(btrim(p_rationale), 4000), coalesce(p_licensing_evidence, '[]'::jsonb)
  ) returning * into created_event;
  return created_event;
end;
$$;

create or replace function public.prevent_investment_reporting_lineage_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Reporting data lineage is immutable; create a new version or classification event';
end;
$$;

drop trigger if exists investment_reportable_data_points_immutable on public.investment_reportable_data_points;
create trigger investment_reportable_data_points_immutable
  before update or delete on public.investment_reportable_data_points
  for each row execute function public.prevent_investment_reporting_lineage_mutation();
drop trigger if exists investment_data_point_classification_events_immutable on public.investment_data_point_classification_events;
create trigger investment_data_point_classification_events_immutable
  before update or delete on public.investment_data_point_classification_events
  for each row execute function public.prevent_investment_reporting_lineage_mutation();

alter table public.investment_data_classification_catalog enable row level security;
alter table public.investment_reportable_data_points enable row level security;
alter table public.investment_data_point_classification_events enable row level security;

drop policy if exists investment_data_classification_catalog_read_internal on public.investment_data_classification_catalog;
create policy investment_data_classification_catalog_read_internal
  on public.investment_data_classification_catalog for select to authenticated
  using (public.investment_current_user_has_permission('reports.view'));
drop policy if exists investment_reportable_data_points_read_internal on public.investment_reportable_data_points;
create policy investment_reportable_data_points_read_internal
  on public.investment_reportable_data_points for select to authenticated
  using (public.investment_current_user_has_permission('reports.view'));
drop policy if exists investment_data_point_classification_events_read_internal on public.investment_data_point_classification_events;
create policy investment_data_point_classification_events_read_internal
  on public.investment_data_point_classification_events for select to authenticated
  using (public.investment_current_user_has_permission('reports.view'));

revoke insert, update, delete on public.investment_data_classification_catalog from anon, authenticated;
revoke insert, update, delete on public.investment_reportable_data_points from anon, authenticated;
revoke insert, update, delete on public.investment_data_point_classification_events from anon, authenticated;
grant select on public.investment_data_classification_catalog to authenticated;
grant select on public.investment_reportable_data_points to authenticated;
grant select on public.investment_data_point_classification_events to authenticated;
grant all on public.investment_data_classification_catalog to service_role;
grant all on public.investment_reportable_data_points to service_role;
grant all on public.investment_data_point_classification_events to service_role;

revoke all on function public.investment_data_point_current_classification(uuid)
  from public, anon, authenticated;
grant execute on function public.investment_data_point_current_classification(uuid)
  to service_role;
revoke all on function public.classify_investment_reporting_data_point(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.classify_investment_reporting_data_point(uuid, uuid, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
