-- Append-only reviews that determine what changed before a position is reconsidered.

create table if not exists public.neuro_analysis_position_exit_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  original_thesis_id uuid not null references public.neuro_analysis_original_theses(id) on delete cascade,
  -- Deliberately no report FK so report retention cannot erase the reviewed comparison.
  report_id uuid,
  ticker text not null,
  review_status text not null check (
    review_status in (
      'DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW',
      'NO_DOCUMENTED_CHANGE',
      'INSUFFICIENT_EVIDENCE'
    )
  ),
  primary_reason text check (
    primary_reason is null or primary_reason in (
      'FUNDAMENTAL_DETERIORATION',
      'ORIGINAL_THESIS_INVALIDATED',
      'VALUATION_MATERIALLY_CHANGED',
      'BETTER_CAPITAL_ALLOCATION_OPPORTUNITY',
      'PORTFOLIO_RISK_CONSTRAINT',
      'LIQUIDITY_REQUIREMENT',
      'TAX_CONSIDERATION',
      'CORPORATE_EVENT',
      'ORIGINAL_ANALYSIS_ERROR',
      'OTHER_DOCUMENTED_REASON'
    )
  ),
  secondary_reasons jsonb not null default '[]'::jsonb,
  summary text not null,
  what_changed jsonb not null default '[]'::jsonb,
  comparisons jsonb not null default '[]'::jsonb,
  classification_evidence jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  price_movement_assessment jsonb not null default '{}'::jsonb,
  comparison_snapshot jsonb not null default '{}'::jsonb,
  generated_by text not null check (generated_by in ('ai_research', 'deterministic_fallback')),
  content_hash text not null unique,
  created_at timestamptz not null default now(),
  check (
    (review_status = 'DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW' and primary_reason is not null)
    or (review_status <> 'DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW' and primary_reason is null)
  )
);

create index if not exists neuro_position_exit_reviews_original_created_idx
  on public.neuro_analysis_position_exit_reviews(original_thesis_id, created_at desc);

create index if not exists neuro_position_exit_reviews_user_case_created_idx
  on public.neuro_analysis_position_exit_reviews(user_id, case_id, created_at desc);

alter table public.neuro_analysis_position_exit_reviews enable row level security;

drop policy if exists "neuro_position_exit_reviews_select_own" on public.neuro_analysis_position_exit_reviews;
create policy "neuro_position_exit_reviews_select_own"
  on public.neuro_analysis_position_exit_reviews
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.neuro_analysis_position_exit_reviews from anon, authenticated;
grant select on public.neuro_analysis_position_exit_reviews to authenticated;

drop trigger if exists neuro_position_exit_reviews_prevent_update on public.neuro_analysis_position_exit_reviews;
create trigger neuro_position_exit_reviews_prevent_update
  before update on public.neuro_analysis_position_exit_reviews
  for each row execute function public.prevent_neuro_immutable_update();

notify pgrst, 'reload schema';
