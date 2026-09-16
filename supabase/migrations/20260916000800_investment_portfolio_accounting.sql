-- Authoritative deterministic portfolio accounting.
-- Monetary values use numeric decimal arithmetic; posted history is append-only.

create extension if not exists pgcrypto;

create table if not exists public.investment_accounting_books (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null unique references public.neuro_capital_pools(id) on delete restrict,
  book_name text not null check (char_length(btrim(book_name)) between 1 and 160),
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  currency_precision smallint not null default 2 check (currency_precision between 0 and 8),
  rounding_method text not null default 'HALF_UP' check (rounding_method in ('HALF_UP', 'HALF_EVEN')),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
  closed_through_date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, pool_id)
);

create table if not exists public.investment_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  period_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED')),
  closed_by uuid references auth.users(id) on delete restrict,
  closed_at timestamptz,
  locked_by uuid references auth.users(id) on delete restrict,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, period_start, period_end),
  check (period_end >= period_start),
  check (
    (status = 'OPEN' and closed_at is null and locked_at is null)
    or (status = 'SOFT_CLOSED' and locked_at is null)
    or (status = 'CLOSED' and closed_at is not null and locked_at is null)
    or (status = 'LOCKED' and closed_at is not null and locked_at is not null)
  )
);

create table if not exists public.investment_accounting_period_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.investment_accounting_periods(id) on delete restrict,
  previous_status text,
  new_status text not null check (new_status in ('OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null default '',
  occurred_at timestamptz not null default now()
);

create table if not exists public.investment_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  account_code text not null check (char_length(btrim(account_code)) between 1 and 30),
  account_name text not null check (char_length(btrim(account_name)) between 1 and 160),
  account_type text not null check (account_type in ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  account_subtype text not null,
  normal_balance text not null check (normal_balance in ('DEBIT', 'CREDIT')),
  report_classification text not null,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (book_id, account_code)
);

create table if not exists public.investment_journal_entries (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  period_id uuid not null references public.investment_accounting_periods(id) on delete restrict,
  effective_date date not null,
  entry_type text not null check (
    entry_type in (
      'OPENING', 'TRADE', 'SETTLEMENT', 'DIVIDEND', 'INTEREST', 'FEE', 'EXPENSE',
      'CONTRIBUTION', 'WITHDRAWAL', 'DISTRIBUTION', 'VALUATION',
      'CORPORATE_ACTION', 'ACCRUAL', 'CORRECTION', 'REVERSAL', 'OTHER'
    )
  ),
  description text not null check (char_length(btrim(description)) between 1 and 1000),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  total_debits numeric(30, 8) not null check (total_debits > 0),
  total_credits numeric(30, 8) not null check (total_credits > 0),
  source_type text not null check (source_type in ('MANUAL', 'BROKER_IMPORT', 'CUSTODIAN_IMPORT', 'SYSTEM', 'CORRECTION')),
  source_reference text,
  source_payload_hash text,
  idempotency_key text not null,
  reversal_of_entry_id uuid unique references public.investment_journal_entries(id) on delete restrict,
  calculation_version text not null default 'portfolio-ledger-v1',
  posted_by uuid not null references auth.users(id) on delete restrict,
  posted_at timestamptz not null default now(),
  unique (book_id, idempotency_key),
  check (total_debits = total_credits),
  check (reversal_of_entry_id is null or entry_type = 'REVERSAL')
);

create table if not exists public.investment_journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.investment_journal_entries(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.investment_chart_of_accounts(id) on delete restrict,
  debit_amount numeric(30, 8) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(30, 8) not null default 0 check (credit_amount >= 0),
  transaction_currency text check (transaction_currency is null or transaction_currency ~ '^[A-Z]{3}$'),
  transaction_amount numeric(30, 8),
  exchange_rate numeric(30, 12) check (exchange_rate is null or exchange_rate > 0),
  capital_account_id uuid references public.neuro_capital_accounts(id) on delete restrict,
  security_id uuid references public.investment_securities(id) on delete restrict,
  lot_reference text,
  memo text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (entry_id, line_number),
  check (
    (debit_amount > 0 and credit_amount = 0)
    or (credit_amount > 0 and debit_amount = 0)
  ),
  check (
    (transaction_currency is null and transaction_amount is null and exchange_rate is null)
    or (transaction_currency is not null and transaction_amount is not null and exchange_rate is not null)
  )
);

create index if not exists investment_journal_entries_book_date_idx
  on public.investment_journal_entries(book_id, effective_date, sequence_no);
create index if not exists investment_journal_lines_entry_idx
  on public.investment_journal_lines(entry_id, line_number);
create index if not exists investment_journal_lines_account_idx
  on public.investment_journal_lines(account_id, entry_id);

create table if not exists public.investment_portfolio_snapshot_runs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  as_of_timestamp timestamptz not null,
  source_type text not null check (source_type in ('INTERNAL_LEDGER', 'BROKER', 'CUSTODIAN', 'MANUAL_RECONCILIATION')),
  source_reference text not null,
  source_version text,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  total_cash numeric(30, 8),
  total_investments numeric(30, 8),
  total_value numeric(30, 8),
  distribution_classification text not null default 'INTERNAL_ONLY' check (
    distribution_classification in (
      'INTERNAL_ONLY', 'DERIVED_DISTRIBUTABLE', 'PUBLIC_SOURCE',
      'FUND_ACCOUNTING', 'APPROVED_FOR_REPORTING', 'RESTRICTED', 'UNKNOWN_LICENSE'
    )
  ),
  snapshot_sha256 text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_portfolio_position_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_run_id uuid not null references public.investment_portfolio_snapshot_runs(id) on delete restrict,
  security_id uuid not null references public.investment_securities(id) on delete restrict,
  quantity numeric(38, 12) not null,
  price numeric(30, 12),
  market_value numeric(30, 8),
  cost_basis numeric(30, 8),
  unrealized_gain_loss numeric(30, 8),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_source_id text references public.investment_data_sources(source_id) on delete restrict,
  price_source_reference text,
  price_available_at timestamptz,
  created_at timestamptz not null default now(),
  unique (snapshot_run_id, security_id),
  check ((price is null and market_value is null) or (price is not null and market_value is not null))
);

