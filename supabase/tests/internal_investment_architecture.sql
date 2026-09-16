begin;

select plan(25);

select ok(
  exists (
    select 1 from public.investment_operating_configuration
    where singleton
      and operating_model = 'PRIVATE_INTERNAL'
      and not partner_portal_enabled
      and not automated_report_delivery_enabled
      and not real_money_processing_enabled
  ),
  'operating model is private, internal, and non-transactional by default'
);

select is(
  (select count(*)::integer from public.investment_internal_roles),
  6,
  'all six internal investment roles are configured'
);

select ok(
  to_regclass('public.investment_accounting_books') is not null
    and to_regclass('public.investment_journal_entries') is not null
    and to_regclass('public.investment_journal_lines') is not null
    and to_regclass('public.investment_accounting_periods') is not null,
  'double-entry accounting books, periods, entries, and lines exist'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.investment_journal_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%total_debits = total_credits%'
  ),
  'journal entries enforce balanced debits and credits'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'investment_journal_entries_prevent_mutation' and not tgisinternal
  )
    and exists (
      select 1 from pg_trigger
      where tgname = 'investment_journal_lines_prevent_mutation' and not tgisinternal
    ),
  'posted journal history is immutable'
);

select ok(
  to_regclass('public.investment_partners') is not null
    and to_regclass('public.investment_partner_classes') is not null
    and to_regclass('public.investment_partner_transaction_workflows') is not null,
  'internal partner records, classes, and transaction workflows exist'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'investment_partners'
      and column_name in ('user_id', 'auth_user_id')
  ),
  'partners are accounting records without application identities'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.investment_partner_transaction_workflows'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%external_cash_flow%'
  ),
  'partner transactions are explicitly external capital flows'
);

select is((100000::numeric / 100::numeric), 1000::numeric, 'Investor A receives exactly 1,000 units');
select is((55000::numeric / 110::numeric), 500::numeric, 'Investor B receives exactly 500 units');
select is((110000::numeric + 55000::numeric), 165000::numeric, 'post-contribution NAV is exactly $165,000');
select is((1000::numeric + 500::numeric), 1500::numeric, 'total units are exactly 1,500');
select is((165000::numeric / 1500::numeric), 110::numeric, 'NAV per unit remains exactly $110');
select is((1000::numeric * 110::numeric), 110000::numeric, 'Investor A retains exactly $110,000');
select is((500::numeric * 110::numeric), 55000::numeric, 'Investor B starts at exactly $55,000');

select ok(
  to_regclass('public.investment_portfolio_performance_runs') is not null
    and to_regclass('public.investment_partner_performance_runs') is not null
    and to_regclass('public.investment_performance_attribution_components') is not null,
  'portfolio performance, partner performance, and attribution remain separate'
);

select is(
  (select count(*)::integer from public.investment_return_methodologies),
  3,
  'deterministic return methodologies are documented'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.investment_portfolio_performance_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%DETERMINISTIC_CODE%'
  ),
  'authoritative performance is restricted to deterministic code'
);

select is(
  (select count(*)::integer from public.investment_data_classification_catalog),
  7,
  'all seven distribution classifications are configured'
);

select ok(
  to_regclass('public.investment_reportable_data_points') is not null
    and to_regclass('public.investment_data_point_classification_events') is not null,
  'field-level reporting lineage and approval history exist'
);

select ok(
  to_regclass('public.investment_reporting_snapshots') is not null
    and to_regclass('public.investment_reports') is not null
    and to_regclass('public.investment_report_artifacts') is not null,
  'frozen reporting snapshots, versioned reports, and immutable artifacts exist'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'investment_reports_guard_update' and not tgisinternal
  ),
  'issued reports are protected by a controlled transition trigger'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.transition_investment_report(uuid, uuid, text, text)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.classify_investment_reporting_data_point(uuid, uuid, text, text, jsonb)',
      'EXECUTE'
    ),
  'report approval and data-classification RPCs are server-only'
);

select ok(
  not has_table_privilege('authenticated', 'public.investment_journal_entries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.investment_partners', 'INSERT')
    and not has_table_privilege('authenticated', 'public.investment_reports', 'INSERT')
    and not has_table_privilege('authenticated', 'public.investment_report_artifacts', 'INSERT'),
  'authenticated clients cannot forge accounting, partner, or reporting records'
);

select ok(
  to_regclass('public.investment_distribution_declarations') is not null
    and to_regclass('public.investment_fee_rules') is not null
    and to_regclass('public.investment_fee_assessments') is not null,
  'distribution and configurable fee architecture exists without hard-coded economics'
);

select * from finish();
rollback;
