-- Frozen reporting snapshots and human-controlled report workflow.
-- No portal or automatic delivery is created by this migration.

create extension if not exists pgcrypto;

create table if not exists public.investment_reporting_snapshots (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid,
  reporting_period_start date not null,
  reporting_period_end date not null,
  fund_nav_snapshot_id uuid not null references public.investment_fund_nav_snapshots(id) on delete restrict,
  portfolio_performance_run_id uuid not null references public.investment_portfolio_performance_runs(id) on delete restrict,
  reconciliation_run_id uuid not null references public.investment_reconciliation_runs(id) on delete restrict,
  snapshot_version text not null,
  frozen_payload jsonb not null,
  snapshot_sha256 text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint investment_reporting_snapshots_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  constraint investment_reporting_snapshots_nav_pool_fk
    foreign key (fund_nav_snapshot_id, pool_id)
    references public.investment_fund_nav_snapshots(id, pool_id)
    on delete restrict,
  constraint investment_reporting_snapshots_performance_pool_fk
    foreign key (portfolio_performance_run_id, pool_id)
    references public.investment_portfolio_performance_runs(id, pool_id)
    on delete restrict,
  constraint investment_reporting_snapshots_reconciliation_pool_fk
    foreign key (reconciliation_run_id, pool_id)
    references public.investment_reconciliation_runs(id, pool_id)
    on delete restrict,
  check (reporting_period_end >= reporting_period_start)
);

create table if not exists public.investment_reporting_snapshot_data_points (
  snapshot_id uuid not null references public.investment_reporting_snapshots(id) on delete restrict,
  data_point_id uuid not null references public.investment_reportable_data_points(id) on delete restrict,
  approval_event_id uuid not null references public.investment_data_point_classification_events(id) on delete restrict,
  frozen_data_point jsonb not null,
  primary key (snapshot_id, data_point_id),
  foreign key (approval_event_id, data_point_id)
    references public.investment_data_point_classification_events(id, data_point_id)
    on delete restrict
);

create table if not exists public.investment_reporting_snapshot_partner_performance (
  snapshot_id uuid not null references public.investment_reporting_snapshots(id) on delete restrict,
  partner_performance_run_id uuid not null references public.investment_partner_performance_runs(id) on delete restrict,
  frozen_performance jsonb not null,
  primary key (snapshot_id, partner_performance_run_id)
);

create table if not exists public.investment_reporting_snapshot_benchmarks (
  snapshot_id uuid not null references public.investment_reporting_snapshots(id) on delete restrict,
  benchmark_comparison_id uuid not null references public.investment_benchmark_comparisons(id) on delete restrict,
  frozen_comparison jsonb not null,
  primary key (snapshot_id, benchmark_comparison_id)
);

create table if not exists public.investment_reports (
  id uuid primary key default gen_random_uuid(),
  report_series_id uuid not null default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid,
  report_type text not null check (
    report_type in (
      'MONTHLY_REPORT', 'QUARTERLY_REPORT', 'ANNUAL_REPORT',
      'CAPITAL_ACCOUNT_STATEMENT', 'CONTRIBUTION_STATEMENT', 'DISTRIBUTION_STATEMENT',
      'PERFORMANCE_REPORT', 'PORTFOLIO_SUMMARY', 'MANAGEMENT_PARTNER_LETTER'
    )
  ),
  reporting_period_start date not null,
  reporting_period_end date not null,
  version integer not null check (version > 0),
  data_snapshot_id uuid not null references public.investment_reporting_snapshots(id) on delete restrict,
  calculation_version text not null,
  template_version text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'REVIEW', 'APPROVED', 'ISSUED')),
  generated_by uuid not null references auth.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  issued_by uuid references auth.users(id) on delete restrict,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (report_series_id, version),
  constraint investment_reports_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  check (reporting_period_end >= reporting_period_start),
  check (
    (status = 'DRAFT' and reviewed_at is null and approved_at is null and issued_at is null)
    or (status = 'REVIEW' and reviewed_at is not null and approved_at is null and issued_at is null)
    or (status = 'APPROVED' and reviewed_at is not null and approved_at is not null and issued_at is null)
    or (status = 'ISSUED' and reviewed_at is not null and approved_at is not null and issued_at is not null)
  ),
  check (
    report_type not in ('CAPITAL_ACCOUNT_STATEMENT', 'CONTRIBUTION_STATEMENT', 'DISTRIBUTION_STATEMENT')
    or partner_id is not null
  )
);