create table if not exists public.investment_portfolio_cash_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_run_id uuid not null references public.investment_portfolio_snapshot_runs(id) on delete restrict,
  account_reference text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  native_balance numeric(30, 8) not null,
  base_exchange_rate numeric(30, 12) not null check (base_exchange_rate > 0),
  base_balance numeric(30, 8) not null,
  created_at timestamptz not null default now(),
  unique (snapshot_run_id, account_reference, currency)
);

create table if not exists public.investment_fund_nav_snapshots (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  nav_date date not null,
  total_assets numeric(30, 8) not null,
  total_liabilities numeric(30, 8) not null,
  net_asset_value numeric(30, 8) not null,
  total_units numeric(38, 12) not null,
  nav_per_unit numeric(30, 12),
  journal_sequence_cutoff bigint not null check (journal_sequence_cutoff >= 0),
  capital_event_sequence_cutoff bigint not null check (capital_event_sequence_cutoff >= 0),
  portfolio_snapshot_run_id uuid references public.investment_portfolio_snapshot_runs(id) on delete restrict,
  calculation_version text not null default 'fund-nav-v1',
  input_manifest jsonb not null,
  snapshot_sha256 text not null unique,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (book_id, nav_date),
  unique (id, pool_id),
  constraint investment_fund_nav_book_pool_fk
    foreign key (book_id, pool_id)
    references public.investment_accounting_books(id, pool_id)
    on delete restrict,
  check (total_assets >= 0),
  check (total_liabilities >= 0),
  check (net_asset_value >= 0),
  check (net_asset_value = total_assets - total_liabilities),
  check (
    (total_units = 0 and net_asset_value = 0 and nav_per_unit is null)
    or (
      total_units > 0
      and nav_per_unit >= 0
      and abs(nav_per_unit - (net_asset_value / total_units)) <= 0.000000000001
    )
  )
);

alter table public.neuro_capital_nav_history
  add column if not exists fund_nav_snapshot_id uuid unique
    references public.investment_fund_nav_snapshots(id) on delete restrict,
  add column if not exists total_assets numeric(30, 8),
  add column if not exists total_liabilities numeric(30, 8),
  add column if not exists reconciliation_status text not null default 'UNVERIFIED'
    check (reconciliation_status in ('UNVERIFIED', 'RECONCILED', 'FAILED'));

create table if not exists public.investment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  reconciliation_type text not null check (
    reconciliation_type in ('PARTNER_CAPITAL_TO_NAV', 'BROKER_TO_LEDGER', 'CUSTODIAN_TO_LEDGER')
  ),
  as_of_date date not null,
  tolerance numeric(30, 8) not null default 0.01 check (tolerance >= 0),
  internal_total numeric(30, 8),
  external_total numeric(30, 8),
  difference numeric(30, 8),
  status text not null check (status in ('PASSED', 'FAILED', 'REQUIRES_INVESTIGATION')),
  internal_snapshot jsonb not null,
  external_snapshot jsonb,
  source_references jsonb not null default '[]'::jsonb,
  run_sha256 text not null unique,
  performed_by uuid not null references auth.users(id) on delete restrict,
  performed_at timestamptz not null default now(),
  unique (id, pool_id),
  constraint investment_reconciliation_book_pool_fk
    foreign key (book_id, pool_id)
    references public.investment_accounting_books(id, pool_id)
    on delete restrict
);

