create table if not exists public.neuro_analysis_filings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  form text not null check (form in ('10-K', '10-Q')),
  fiscal_year integer,
  period text,
  period_end date,
  file_name text not null,
  openai_file_id text not null,
  vector_store_id text not null,
  bytes bigint,
  usage_bytes bigint,
  status text not null default 'completed',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists neuro_analysis_filings_user_ticker_idx
  on public.neuro_analysis_filings(user_id, ticker, fiscal_year desc, created_at desc);

create index if not exists neuro_analysis_filings_vector_store_idx
  on public.neuro_analysis_filings(vector_store_id);

alter table public.neuro_analysis_filings enable row level security;

drop policy if exists "Users can read own neuro analysis filings" on public.neuro_analysis_filings;
create policy "Users can read own neuro analysis filings"
  on public.neuro_analysis_filings
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own neuro analysis filings" on public.neuro_analysis_filings;
create policy "Users can delete own neuro analysis filings"
  on public.neuro_analysis_filings
  for delete
  using (auth.uid() = user_id);

drop trigger if exists neuro_analysis_filings_set_updated_at on public.neuro_analysis_filings;
create trigger neuro_analysis_filings_set_updated_at
  before update on public.neuro_analysis_filings
  for each row execute function public.set_updated_at();
