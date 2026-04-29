create table if not exists public.ai_coach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_coach_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_coach_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_coach_threads_user_idx on public.ai_coach_threads(user_id);
create index if not exists ai_coach_threads_updated_idx on public.ai_coach_threads(updated_at);
create index if not exists ai_coach_messages_thread_idx on public.ai_coach_messages(thread_id);

alter table public.ai_coach_threads enable row level security;
alter table public.ai_coach_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_coach_threads' and policyname = 'ai_coach_threads_select'
  ) then
    create policy ai_coach_threads_select on public.ai_coach_threads
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_coach_threads' and policyname = 'ai_coach_threads_insert'
  ) then
    create policy ai_coach_threads_insert on public.ai_coach_threads
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_coach_threads' and policyname = 'ai_coach_threads_update'
  ) then
    create policy ai_coach_threads_update on public.ai_coach_threads
      for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_coach_messages' and policyname = 'ai_coach_messages_select'
  ) then
    create policy ai_coach_messages_select on public.ai_coach_messages
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_coach_messages' and policyname = 'ai_coach_messages_insert'
  ) then
    create policy ai_coach_messages_insert on public.ai_coach_messages
      for insert with check (auth.uid() = user_id);
  end if;
end $$;