create table if not exists public.investment_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_run_id uuid not null references public.investment_reconciliation_runs(id) on delete restrict,
  item_type text not null check (
    item_type in ('CASH', 'POSITION', 'QUANTITY', 'TRANSACTION', 'DIVIDEND', 'INTEREST', 'FEE', 'CORPORATE_ACTION', 'PARTNER_CAPITAL', 'OTHER')
  ),
  item_reference text not null,
  internal_value numeric(30, 8),
  external_value numeric(30, 8),
  difference numeric(30, 8),
  status text not null check (status in ('MATCHED', 'DIFFERENCE', 'MISSING_INTERNAL', 'MISSING_EXTERNAL', 'NOT_COMPARABLE')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_reconciliation_reviews (
  id uuid primary key default gen_random_uuid(),
  reconciliation_run_id uuid not null references public.investment_reconciliation_runs(id) on delete restrict,
  review_state text not null check (review_state in ('INVESTIGATING', 'RESOLVED', 'ACCEPTED_EXCEPTION')),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  resolution text not null check (char_length(btrim(resolution)) between 1 and 4000),
  evidence jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz not null default now()
);

create or replace function public.create_investment_accounting_book(
  p_actor_user_id uuid,
  p_pool_id uuid,
  p_book_name text,
  p_base_currency text default 'USD',
  p_currency_precision integer default 2,
  p_rounding_method text default 'HALF_UP'
)
returns public.investment_accounting_books
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_book public.investment_accounting_books;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Accounting actor must be an authenticated human user';
  end if;
  if not exists (select 1 from public.neuro_capital_pools where id = p_pool_id) then
    raise exception 'Capital pool not found';
  end if;

  insert into public.investment_accounting_books (
    pool_id, book_name, base_currency, currency_precision, rounding_method, created_by
  ) values (
    p_pool_id,
    btrim(p_book_name),
    upper(p_base_currency),
    p_currency_precision,
    p_rounding_method,
    p_actor_user_id
  ) returning * into created_book;

  insert into public.investment_chart_of_accounts (
    book_id, account_code, account_name, account_type, account_subtype,
    normal_balance, report_classification, currency
  ) values
    (created_book.id, '1000', 'Cash', 'ASSET', 'CASH', 'DEBIT', 'CASH', created_book.base_currency),
    (created_book.id, '1100', 'Investments', 'ASSET', 'INVESTMENTS', 'DEBIT', 'INVESTMENTS', created_book.base_currency),
    (created_book.id, '1200', 'Receivables', 'ASSET', 'RECEIVABLES', 'DEBIT', 'RECEIVABLES', created_book.base_currency),
    (created_book.id, '1300', 'Dividends Receivable', 'ASSET', 'DIVIDENDS_RECEIVABLE', 'DEBIT', 'RECEIVABLES', created_book.base_currency),
    (created_book.id, '1400', 'Other Assets', 'ASSET', 'OTHER_ASSETS', 'DEBIT', 'OTHER_ASSETS', created_book.base_currency),
    (created_book.id, '2000', 'Payables', 'LIABILITY', 'PAYABLES', 'CREDIT', 'PAYABLES', created_book.base_currency),
    (created_book.id, '2100', 'Accrued Fees', 'LIABILITY', 'ACCRUED_FEES', 'CREDIT', 'FEES', created_book.base_currency),
    (created_book.id, '2200', 'Other Liabilities', 'LIABILITY', 'OTHER_LIABILITIES', 'CREDIT', 'OTHER_LIABILITIES', created_book.base_currency),
    (created_book.id, '3000', 'Partner Capital', 'EQUITY', 'PARTNER_CAPITAL', 'CREDIT', 'PARTNER_CAPITAL', created_book.base_currency),
    (created_book.id, '3100', 'Accumulated Investment Result', 'EQUITY', 'ACCUMULATED_RESULT', 'CREDIT', 'INVESTMENT_RESULT', created_book.base_currency),
    (created_book.id, '4000', 'Realized Gains and Losses', 'INCOME', 'REALIZED_GAIN_LOSS', 'CREDIT', 'REALIZED_GAIN_LOSS', created_book.base_currency),
    (created_book.id, '4100', 'Unrealized Gains and Losses', 'INCOME', 'UNREALIZED_GAIN_LOSS', 'CREDIT', 'UNREALIZED_GAIN_LOSS', created_book.base_currency),
    (created_book.id, '4200', 'Dividend Income', 'INCOME', 'DIVIDEND_INCOME', 'CREDIT', 'DIVIDENDS', created_book.base_currency),
    (created_book.id, '4300', 'Interest Income', 'INCOME', 'INTEREST_INCOME', 'CREDIT', 'INTEREST', created_book.base_currency),
    (created_book.id, '5000', 'Management and Other Fees', 'EXPENSE', 'FEES', 'DEBIT', 'FEES', created_book.base_currency),
    (created_book.id, '5100', 'Administrative Expenses', 'EXPENSE', 'ADMINISTRATIVE_EXPENSE', 'DEBIT', 'EXPENSES', created_book.base_currency);

  return created_book;
end;
$$;

create or replace function public.create_investment_accounting_period(
  p_actor_user_id uuid,
  p_book_id uuid,
  p_period_name text,
  p_period_start date,
  p_period_end date
)
returns public.investment_accounting_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_period public.investment_accounting_periods;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Accounting actor must be an authenticated human user';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Accounting-period end date cannot precede its start date';
  end if;
  if not exists (
    select 1 from public.investment_accounting_books
    where id = p_book_id and status = 'ACTIVE'
  ) then
    raise exception 'Active accounting book not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_book_id::text, 0));
  if exists (
    select 1
    from public.investment_accounting_periods period
    where period.book_id = p_book_id
      and daterange(period.period_start, period.period_end, '[]')
        && daterange(p_period_start, p_period_end, '[]')
  ) then
    raise exception 'Accounting periods cannot overlap';
  end if;

  insert into public.investment_accounting_periods (
    book_id, period_name, period_start, period_end
  ) values (
    p_book_id, btrim(p_period_name), p_period_start, p_period_end
  ) returning * into created_period;

  return created_period;
end;
$$;

create or replace function public.post_investment_journal_entry(
  p_actor_user_id uuid,
  p_book_id uuid,
  p_period_id uuid,
  p_effective_date date,
  p_entry_type text,
  p_description text,
  p_source_type text,
  p_source_reference text,
  p_source_payload_hash text,
  p_idempotency_key text,
  p_lines jsonb,
  p_reversal_of_entry_id uuid default null
)
returns public.investment_journal_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  book_row public.investment_accounting_books;
  period_row public.investment_accounting_periods;
  created_entry public.investment_journal_entries;
  existing_entry public.investment_journal_entries;
  line jsonb;
  account_uuid uuid;
  debit_value numeric;
  credit_value numeric;
  debit_total numeric := 0;
  credit_total numeric := 0;
  line_count integer := 0;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Posting actor must be an authenticated human user';
  end if;
  if p_effective_date > current_date then
    raise exception 'Journal entries cannot be future dated';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A balanced journal entry requires at least two lines';
  end if;

  select * into existing_entry
  from public.investment_journal_entries
  where book_id = p_book_id and idempotency_key = p_idempotency_key;
  if existing_entry.id is not null then
    return existing_entry;
  end if;

  select * into book_row
  from public.investment_accounting_books
  where id = p_book_id and status = 'ACTIVE';
  if book_row.id is null then
    raise exception 'Active accounting book not found';
  end if;

  select * into period_row
  from public.investment_accounting_periods
  where id = p_period_id and book_id = p_book_id;
  if period_row.id is null or p_effective_date not between period_row.period_start and period_row.period_end then
    raise exception 'Effective date does not belong to the selected accounting period';
  end if;
  if period_row.status <> 'OPEN' then
    raise exception 'Accounting period is not open';
  end if;

  for line in select value from jsonb_array_elements(p_lines)
  loop
    line_count := line_count + 1;
    account_uuid := nullif(line->>'accountId', '')::uuid;
    debit_value := round(coalesce(nullif(line->>'debit', '')::numeric, 0), book_row.currency_precision);
    credit_value := round(coalesce(nullif(line->>'credit', '')::numeric, 0), book_row.currency_precision);
    if not exists (
      select 1 from public.investment_chart_of_accounts
      where id = account_uuid and book_id = p_book_id and active
    ) then
      raise exception 'Journal line % references an invalid account', line_count;
    end if;
    if not ((debit_value > 0 and credit_value = 0) or (credit_value > 0 and debit_value = 0)) then
      raise exception 'Journal line % must contain exactly one positive debit or credit', line_count;
    end if;
    debit_total := debit_total + debit_value;
    credit_total := credit_total + credit_value;
  end loop;

  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Journal entry is not balanced: debits %, credits %', debit_total, credit_total;
  end if;
  if p_reversal_of_entry_id is not null then
    if p_entry_type <> 'REVERSAL' then
      raise exception 'A reversal reference requires REVERSAL entry type';
    end if;
    if not exists (
      select 1 from public.investment_journal_entries
      where id = p_reversal_of_entry_id and book_id = p_book_id
    ) then
      raise exception 'Original journal entry not found in this book';
    end if;
    if exists (
      select 1 from public.investment_journal_entries
      where reversal_of_entry_id = p_reversal_of_entry_id
    ) then
      raise exception 'Original journal entry has already been reversed';
    end if;
  end if;

  perform set_config('app.investment_ledger_posting', 'on', true);
  insert into public.investment_journal_entries (
    book_id, period_id, effective_date, entry_type, description, base_currency,
    total_debits, total_credits, source_type, source_reference,
    source_payload_hash, idempotency_key, reversal_of_entry_id, posted_by
  ) values (
    p_book_id, p_period_id, p_effective_date, p_entry_type, btrim(p_description),
    book_row.base_currency, debit_total, credit_total, p_source_type,
    nullif(btrim(coalesce(p_source_reference, '')), ''), p_source_payload_hash,
    p_idempotency_key, p_reversal_of_entry_id, p_actor_user_id
  ) returning * into created_entry;

  line_count := 0;
  for line in select value from jsonb_array_elements(p_lines)
  loop
    line_count := line_count + 1;
    insert into public.investment_journal_lines (
      entry_id, line_number, account_id, debit_amount, credit_amount,
      transaction_currency, transaction_amount, exchange_rate,
      capital_account_id, security_id, lot_reference, memo, metadata
    ) values (
      created_entry.id,
      line_count,
      (line->>'accountId')::uuid,
      round(coalesce(nullif(line->>'debit', '')::numeric, 0), book_row.currency_precision),
      round(coalesce(nullif(line->>'credit', '')::numeric, 0), book_row.currency_precision),
      nullif(upper(line->>'transactionCurrency'), ''),
      nullif(line->>'transactionAmount', '')::numeric,
      nullif(line->>'exchangeRate', '')::numeric,
      nullif(line->>'capitalAccountId', '')::uuid,
      nullif(line->>'securityId', '')::uuid,
      nullif(left(coalesce(line->>'lotReference', ''), 200), ''),
      left(coalesce(line->>'memo', ''), 1000),
      coalesce(line->'metadata', '{}'::jsonb)
    );
  end loop;

  return created_entry;
end;
$$;

create or replace function public.reverse_investment_journal_entry(
  p_actor_user_id uuid,
  p_original_entry_id uuid,
  p_period_id uuid,
  p_effective_date date,
  p_reason text,
  p_idempotency_key text
)
returns public.investment_journal_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original_entry public.investment_journal_entries;
  reversed_lines jsonb;
begin
  select * into original_entry
  from public.investment_journal_entries
  where id = p_original_entry_id;
  if original_entry.id is null then
    raise exception 'Original journal entry not found';
  end if;

  select jsonb_agg(jsonb_build_object(
    'accountId', line.account_id,
    'debit', line.credit_amount,
    'credit', line.debit_amount,
    'transactionCurrency', line.transaction_currency,
    'transactionAmount', case when line.transaction_amount is null then null else -line.transaction_amount end,
    'exchangeRate', line.exchange_rate,
    'capitalAccountId', line.capital_account_id,
    'securityId', line.security_id,
    'lotReference', line.lot_reference,
    'memo', concat('Reversal: ', line.memo),
    'metadata', line.metadata || jsonb_build_object('reversalOfLineId', line.id)
  ) order by line.line_number)
  into reversed_lines
  from public.investment_journal_lines line
  where line.entry_id = p_original_entry_id;

  return public.post_investment_journal_entry(
    p_actor_user_id,
    original_entry.book_id,
    p_period_id,
    p_effective_date,
    'REVERSAL',
    concat('Reversal of ', original_entry.id, ': ', btrim(p_reason)),
    'CORRECTION',
    original_entry.id::text,
    null,
    p_idempotency_key,
    reversed_lines,
    original_entry.id
  );
end;
$$;

create or replace function public.transition_investment_accounting_period(
  p_actor_user_id uuid,
  p_period_id uuid,
  p_new_status text,
  p_reason text
)
returns public.investment_accounting_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  period_row public.investment_accounting_periods;
  updated_row public.investment_accounting_periods;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  select * into period_row
  from public.investment_accounting_periods
  where id = p_period_id
  for update;
  if period_row.id is null then raise exception 'Accounting period not found'; end if;
  if p_new_status not in ('OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED') then
    raise exception 'Invalid accounting-period status';
  end if;
  if not (
    (period_row.status = 'OPEN' and p_new_status in ('SOFT_CLOSED', 'CLOSED'))
    or (period_row.status = 'SOFT_CLOSED' and p_new_status in ('OPEN', 'CLOSED'))
    or (period_row.status = 'CLOSED' and p_new_status in ('OPEN', 'LOCKED'))
  ) then
    raise exception 'Invalid accounting-period transition from % to %', period_row.status, p_new_status;
  end if;
  if p_new_status in ('CLOSED', 'LOCKED') and exists (
    select 1
    from public.investment_journal_entries entry
    where entry.book_id = period_row.book_id
      and entry.period_id <> period_row.id
      and entry.effective_date between period_row.period_start and period_row.period_end
  ) then
    raise exception 'Journal entries are assigned to an inconsistent accounting period';
  end if;

  perform set_config('app.investment_period_transition', 'on', true);
  update public.investment_accounting_periods
  set status = p_new_status,
      closed_by = case when p_new_status in ('CLOSED', 'LOCKED') then p_actor_user_id else null end,
      closed_at = case when p_new_status in ('CLOSED', 'LOCKED') then coalesce(closed_at, now()) else null end,
      locked_by = case when p_new_status = 'LOCKED' then p_actor_user_id else null end,
      locked_at = case when p_new_status = 'LOCKED' then now() else null end
  where id = p_period_id
  returning * into updated_row;

  insert into public.investment_accounting_period_events (
    period_id, previous_status, new_status, actor_user_id, reason
  ) values (
    p_period_id, period_row.status, p_new_status, p_actor_user_id, left(coalesce(p_reason, ''), 2000)
  );
  return updated_row;
end;
$$;

create or replace function public.freeze_investment_fund_nav(
  p_actor_user_id uuid,
  p_book_id uuid,
  p_nav_date date,
  p_portfolio_snapshot_run_id uuid default null,
  p_notes text default ''
)
returns public.investment_fund_nav_snapshots
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  book_row public.investment_accounting_books;
  total_assets_value numeric(30, 8);
  total_liabilities_value numeric(30, 8);
  nav_value numeric(30, 8);
  total_units_value numeric(38, 12);
  nav_per_unit_value numeric(30, 12);
  journal_cutoff bigint;
  capital_cutoff bigint;
  created_snapshot public.investment_fund_nav_snapshots;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  if p_nav_date > current_date then raise exception 'NAV cannot be future dated'; end if;
  select * into book_row from public.investment_accounting_books where id = p_book_id and status = 'ACTIVE';
  if book_row.id is null then raise exception 'Active accounting book not found'; end if;

  select
    coalesce(sum(case when account.account_type = 'ASSET' then line.debit_amount - line.credit_amount else 0 end), 0),
    coalesce(sum(case when account.account_type = 'LIABILITY' then line.credit_amount - line.debit_amount else 0 end), 0),
    coalesce(max(entry.sequence_no), 0)
  into total_assets_value, total_liabilities_value, journal_cutoff
  from public.investment_journal_entries entry
  join public.investment_journal_lines line on line.entry_id = entry.id
  join public.investment_chart_of_accounts account on account.id = line.account_id
  where entry.book_id = p_book_id and entry.effective_date <= p_nav_date;

  select coalesce(sum(event.units_delta), 0), coalesce(max(event.sequence_no), 0)
  into total_units_value, capital_cutoff
  from public.neuro_capital_account_events event
  where event.pool_id = book_row.pool_id and event.event_date <= p_nav_date;

  nav_value := round(total_assets_value - total_liabilities_value, book_row.currency_precision);
  if total_units_value < 0 then raise exception 'Total partner units cannot be negative'; end if;
  if total_units_value = 0 and nav_value <> 0 then
    raise exception 'A fund without issued units cannot have non-zero NAV';
  end if;
  nav_per_unit_value := case when total_units_value = 0 then null else nav_value / total_units_value end;

  insert into public.investment_fund_nav_snapshots (
    book_id, pool_id, nav_date, total_assets, total_liabilities, net_asset_value,
    total_units, nav_per_unit, journal_sequence_cutoff,
    capital_event_sequence_cutoff, portfolio_snapshot_run_id,
    input_manifest, snapshot_sha256, approved_by
  ) values (
    p_book_id, book_row.pool_id, p_nav_date, total_assets_value, total_liabilities_value,
    nav_value, total_units_value, nav_per_unit_value, journal_cutoff, capital_cutoff,
    p_portfolio_snapshot_run_id,
    jsonb_build_object(
      'bookId', p_book_id,
      'journalSequenceCutoff', journal_cutoff,
      'capitalEventSequenceCutoff', capital_cutoff,
      'notes', left(coalesce(p_notes, ''), 2000)
    ),
    encode(digest(concat_ws('|', p_book_id, p_nav_date, total_assets_value,
      total_liabilities_value, nav_value, total_units_value, journal_cutoff,
      capital_cutoff, coalesce(p_portfolio_snapshot_run_id::text, '')), 'sha256'), 'hex'),
    p_actor_user_id
  ) returning * into created_snapshot;

  if exists (
    select 1 from public.neuro_capital_nav_history history
    where history.pool_id = book_row.pool_id and history.nav_date = p_nav_date
  ) then
    if not exists (
      select 1 from public.neuro_capital_nav_history history
      where history.pool_id = book_row.pool_id
        and history.nav_date = p_nav_date
        and history.total_net_assets = nav_value
        and abs(history.total_units - total_units_value) <= 0.000000000001
    ) then
      raise exception 'Existing capital NAV for this date does not match the fund NAV snapshot';
    end if;
  else
    insert into public.neuro_capital_nav_history (
      user_id, pool_id, nav_date, total_net_assets, total_units, nav_per_unit,
      source, notes, fund_nav_snapshot_id, total_assets, total_liabilities,
      reconciliation_status
    )
    select pool.user_id, pool.id, p_nav_date, nav_value, 0, null,
      'system', left(coalesce(p_notes, ''), 2000), created_snapshot.id,
      total_assets_value, total_liabilities_value, 'RECONCILED'
    from public.neuro_capital_pools pool
    where pool.id = book_row.pool_id;
  end if;

  return created_snapshot;
end;
$$;

create or replace function public.reconcile_partner_capital_to_nav(
  p_actor_user_id uuid,
  p_fund_nav_snapshot_id uuid,
  p_tolerance numeric default 0.01
)
returns public.investment_reconciliation_runs
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  nav_row public.investment_fund_nav_snapshots;
  partner_total numeric(30, 8);
  difference_value numeric(30, 8);
  status_value text;
  created_run public.investment_reconciliation_runs;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify') then
    raise exception 'Accounting modification permission required';
  end if;
  select * into nav_row from public.investment_fund_nav_snapshots where id = p_fund_nav_snapshot_id;
  if nav_row.id is null then raise exception 'Fund NAV snapshot not found'; end if;

  select round(coalesce(sum(account_units.units * nav_row.nav_per_unit), 0), 8)
  into partner_total
  from (
    select account.id, coalesce(sum(event.units_delta), 0) as units
    from public.neuro_capital_accounts account
    left join public.neuro_capital_account_events event
      on event.account_id = account.id and event.event_date <= nav_row.nav_date
    where account.pool_id = nav_row.pool_id
    group by account.id
  ) account_units;

  difference_value := round(partner_total - nav_row.net_asset_value, 8);
  status_value := case when abs(difference_value) <= p_tolerance then 'PASSED' else 'FAILED' end;

  insert into public.investment_reconciliation_runs (
    book_id, pool_id, reconciliation_type, as_of_date, tolerance,
    internal_total, external_total, difference, status,
    internal_snapshot, external_snapshot, run_sha256, performed_by
  ) values (
    nav_row.book_id, nav_row.pool_id, 'PARTNER_CAPITAL_TO_NAV', nav_row.nav_date,
    p_tolerance, partner_total, nav_row.net_asset_value, difference_value, status_value,
    jsonb_build_object('partnerCapital', partner_total, 'navPerUnit', nav_row.nav_per_unit, 'totalUnits', nav_row.total_units),
    jsonb_build_object('fundNAV', nav_row.net_asset_value, 'fundNavSnapshotId', nav_row.id),
    encode(digest(concat_ws('|', nav_row.id, partner_total, nav_row.net_asset_value,
      difference_value, p_tolerance), 'sha256'), 'hex'),
    p_actor_user_id
  ) returning * into created_run;

  insert into public.investment_reconciliation_items (
    reconciliation_run_id, item_type, item_reference, internal_value,
    external_value, difference, status, details
  ) values (
    created_run.id, 'PARTNER_CAPITAL', nav_row.pool_id::text, partner_total,
    nav_row.net_asset_value, difference_value,
    case when status_value = 'PASSED' then 'MATCHED' else 'DIFFERENCE' end,
    jsonb_build_object('tolerance', p_tolerance)
  );
  return created_run;
end;
$$;

create or replace function public.guard_investment_ledger_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.investment_ledger_posting', true), '') <> 'on' then
    raise exception 'Journal entries must be posted through the controlled posting function';
  end if;
  return new;
end;
$$;

create or replace function public.guard_investment_period_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.investment_period_transition', true), '') <> 'on' then
    raise exception 'Accounting periods must use the controlled transition function';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_investment_period_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.investment_accounting_periods period
    where period.book_id = new.book_id
      and period.id <> new.id
      and daterange(period.period_start, period.period_end, '[]')
        && daterange(new.period_start, new.period_end, '[]')
  ) then
    raise exception 'Accounting periods cannot overlap';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_investment_accounting_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Investment accounting history is append-only';
