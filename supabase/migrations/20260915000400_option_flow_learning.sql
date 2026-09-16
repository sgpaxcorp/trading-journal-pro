create table if not exists public.option_flow_learning_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id text not null,
  underlying text not null,
  market_symbol text not null,
  provider text,
  trade_intent text,
  source_session_date date not null,
  target_session_date date not null,
  evaluation_due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'retry', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  tracked_flows jsonb not null default '[]'::jsonb,
  analysis_snapshot jsonb not null default '{}'::jsonb,
  market_validation jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_id)
);

create index if not exists option_flow_learning_due_idx
  on public.option_flow_learning_runs (status, evaluation_due_at)
  where status in ('pending', 'retry');

create index if not exists option_flow_learning_user_created_idx
  on public.option_flow_learning_runs (user_id, created_at desc);

create index if not exists option_flow_learning_underlying_idx
  on public.option_flow_learning_runs (user_id, underlying, evaluated_at desc);

alter table public.option_flow_learning_runs enable row level security;

drop policy if exists "option_flow_learning_select_own" on public.option_flow_learning_runs;
create policy "option_flow_learning_select_own"
  on public.option_flow_learning_runs
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.option_flow_learning_runs from authenticated;
grant select on public.option_flow_learning_runs to authenticated;