create table if not exists public.investment_report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.investment_reports(id) on delete restrict,
  section_key text not null check (section_key ~ '^[a-z0-9_\.]+$'),
  revision integer not null default 1 check (revision > 0),
  section_order integer not null check (section_order >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  content jsonb not null,
  content_origin text not null check (content_origin in ('HUMAN', 'AI_DRAFT', 'DETERMINISTIC_DATA')),
  ai_model text,
  ai_prompt_version text,
  source_disclosures jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (report_id, section_key, revision),
  check (
    (content_origin = 'AI_DRAFT' and ai_model is not null and ai_prompt_version is not null)
    or (content_origin <> 'AI_DRAFT' and ai_model is null and ai_prompt_version is null)
  )
);

create table if not exists public.investment_report_section_data_points (
  report_section_id uuid not null references public.investment_report_sections(id) on delete restrict,
  snapshot_id uuid not null references public.investment_reporting_snapshots(id) on delete restrict,
  data_point_id uuid not null references public.investment_reportable_data_points(id) on delete restrict,
  primary key (report_section_id, data_point_id),
  foreign key (snapshot_id, data_point_id)
    references public.investment_reporting_snapshot_data_points(snapshot_id, data_point_id)
    on delete restrict
);

create table if not exists public.investment_report_section_reviews (
  id uuid primary key default gen_random_uuid(),
  report_section_id uuid not null references public.investment_report_sections(id) on delete restrict,
  decision text not null check (decision in ('APPROVED', 'REJECTED')),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  notes text not null check (char_length(btrim(notes)) between 1 and 4000),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.investment_report_validation_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.investment_reports(id) on delete restrict,
  status text not null check (status in ('PASSED', 'FAILED')),
  validation_version text not null,
  critical_issue_count integer not null check (critical_issue_count >= 0),
  warning_count integer not null check (warning_count >= 0),
  validated_by uuid not null references auth.users(id) on delete restrict,
  validated_at timestamptz not null default now(),
  check ((status = 'PASSED' and critical_issue_count = 0) or status = 'FAILED')
);

