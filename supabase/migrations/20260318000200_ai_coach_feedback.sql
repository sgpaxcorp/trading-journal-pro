create table if not exists public.ai_coach_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.ai_coach_threads(id) on delete cascade,
  message_id uuid not null references public.ai_coach_messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_coach_feedback_user_idx on public.ai_coach_feedback(user_id);
create index if not exists ai_coach_feedback_thread_idx on public.ai_coach_feedback(thread_id);
create index if not exists ai_coach_feedback_message_idx on public.ai_coach_feedback(message_id);
create unique index if not exists ai_coach_feedback_user_message_uidx on public.ai_coach_feedback(user_id, message_id);

alter table public.ai_coach_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_feedback' and policyname = 'ai_coach_feedback_select'
  ) then
    create policy ai_coach_feedback_select on public.ai_coach_feedback
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_feedback' and policyname = 'ai_coach_feedback_insert'
  ) then
    create policy ai_coach_feedback_insert on public.ai_coach_feedback
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_coach_feedback' and policyname = 'ai_coach_feedback_update'
  ) then
    create policy ai_coach_feedback_update on public.ai_coach_feedback
      for update using (auth.uid() = user_id);
  end if;
end $$;
