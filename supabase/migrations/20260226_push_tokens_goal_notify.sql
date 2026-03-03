alter table if exists public.push_tokens
  add column if not exists last_goal_notified_date date;

create index if not exists push_tokens_goal_notified_idx
  on public.push_tokens(last_goal_notified_date);