create table if not exists public.investment_report_validation_issues (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null references public.investment_report_validation_runs(id) on delete restrict,
  issue_code text not null,
  severity text not null check (severity in ('CRITICAL', 'WARNING')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_report_status_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.investment_reports(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('DRAFT', 'REVIEW', 'APPROVED', 'ISSUED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  report_snapshot jsonb not null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_report_artifacts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.investment_reports(id) on delete restrict,
  artifact_format text not null check (artifact_format in ('PDF', 'CSV', 'XLSX', 'JSON')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  artifact_sha256 text not null,
  rendering_version text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (report_id, artifact_format, artifact_sha256)
);

create index if not exists investment_reports_period_idx
  on public.investment_reports(pool_id, reporting_period_end desc, report_type);
create index if not exists investment_reports_partner_idx
  on public.investment_reports(partner_id, reporting_period_end desc)
  where partner_id is not null;
create index if not exists investment_report_sections_latest_idx
  on public.investment_report_sections(report_id, section_key, revision desc);
create index if not exists investment_report_validation_runs_latest_idx
  on public.investment_report_validation_runs(report_id, validated_at desc);

create or replace function public.freeze_investment_reporting_snapshot(
  p_actor_user_id uuid,
  p_pool_id uuid,
  p_partner_id uuid,
  p_reporting_period_start date,
  p_reporting_period_end date,
  p_fund_nav_snapshot_id uuid,
  p_portfolio_performance_run_id uuid,
  p_reconciliation_run_id uuid,
  p_data_point_ids uuid[] default '{}'::uuid[],
  p_partner_performance_run_ids uuid[] default '{}'::uuid[],
  p_benchmark_comparison_ids uuid[] default '{}'::uuid[],
  p_snapshot_version text default 'reporting-snapshot-v1'
)
returns public.investment_reporting_snapshots
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  nav_row public.investment_fund_nav_snapshots;
  performance_row public.investment_portfolio_performance_runs;
  reconciliation_row public.investment_reconciliation_runs;
  approved_performance_decision text;
  frozen jsonb;
  created_snapshot public.investment_reporting_snapshots;
  data_point_id uuid;
  partner_performance_id uuid;
  benchmark_comparison_id uuid;
  approval_event public.investment_data_point_classification_events;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.generate') then
    raise exception 'Report generation permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Reporting snapshot actor must be an authenticated human user';
  end if;
  if p_reporting_period_end < p_reporting_period_start then
    raise exception 'Reporting period is invalid';
  end if;
  if cardinality(coalesce(p_data_point_ids, '{}'::uuid[])) = 0 then
    raise exception 'A reporting snapshot requires at least one approved data point';
  end if;
  if cardinality(coalesce(p_data_point_ids, '{}'::uuid[])) <>
    (select count(distinct value) from unnest(coalesce(p_data_point_ids, '{}'::uuid[])) value)
    or cardinality(coalesce(p_partner_performance_run_ids, '{}'::uuid[])) <>
    (select count(distinct value) from unnest(coalesce(p_partner_performance_run_ids, '{}'::uuid[])) value)
    or cardinality(coalesce(p_benchmark_comparison_ids, '{}'::uuid[])) <>
    (select count(distinct value) from unnest(coalesce(p_benchmark_comparison_ids, '{}'::uuid[])) value) then
    raise exception 'Reporting snapshot input identifiers must be unique';
  end if;
  if p_partner_id is not null and not exists (
    select 1 from public.investment_partners
    where id = p_partner_id and pool_id = p_pool_id
  ) then
    raise exception 'Partner not found in reporting pool';
  end if;

  select * into nav_row from public.investment_fund_nav_snapshots where id = p_fund_nav_snapshot_id;
  if nav_row.id is null or nav_row.pool_id <> p_pool_id or nav_row.nav_date > p_reporting_period_end then
    raise exception 'Fund NAV snapshot is not valid for the reporting period';
  end if;
  select * into performance_row
  from public.investment_portfolio_performance_runs where id = p_portfolio_performance_run_id;
  if performance_row.id is null
    or performance_row.pool_id <> p_pool_id
    or performance_row.period_start <> p_reporting_period_start
    or performance_row.period_end <> p_reporting_period_end then
    raise exception 'Portfolio performance does not match the reporting period';
  end if;
  select review.decision into approved_performance_decision
  from public.investment_performance_reviews review
  where review.portfolio_performance_run_id = p_portfolio_performance_run_id
  order by review.reviewed_at desc, review.id desc
  limit 1;
  if approved_performance_decision <> 'APPROVED' then
    raise exception 'Portfolio performance requires current human approval';
  end if;

  select * into reconciliation_row
  from public.investment_reconciliation_runs where id = p_reconciliation_run_id;
  if reconciliation_row.id is null
    or reconciliation_row.pool_id <> p_pool_id
    or reconciliation_row.reconciliation_type <> 'PARTNER_CAPITAL_TO_NAV'
    or reconciliation_row.status <> 'PASSED'
    or reconciliation_row.as_of_date <> nav_row.nav_date then
    raise exception 'A passed partner-capital-to-NAV reconciliation is required';
  end if;

  foreach data_point_id in array coalesce(p_data_point_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.investment_reportable_data_points point
      where point.id = data_point_id
        and point.pool_id = p_pool_id
        and point.value_status = 'DATA_AVAILABLE'
        and (point.partner_id is null or point.partner_id = p_partner_id)
    ) then
      raise exception 'Data point % is missing, unavailable, or outside this reporting scope', data_point_id;
    end if;
    select * into approval_event
    from public.investment_data_point_classification_events event
    where event.data_point_id = data_point_id
    order by event.occurred_at desc, event.id desc
    limit 1;
    if approval_event.id is null
      or approval_event.new_classification <> 'APPROVED_FOR_REPORTING'
      or approval_event.decision <> 'APPROVED' then
      raise exception 'Data point % is not approved for reporting', data_point_id;
    end if;
  end loop;

  foreach partner_performance_id in array coalesce(p_partner_performance_run_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.investment_partner_performance_runs run
      where run.id = partner_performance_id
        and run.portfolio_performance_run_id = p_portfolio_performance_run_id
        and run.pool_id = p_pool_id
        and (p_partner_id is null or run.partner_id = p_partner_id)
    ) then
      raise exception 'Partner performance run % does not belong to this snapshot', partner_performance_id;
    end if;
  end loop;
  if p_partner_id is not null and cardinality(coalesce(p_partner_performance_run_ids, '{}'::uuid[])) = 0 then
    raise exception 'Partner reporting snapshots require partner performance';
  end if;

  foreach benchmark_comparison_id in array coalesce(p_benchmark_comparison_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.investment_benchmark_comparisons comparison
      where comparison.id = benchmark_comparison_id
        and comparison.portfolio_performance_run_id = p_portfolio_performance_run_id
    ) then
      raise exception 'Benchmark comparison % does not belong to this performance run', benchmark_comparison_id;
    end if;
  end loop;

  frozen := jsonb_build_object(
    'poolId', p_pool_id,
    'partnerId', p_partner_id,
    'periodStart', p_reporting_period_start,
    'periodEnd', p_reporting_period_end,
    'fundNav', to_jsonb(nav_row),
    'portfolioPerformance', to_jsonb(performance_row),
    'reconciliation', to_jsonb(reconciliation_row),
    'dataPoints', coalesce((
      select jsonb_agg(to_jsonb(point) order by point.field_key, point.id)
      from public.investment_reportable_data_points point
      where point.id = any(coalesce(p_data_point_ids, '{}'::uuid[]))
    ), '[]'::jsonb),
    'partnerPerformance', coalesce((
      select jsonb_agg(to_jsonb(run) order by run.partner_id, run.id)
      from public.investment_partner_performance_runs run
      where run.id = any(coalesce(p_partner_performance_run_ids, '{}'::uuid[]))
    ), '[]'::jsonb),
    'benchmarkComparisons', coalesce((
      select jsonb_agg(to_jsonb(comparison) order by comparison.benchmark_id, comparison.id)
      from public.investment_benchmark_comparisons comparison
      where comparison.id = any(coalesce(p_benchmark_comparison_ids, '{}'::uuid[]))
    ), '[]'::jsonb)
  );

  insert into public.investment_reporting_snapshots (
    pool_id, partner_id, reporting_period_start, reporting_period_end,
    fund_nav_snapshot_id, portfolio_performance_run_id, reconciliation_run_id,
    snapshot_version, frozen_payload, snapshot_sha256, created_by
  ) values (
    p_pool_id, p_partner_id, p_reporting_period_start, p_reporting_period_end,
    p_fund_nav_snapshot_id, p_portfolio_performance_run_id, p_reconciliation_run_id,
    p_snapshot_version, frozen,
    encode(digest(frozen::text || '|' || p_snapshot_version, 'sha256'), 'hex'),
    p_actor_user_id
  ) returning * into created_snapshot;

  foreach data_point_id in array coalesce(p_data_point_ids, '{}'::uuid[])
  loop
    select * into approval_event
    from public.investment_data_point_classification_events event
    where event.data_point_id = data_point_id
    order by event.occurred_at desc, event.id desc
    limit 1;
    insert into public.investment_reporting_snapshot_data_points (
      snapshot_id, data_point_id, approval_event_id, frozen_data_point
    ) select created_snapshot.id, point.id, approval_event.id, to_jsonb(point)
      from public.investment_reportable_data_points point where point.id = data_point_id;
  end loop;

  insert into public.investment_reporting_snapshot_partner_performance (
    snapshot_id, partner_performance_run_id, frozen_performance
  ) select created_snapshot.id, run.id, to_jsonb(run)
    from public.investment_partner_performance_runs run
    where run.id = any(coalesce(p_partner_performance_run_ids, '{}'::uuid[]));

  insert into public.investment_reporting_snapshot_benchmarks (
    snapshot_id, benchmark_comparison_id, frozen_comparison
  ) select created_snapshot.id, comparison.id, to_jsonb(comparison)
    from public.investment_benchmark_comparisons comparison
    where comparison.id = any(coalesce(p_benchmark_comparison_ids, '{}'::uuid[]));

  return created_snapshot;
end;
$$;

create or replace function public.create_investment_report_draft(
  p_actor_user_id uuid,
  p_data_snapshot_id uuid,
  p_report_type text,
  p_calculation_version text,
  p_template_version text,
  p_report_series_id uuid default null
)
returns public.investment_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  snapshot_row public.investment_reporting_snapshots;
  series_value uuid;
  version_value integer;
  created_report public.investment_reports;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.generate') then
    raise exception 'Report generation permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Report generator must be an authenticated human user';
  end if;
  select * into snapshot_row from public.investment_reporting_snapshots where id = p_data_snapshot_id;
  if snapshot_row.id is null then raise exception 'Reporting snapshot not found'; end if;

  series_value := coalesce(p_report_series_id, gen_random_uuid());
  if p_report_series_id is not null and not exists (
    select 1 from public.investment_reports
    where report_series_id = p_report_series_id
      and pool_id = snapshot_row.pool_id
      and report_type = p_report_type
      and partner_id is not distinct from snapshot_row.partner_id
  ) then
    raise exception 'Report series does not match this report scope';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(series_value::text, 0));
  select coalesce(max(version), 0) + 1 into version_value
  from public.investment_reports where report_series_id = series_value;

  insert into public.investment_reports (
    report_series_id, pool_id, partner_id, report_type,
    reporting_period_start, reporting_period_end, version, data_snapshot_id,
    calculation_version, template_version, generated_by
  ) values (
    series_value, snapshot_row.pool_id, snapshot_row.partner_id, p_report_type,
    snapshot_row.reporting_period_start, snapshot_row.reporting_period_end,
    version_value, snapshot_row.id, p_calculation_version, p_template_version,
    p_actor_user_id
  ) returning * into created_report;

  insert into public.investment_report_status_events (
    report_id, previous_status, new_status, actor_user_id, reason, report_snapshot
  ) values (
    created_report.id, null, 'DRAFT', p_actor_user_id,
    'Report draft created.', to_jsonb(created_report)
  );
  return created_report;
end;
$$;

create or replace function public.add_investment_report_section(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_section_key text,
  p_section_order integer,
  p_title text,
  p_content jsonb,
  p_content_origin text,
  p_data_point_ids uuid[] default '{}'::uuid[],
  p_source_disclosures jsonb default '[]'::jsonb,
  p_ai_model text default null,
  p_ai_prompt_version text default null
)
returns public.investment_report_sections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report_row public.investment_reports;
  revision_value integer;
  created_section public.investment_report_sections;
  current_data_point_id uuid;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.generate') then
    raise exception 'Report generation permission required';
  end if;
  select * into report_row from public.investment_reports where id = p_report_id;
  if report_row.id is null or report_row.status <> 'DRAFT' then
    raise exception 'Report sections may be added only to a draft';
  end if;
  foreach current_data_point_id in array coalesce(p_data_point_ids, '{}'::uuid[])
  loop
    if not exists (
      select 1 from public.investment_reporting_snapshot_data_points
      where snapshot_id = report_row.data_snapshot_id
        and data_point_id = current_data_point_id
    ) then
      raise exception 'Section data point % is not in the frozen reporting snapshot', current_data_point_id;
    end if;
  end loop;

  select coalesce(max(revision), 0) + 1 into revision_value
  from public.investment_report_sections
  where report_id = p_report_id and section_key = p_section_key;

  insert into public.investment_report_sections (
    report_id, section_key, revision, section_order, title, content,
    content_origin, ai_model, ai_prompt_version, source_disclosures, created_by
  ) values (
    p_report_id, p_section_key, revision_value, p_section_order, btrim(p_title),
    p_content, p_content_origin, p_ai_model, p_ai_prompt_version,
    coalesce(p_source_disclosures, '[]'::jsonb), p_actor_user_id
  ) returning * into created_section;

  insert into public.investment_report_section_data_points (
    report_section_id, snapshot_id, data_point_id
  ) select created_section.id, report_row.data_snapshot_id, unnest(coalesce(p_data_point_ids, '{}'::uuid[]));
  return created_section;
end;
$$;

create or replace function public.review_investment_report_section(
  p_actor_user_id uuid,
  p_report_section_id uuid,
  p_decision text,
  p_notes text
)
returns public.investment_report_section_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_review public.investment_report_section_reviews;
  report_status text;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.review') then
    raise exception 'Report review permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Section reviewer must be an authenticated human user';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then raise exception 'Invalid section-review decision'; end if;
  select report.status into report_status
  from public.investment_report_sections section
  join public.investment_reports report on report.id = section.report_id
  where section.id = p_report_section_id;
  if report_status is null then
    raise exception 'Report section not found';
  end if;
  if report_status not in ('DRAFT', 'REVIEW') then
    raise exception 'Approved and issued report sections cannot receive new review decisions';
  end if;
  insert into public.investment_report_section_reviews (
    report_section_id, decision, reviewer_user_id, notes
  ) values (
    p_report_section_id, p_decision, p_actor_user_id, left(btrim(p_notes), 4000)
  ) returning * into created_review;
  return created_review;
end;
$$;

create or replace function public.validate_investment_report(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_validation_version text default 'report-validation-v1'
)
returns public.investment_report_validation_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report_row public.investment_reports;
  snapshot_row public.investment_reporting_snapshots;
  validation_id uuid := gen_random_uuid();
  critical_count integer := 0;
  warning_count integer := 0;
  created_validation public.investment_report_validation_runs;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'reports.review')
    and not public.investment_user_has_permission(p_actor_user_id, 'reports.approve') then
    raise exception 'Report review permission required';
  end if;
  select * into report_row from public.investment_reports where id = p_report_id;
  if report_row.id is null then raise exception 'Report not found'; end if;
  select * into snapshot_row from public.investment_reporting_snapshots where id = report_row.data_snapshot_id;

  create temporary table if not exists pg_temp.report_validation_issue_buffer (
    issue_code text, severity text, message text, details jsonb
  ) on commit drop;
  truncate table pg_temp.report_validation_issue_buffer;

  if snapshot_row.id is null
    or snapshot_row.reporting_period_start <> report_row.reporting_period_start
    or snapshot_row.reporting_period_end <> report_row.reporting_period_end then
    insert into pg_temp.report_validation_issue_buffer values
      ('SNAPSHOT_PERIOD_MISMATCH', 'CRITICAL', 'The frozen snapshot does not match the report period.', '{}'::jsonb);
  end if;
  if not exists (
    select 1 from public.investment_reconciliation_runs reconciliation
    where reconciliation.id = snapshot_row.reconciliation_run_id and reconciliation.status = 'PASSED'
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('RECONCILIATION_FAILED', 'CRITICAL', 'RECONCILIATION FAILED: partner capital does not reconcile to fund NAV.', '{}'::jsonb);
  end if;
  if coalesce((
    select review.decision
    from public.investment_performance_reviews review
    where review.portfolio_performance_run_id = snapshot_row.portfolio_performance_run_id
    order by review.reviewed_at desc, review.id desc
    limit 1
  ), '') <> 'APPROVED' then
    insert into pg_temp.report_validation_issue_buffer values
      ('PERFORMANCE_NOT_APPROVED', 'CRITICAL', 'The deterministic performance calculation is not currently approved.', '{}'::jsonb);
  end if;
  if report_row.partner_id is not null and not exists (
    select 1 from public.investment_reporting_snapshot_partner_performance
    where snapshot_id = snapshot_row.id
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('MISSING_PARTNER_PERFORMANCE', 'CRITICAL', 'Partner performance is missing from the frozen snapshot.', '{}'::jsonb);
  end if;
  if report_row.report_type in ('PERFORMANCE_REPORT', 'MONTHLY_REPORT', 'QUARTERLY_REPORT', 'ANNUAL_REPORT')
    and not exists (
      select 1 from public.investment_reporting_snapshot_benchmarks where snapshot_id = snapshot_row.id
    ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('MISSING_BENCHMARK', 'CRITICAL', 'Benchmark data is required for this report type.', '{}'::jsonb);
  end if;
  if not exists (select 1 from public.investment_report_sections where report_id = p_report_id) then
    insert into pg_temp.report_validation_issue_buffer values
      ('MISSING_REPORT_CONTENT', 'CRITICAL', 'The report has no sections.', '{}'::jsonb);
  end if;
  if exists (
    select 1
    from public.investment_report_sections section
    where section.report_id = p_report_id
      and section.revision = (
        select max(latest_section.revision)
        from public.investment_report_sections latest_section
        where latest_section.report_id = section.report_id
          and latest_section.section_key = section.section_key
      )
      and coalesce((
        select review.decision
        from public.investment_report_section_reviews review
        where review.report_section_id = section.id
        order by review.reviewed_at desc, review.id desc
        limit 1
      ), '') <> 'APPROVED'
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('MISSING_SECTION_APPROVAL', 'CRITICAL', 'Every report section requires a current human approval.', '{}'::jsonb);
  end if;
  if exists (
    select 1
    from public.investment_reporting_snapshot_data_points snapshot_point
    where snapshot_point.snapshot_id = snapshot_row.id
      and public.investment_data_point_current_classification(snapshot_point.data_point_id) <> 'APPROVED_FOR_REPORTING'
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('DATA_APPROVAL_REVOKED', 'CRITICAL', 'A frozen data point is no longer approved for reporting.', '{}'::jsonb);
  end if;
  if exists (
    select 1 from public.investment_report_sections section
    where section.report_id = p_report_id
      and section.revision = (
        select max(latest_section.revision)
        from public.investment_report_sections latest_section
        where latest_section.report_id = section.report_id
          and latest_section.section_key = section.section_key
      )
      and lower(section.content::text) ~
        '(raw ai reasoning|internal prompt|bull agent|bear agent|investment committee debate|internal watchlist|rejected investment idea|internal price target|unapproved valuation)'
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('INTERNAL_RESEARCH_LEAK', 'CRITICAL', 'Report content appears to contain prohibited internal research.', '{}'::jsonb);
  end if;
  if exists (
    select 1 from public.investment_report_sections section
    where section.report_id = p_report_id
      and section.revision = (
        select max(latest_section.revision)
        from public.investment_report_sections latest_section
        where latest_section.report_id = section.report_id
          and latest_section.section_key = section.section_key
      )
      and lower(section.content::text) ~
        '(guaranteed return|guaranteed annual return|guaranteed profit|risk-free equity return|ai-guaranteed|guaranteed distribution|retorno garantizado|ganancia garantizada)'
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('GUARANTEED_RETURN_LANGUAGE', 'CRITICAL', 'Prohibited guaranteed-return language was detected.', '{}'::jsonb);
  end if;
  if exists (
    select 1
    from public.investment_report_sections section
    join public.investment_report_section_data_points link on link.report_section_id = section.id
    left join public.investment_reporting_snapshot_data_points snapshot_point
      on snapshot_point.snapshot_id = report_row.data_snapshot_id
      and snapshot_point.data_point_id = link.data_point_id
    where section.report_id = p_report_id
      and section.revision = (
        select max(latest_section.revision)
        from public.investment_report_sections latest_section
        where latest_section.report_id = section.report_id
          and latest_section.section_key = section.section_key
      )
      and snapshot_point.data_point_id is null
  ) then
    insert into pg_temp.report_validation_issue_buffer values
      ('UNSNAPSHOTTED_DATA', 'CRITICAL', 'A report section references data outside the frozen snapshot.', '{}'::jsonb);
  end if;

  select count(*) filter (where severity = 'CRITICAL'), count(*) filter (where severity = 'WARNING')
  into critical_count, warning_count
  from pg_temp.report_validation_issue_buffer;

  insert into public.investment_report_validation_runs (
    id, report_id, status, validation_version, critical_issue_count,
    warning_count, validated_by
  ) values (
    validation_id, p_report_id, case when critical_count = 0 then 'PASSED' else 'FAILED' end,
    p_validation_version, critical_count, warning_count, p_actor_user_id
  ) returning * into created_validation;

  insert into public.investment_report_validation_issues (
    validation_run_id, issue_code, severity, message, details
  ) select validation_id, issue_code, severity, message, details
    from pg_temp.report_validation_issue_buffer;
  return created_validation;
end;
$$;

create or replace function public.transition_investment_report(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_new_status text,
  p_reason text
)
returns public.investment_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report_row public.investment_reports;
  validation_row public.investment_report_validation_runs;
  updated_report public.investment_reports;
begin
  select * into report_row from public.investment_reports where id = p_report_id for update;
  if report_row.id is null then raise exception 'Report not found'; end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Report workflow actor must be an authenticated human user';
  end if;
  if not (
    (report_row.status = 'DRAFT' and p_new_status = 'REVIEW')
    or (report_row.status = 'REVIEW' and p_new_status = 'DRAFT')
    or (report_row.status = 'REVIEW' and p_new_status = 'APPROVED')
    or (report_row.status = 'APPROVED' and p_new_status = 'ISSUED')
  ) then
    raise exception 'Invalid report transition from % to %', report_row.status, p_new_status;
  end if;

  if p_new_status in ('DRAFT', 'REVIEW') then
    if not public.investment_user_has_permission(p_actor_user_id, 'reports.review') then
      raise exception 'Report review permission required';
    end if;
    if not exists (select 1 from public.investment_report_sections where report_id = p_report_id) then
      raise exception 'A report requires content before review';
    end if;
  else
    if not public.investment_user_has_permission(p_actor_user_id, 'reports.approve') then
      raise exception 'Report approval permission required';
    end if;
  end if;

  if p_new_status = 'APPROVED' then
    select * into validation_row
    from public.investment_report_validation_runs
    where report_id = p_report_id
    order by validated_at desc, id desc
    limit 1;
    if validation_row.status is distinct from 'PASSED' then
      raise exception 'Run report validation and resolve every critical issue before approval';
    end if;
    if validation_row.validated_at < greatest(
      coalesce((select max(created_at) from public.investment_report_sections where report_id = p_report_id), '-infinity'::timestamptz),
      coalesce((
        select max(review.reviewed_at)
        from public.investment_report_section_reviews review
        join public.investment_report_sections section on section.id = review.report_section_id
        where section.report_id = p_report_id
      ), '-infinity'::timestamptz)
    ) then
      raise exception 'Report validation is stale; validate the reviewed content again';
    end if;
  end if;
  if p_new_status = 'ISSUED' then
    select * into validation_row
    from public.investment_report_validation_runs
    where report_id = p_report_id
    order by validated_at desc, id desc
    limit 1;
    if validation_row.status <> 'PASSED' then raise exception 'A passed validation is required before issuance'; end if;
    if not exists (select 1 from public.investment_report_artifacts where report_id = p_report_id) then
      raise exception 'An immutable exported artifact is required before issuance';
    end if;
  end if;

  perform set_config('app.investment_report_transition', 'on', true);
  update public.investment_reports
  set status = p_new_status,
      reviewed_by = case
        when p_new_status = 'DRAFT' then null
        when p_new_status = 'REVIEW' then p_actor_user_id
        else reviewed_by
      end,
      reviewed_at = case
        when p_new_status = 'DRAFT' then null
        when p_new_status = 'REVIEW' then now()
        else reviewed_at
      end,
      approved_by = case when p_new_status = 'APPROVED' then p_actor_user_id else approved_by end,
      approved_at = case when p_new_status = 'APPROVED' then now() else approved_at end,
      issued_by = case when p_new_status = 'ISSUED' then p_actor_user_id else issued_by end,
      issued_at = case when p_new_status = 'ISSUED' then now() else issued_at end
  where id = p_report_id
  returning * into updated_report;

  insert into public.investment_report_status_events (
    report_id, previous_status, new_status, actor_user_id, reason, report_snapshot
  ) values (
    p_report_id, report_row.status, p_new_status, p_actor_user_id,
    left(btrim(p_reason), 4000), to_jsonb(updated_report)
  );
  return updated_report;
end;
$$;

create or replace function public.record_investment_report_artifact(
  p_actor_user_id uuid,
  p_report_id uuid,
  p_artifact_format text,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_artifact_sha256 text,
  p_rendering_version text
)
returns public.investment_report_artifacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report_status text;
  created_artifact public.investment_report_artifacts;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'exports.create') then
    raise exception 'Export permission required';
  end if;
  select status into report_status from public.investment_reports where id = p_report_id;
  if report_status <> 'APPROVED' then
    raise exception 'Only an approved, not-yet-issued report may be exported as a final artifact';
  end if;
  insert into public.investment_report_artifacts (
    report_id, artifact_format, storage_bucket, storage_path, mime_type,
    byte_size, artifact_sha256, rendering_version, created_by
  ) values (
    p_report_id, p_artifact_format, p_storage_bucket, p_storage_path, p_mime_type,
    p_byte_size, p_artifact_sha256, p_rendering_version, p_actor_user_id
  ) returning * into created_artifact;
  return created_artifact;
end;
$$;

create or replace function public.guard_investment_report_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'ISSUED' then raise exception 'Issued reports are immutable'; end if;
  if coalesce(current_setting('app.investment_report_transition', true), '') <> 'on' then
    raise exception 'Report status may change only through the controlled workflow';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_investment_reporting_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Reporting history and frozen snapshots are immutable';
end;
$$;

drop trigger if exists investment_reports_guard_update on public.investment_reports;
create trigger investment_reports_guard_update
  before update or delete on public.investment_reports
  for each row execute function public.guard_investment_report_update();

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'investment_reporting_snapshots',
    'investment_reporting_snapshot_data_points',
    'investment_reporting_snapshot_partner_performance',
    'investment_reporting_snapshot_benchmarks',
    'investment_report_sections',
    'investment_report_section_data_points',
    'investment_report_section_reviews',
    'investment_report_validation_runs',
    'investment_report_validation_issues',
    'investment_report_status_events',
    'investment_report_artifacts'
  ]
  loop
    trigger_name := table_name || '_immutable';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.prevent_investment_reporting_history_mutation()',
      trigger_name, table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_reporting_snapshots',
    'investment_reporting_snapshot_data_points',
    'investment_reporting_snapshot_partner_performance',
    'investment_reporting_snapshot_benchmarks',
    'investment_reports',
    'investment_report_sections',
    'investment_report_section_data_points',
    'investment_report_section_reviews',
    'investment_report_validation_runs',
    'investment_report_validation_issues',
    'investment_report_status_events',
    'investment_report_artifacts'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.investment_current_user_has_permission(''reports.view''))',
      table_name || '_read_internal', table_name
    );
  end loop;
end;
$$;

revoke all on function public.freeze_investment_reporting_snapshot(uuid, uuid, uuid, date, date, uuid, uuid, uuid, uuid[], uuid[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.freeze_investment_reporting_snapshot(uuid, uuid, uuid, date, date, uuid, uuid, uuid, uuid[], uuid[], uuid[], text)
  to service_role;
revoke all on function public.create_investment_report_draft(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_investment_report_draft(uuid, uuid, text, text, text, uuid)
  to service_role;
revoke all on function public.add_investment_report_section(uuid, uuid, text, integer, text, jsonb, text, uuid[], jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.add_investment_report_section(uuid, uuid, text, integer, text, jsonb, text, uuid[], jsonb, text, text)
  to service_role;
revoke all on function public.review_investment_report_section(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_investment_report_section(uuid, uuid, text, text)
  to service_role;
revoke all on function public.validate_investment_report(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.validate_investment_report(uuid, uuid, text)
  to service_role;
revoke all on function public.transition_investment_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_investment_report(uuid, uuid, text, text)
  to service_role;
revoke all on function public.record_investment_report_artifact(uuid, uuid, text, text, text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.record_investment_report_artifact(uuid, uuid, text, text, text, text, bigint, text, text)
  to service_role;

notify pgrst, 'reload schema';
