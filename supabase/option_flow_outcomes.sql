-- Option Flow outcomes (post-mortem)
create table if not exists public.option_flow_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid references public.option_flow_memory(id) on delete set null,
  underlying text,
  provider text,
  trade_intent text,
  report_created_at timestamptz,
  outcome_text text,
  chart_path text,
  post_mortem jsonb,
  created_at timestamptz default now()
);

create index if not exists option_flow_outcomes_user_idx
  on public.option_flow_outcomes (user_id, created_at desc);

create index if not exists option_flow_outcomes_underlying_idx
  on public.option_flow_outcomes (user_id, underlying, created_at desc);

alter table public.option_flow_outcomes enable row level security;

create policy "option_flow_outcomes_select_own"
  on public.option_flow_outcomes
  for select
  using (auth.uid() = user_id);

create policy "option_flow_outcomes_insert_own"
  on public.option_flow_outcomes
  for insert
  with check (auth.uid() = user_id);