end;
$$;

drop trigger if exists investment_journal_entries_guard_insert on public.investment_journal_entries;
create trigger investment_journal_entries_guard_insert
  before insert on public.investment_journal_entries
  for each row execute function public.guard_investment_ledger_insert();

drop trigger if exists investment_journal_lines_guard_insert on public.investment_journal_lines;
create trigger investment_journal_lines_guard_insert
  before insert on public.investment_journal_lines
  for each row execute function public.guard_investment_ledger_insert();

drop trigger if exists investment_periods_guard_update on public.investment_accounting_periods;
create trigger investment_periods_guard_update
  before update on public.investment_accounting_periods
  for each row execute function public.guard_investment_period_update();

drop trigger if exists investment_periods_prevent_overlap on public.investment_accounting_periods;
create trigger investment_periods_prevent_overlap
  before insert on public.investment_accounting_periods
  for each row execute function public.prevent_investment_period_overlap();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_accounting_period_events',
    'investment_journal_entries',
    'investment_journal_lines',
    'investment_portfolio_snapshot_runs',
    'investment_portfolio_position_snapshots',
    'investment_portfolio_cash_snapshots',
    'investment_fund_nav_snapshots',
    'investment_reconciliation_runs',
    'investment_reconciliation_items',
    'investment_reconciliation_reviews'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_prevent_mutation', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.prevent_investment_accounting_history_mutation()',
      table_name || '_prevent_mutation', table_name
    );
  end loop;
