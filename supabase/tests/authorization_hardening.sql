begin;

select plan(22);

select ok(
  to_regprocedure('public.protect_profile_server_columns()') is not null,
  'profiles have a server-owned column guard'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'profiles_protect_server_columns' and not tgisinternal
  ),
  'profile server-column trigger is installed'
);

select ok(
  to_regclass('public.user_entitlements') is not null,
  'entitlements are the paid-access authority'
);

select ok(
  to_regclass('public.forum_threads') is null and to_regclass('public.forum_posts') is null,
  'retired forum data tables are absent'
);

select ok(
  has_table_privilege('authenticated', 'public.user_entitlements', 'SELECT')
    and not has_table_privilege('authenticated', 'public.user_entitlements', 'INSERT')
    and not has_table_privilege('authenticated', 'public.user_entitlements', 'UPDATE'),
  'authenticated users cannot mint or modify entitlements'
);

select ok(
  to_regclass('public.neuro_analysis_original_theses') is not null
    and to_regclass('public.neuro_analysis_thesis_reviews') is not null,
  'permanent original theses and append-only reviews exist'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'neuro_original_theses_prevent_update' and not tgisinternal
  )
    and exists (
      select 1 from pg_trigger
      where tgname = 'neuro_thesis_reviews_prevent_update' and not tgisinternal
    ),
  'original theses and thesis reviews reject updates'
);

select ok(
  has_table_privilege('authenticated', 'public.neuro_analysis_original_theses', 'SELECT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_original_theses', 'INSERT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_original_theses', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_original_theses', 'DELETE')
    and has_table_privilege('authenticated', 'public.neuro_analysis_thesis_reviews', 'SELECT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_thesis_reviews', 'INSERT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_thesis_reviews', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_thesis_reviews', 'DELETE'),
  'authenticated clients can read but cannot mutate permanent thesis records'
);

select ok(
  to_regclass('public.neuro_analysis_position_exit_reviews') is not null,
  'append-only position exit reviews exist'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'neuro_position_exit_reviews_prevent_update' and not tgisinternal
  ),
  'position exit reviews reject updates'
);

select ok(
  has_table_privilege('authenticated', 'public.neuro_analysis_position_exit_reviews', 'SELECT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_position_exit_reviews', 'INSERT')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_position_exit_reviews', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.neuro_analysis_position_exit_reviews', 'DELETE'),
  'authenticated clients can read but cannot mutate position exit reviews'
);

select ok(
  to_regclass('public.neuro_capital_pools') is not null
    and to_regclass('public.neuro_capital_accounts') is not null
    and to_regclass('public.neuro_capital_account_events') is not null
    and to_regclass('public.neuro_capital_nav_history') is not null,
  'individual capital-account ledger tables exist'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'neuro_capital_events_prevent_mutation' and not tgisinternal
  )
    and exists (
      select 1 from pg_trigger
      where tgname = 'neuro_capital_nav_prevent_mutation' and not tgisinternal
    ),
  'capital events and NAV history reject mutation'
);

select ok(
  has_table_privilege('authenticated', 'public.neuro_capital_account_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.neuro_capital_account_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.neuro_capital_account_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.neuro_capital_account_events', 'DELETE')
    and has_table_privilege('authenticated', 'public.neuro_capital_nav_history', 'SELECT')
    and not has_table_privilege('authenticated', 'public.neuro_capital_nav_history', 'INSERT')
    and not has_table_privilege('authenticated', 'public.neuro_capital_nav_history', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.neuro_capital_nav_history', 'DELETE'),
  'authenticated clients can read but cannot forge capital-account calculations'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_neuro_capital_account(uuid, uuid, text, text, date, numeric, numeric, text, text)',
    'EXECUTE'
  ),
  'capital-account creation RPC is restricted to the server service role'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.erase_neuro_capital_data(uuid)',
    'EXECUTE'
  ),
  'capital-account erasure RPC is restricted to the server service role'
);

select ok(
  to_regclass('public.investment_companies') is not null
    and to_regclass('public.investment_sec_raw_facts') is not null
    and to_regclass('public.investment_normalized_facts') is not null
    and to_regclass('public.investment_financial_metrics') is not null,
  'institutional investment data layers exist'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'investment_sec_raw_facts_prevent_mutation' and not tgisinternal
  )
    and exists (
      select 1 from pg_trigger
      where tgname = 'investment_normalized_facts_prevent_mutation' and not tgisinternal
    )
    and exists (
      select 1 from pg_trigger
      where tgname = 'investment_audit_events_prevent_mutation' and not tgisinternal
    ),
  'raw facts, normalized facts, and audit events reject mutation'
);

select ok(
  has_table_privilege('authenticated', 'public.investment_sec_raw_facts', 'SELECT')
    and not has_table_privilege('authenticated', 'public.investment_sec_raw_facts', 'INSERT')
    and not has_table_privilege('authenticated', 'public.investment_sec_raw_facts', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.investment_sec_raw_facts', 'DELETE')
    and has_table_privilege('authenticated', 'public.investment_financial_metrics', 'SELECT')
    and not has_table_privilege('authenticated', 'public.investment_financial_metrics', 'INSERT'),
  'authenticated clients can inspect but cannot forge institutional financial data'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.append_investment_audit_event(uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text)',
    'EXECUTE'
  ),
  'tamper-evident investment audit appends are restricted to the service role'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.investment_facts_as_of(uuid, timestamptz)',
    'EXECUTE'
  )
    and not has_table_privilege('authenticated', 'public.investment_screen_runs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.investment_watchlist_entries', 'UPDATE'),
  'point-in-time reads are available while screen and watchlist writes stay server-authorized'
);

select ok(
  to_regclass('public.investment_ingestion_leases') is not null
    and not has_table_privilege('authenticated', 'public.investment_ingestion_leases', 'SELECT')
    and not has_function_privilege(
      'authenticated',
      'public.claim_investment_ingestion_lease(text, text, uuid, integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.release_investment_ingestion_lease(text, text, uuid)',
      'EXECUTE'
    ),
  'distributed ingestion leases are private to the service role'
);

select * from finish();
rollback;
