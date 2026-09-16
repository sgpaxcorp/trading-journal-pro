-- Permanent original investment thesis records and append-only future reviews.
-- A record can only be created from an immutable APPROVED committee decision.

create table if not exists public.neuro_analysis_original_theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  ticker text not null,
  -- IDs remain searchable, while the frozen snapshots below are the permanent source of truth.
  -- Deliberately no FK: deleting an auxiliary packet/decision must not delete the original thesis.
  committee_decision_id uuid not null,
  committee_packet_id uuid not null,
  purchase_date date not null,
  purchase_price numeric not null check (purchase_price > 0),
  portfolio_weight_pct numeric not null check (portfolio_weight_pct > 0 and portfolio_weight_pct <= 100),
  investment_thesis jsonb not null default '[]'::jsonb,
  valuation_assumptions jsonb not null default '{}'::jsonb,
  expected_business_developments jsonb not null default '[]'::jsonb,
  major_risks jsonb not null default '[]'::jsonb,
  expected_catalysts jsonb not null default '[]'::jsonb,
  key_metrics_to_monitor jsonb not null default '[]'::jsonb,
  invalidation_conditions jsonb not null default '[]'::jsonb,
  supporting_documents jsonb not null default '[]'::jsonb,
  committee_decision_snapshot jsonb not null default '{}'::jsonb,
  committee_packet_snapshot jsonb not null default '{}'::jsonb,
  content_hash text not null unique,
  created_at timestamptz not null default now(),
  unique (user_id, case_id),
  unique (committee_decision_id)
);

create table if not exists public.neuro_analysis_thesis_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  original_thesis_id uuid not null references public.neuro_analysis_original_theses(id) on delete cascade,
  -- Deliberately no FK: a report-retention cleanup must not rewrite or delete a thesis review.
  report_id uuid,
  ticker text not null,
  classification text not null check (
    classification in (
      'THESIS_STRENGTHENED',
      'THESIS_UNCHANGED',
      'THESIS_WEAKENED',
      'THESIS_INVALIDATED',
      'INSUFFICIENT_EVIDENCE'
    )
  ),
  summary text not null,
  changes jsonb not null default '[]'::jsonb,
  classification_evidence jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  comparison_snapshot jsonb not null default '{}'::jsonb,
  generated_by text not null check (generated_by in ('ai_research', 'deterministic_fallback')),
  content_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists neuro_original_theses_user_case_idx
  on public.neuro_analysis_original_theses(user_id, case_id, created_at desc);

create index if not exists neuro_original_theses_user_ticker_idx
  on public.neuro_analysis_original_theses(user_id, ticker, purchase_date desc);

create index if not exists neuro_thesis_reviews_original_created_idx
  on public.neuro_analysis_thesis_reviews(original_thesis_id, created_at desc);

create index if not exists neuro_thesis_reviews_user_case_created_idx
  on public.neuro_analysis_thesis_reviews(user_id, case_id, created_at desc);

alter table public.neuro_analysis_original_theses enable row level security;
alter table public.neuro_analysis_thesis_reviews enable row level security;

drop policy if exists "neuro_original_theses_select_own" on public.neuro_analysis_original_theses;
create policy "neuro_original_theses_select_own"
  on public.neuro_analysis_original_theses
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_thesis_reviews_select_own" on public.neuro_analysis_thesis_reviews;
create policy "neuro_thesis_reviews_select_own"
  on public.neuro_analysis_thesis_reviews
  for select
  using (auth.uid() = user_id);

-- Client sessions can read their records, but only authenticated server routes
-- may append them. Neither clients nor server code may overwrite a frozen row.
revoke insert, update, delete on public.neuro_analysis_original_theses from anon, authenticated;
revoke insert, update, delete on public.neuro_analysis_thesis_reviews from anon, authenticated;
grant select on public.neuro_analysis_original_theses to authenticated;
grant select on public.neuro_analysis_thesis_reviews to authenticated;

create or replace function public.prevent_neuro_immutable_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Immutable Neuro Analysis records cannot be updated';
end;
$$;

drop trigger if exists neuro_original_theses_prevent_update on public.neuro_analysis_original_theses;
create trigger neuro_original_theses_prevent_update
  before update on public.neuro_analysis_original_theses
  for each row execute function public.prevent_neuro_immutable_update();

drop trigger if exists neuro_thesis_reviews_prevent_update on public.neuro_analysis_thesis_reviews;
create trigger neuro_thesis_reviews_prevent_update
  before update on public.neuro_analysis_thesis_reviews
  for each row execute function public.prevent_neuro_immutable_update();

notify pgrst, 'reload schema';