end;
$$;

drop trigger if exists investment_accounting_books_set_updated_at on public.investment_accounting_books;
create trigger investment_accounting_books_set_updated_at
  before update on public.investment_accounting_books
  for each row execute function public.set_updated_at();

drop trigger if exists investment_accounting_periods_set_updated_at on public.investment_accounting_periods;
create trigger investment_accounting_periods_set_updated_at
  before update on public.investment_accounting_periods
  for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_accounting_books',
    'investment_accounting_periods',
    'investment_accounting_period_events',
    'investment_chart_of_accounts',
    'investment_journal_entries',
    'investment_journal_lines',
    'investment_portfolio_snapshot_runs',
    'investment_portfolio_position_snapshots',
    'investment_portfolio_cash_snapshots',
    'investment_fund_nav_snapshots',
    'investment_reconciliation_runs',
    'investment_reconciliation_items',
    'investment_reconciliation_reviews'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_accounting_books',
    'investment_accounting_periods',
    'investment_accounting_period_events',
    'investment_chart_of_accounts',
    'investment_journal_entries',
    'investment_journal_lines',
    'investment_portfolio_snapshot_runs',
    'investment_portfolio_position_snapshots',
    'investment_portfolio_cash_snapshots',
    'investment_fund_nav_snapshots',
    'investment_reconciliation_runs',
    'investment_reconciliation_items',
    'investment_reconciliation_reviews'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read_internal', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.investment_current_user_has_permission(''accounting.view''))',
      table_name || '_read_internal', table_name
    );
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

