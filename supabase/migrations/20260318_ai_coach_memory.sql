create table if not exists public.ai_coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('global', 'weekly', 'daily')),
  scope_key text not null,
  memory text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, scope_key)
);

create index if not exists ai_coach_memory_user_idx on public.ai_coach_memory(user_id);
create index if not exists ai_coach_memory_scope_idx on public.ai_coach_memory(user_id, scope, updated_at desc);

alter table public.ai_coach_memory enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_memory' and policyname = 'ai_coach_memory_select'
  ) then
    create policy ai_coach_memory_select on public.ai_coach_memory
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_memory' and policyname = 'ai_coach_memory_insert'
  ) then
    create policy ai_coach_memory_insert on public.ai_coach_memory
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_memory' and policyname = 'ai_coach_memory_update'
  ) then
    create policy ai_coach_memory_update on public.ai_coach_memory
      for update using (auth.uid() = user_id);
  end if;
end $$;