revoke all on function public.create_investment_accounting_book(uuid, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_investment_accounting_book(uuid, uuid, text, text, integer, text)
  to service_role;

revoke all on function public.create_investment_accounting_period(uuid, uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.create_investment_accounting_period(uuid, uuid, text, date, date)
  to service_role;

revoke all on function public.post_investment_journal_entry(uuid, uuid, uuid, date, text, text, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.post_investment_journal_entry(uuid, uuid, uuid, date, text, text, text, text, text, text, jsonb, uuid)
  to service_role;

revoke all on function public.reverse_investment_journal_entry(uuid, uuid, uuid, date, text, text)
  from public, anon, authenticated;
grant execute on function public.reverse_investment_journal_entry(uuid, uuid, uuid, date, text, text)
  to service_role;

revoke all on function public.transition_investment_accounting_period(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_investment_accounting_period(uuid, uuid, text, text)
  to service_role;

revoke all on function public.freeze_investment_fund_nav(uuid, uuid, date, uuid, text)
  from public, anon, authenticated;
grant execute on function public.freeze_investment_fund_nav(uuid, uuid, date, uuid, text)
  to service_role;

revoke all on function public.reconcile_partner_capital_to_nav(uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.reconcile_partner_capital_to_nav(uuid, uuid, numeric)
  to service_role;

notify pgrst, 'reload schema';
