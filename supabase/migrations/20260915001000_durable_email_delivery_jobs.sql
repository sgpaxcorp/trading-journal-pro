create table if not exists public.email_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_delivery_jobs_claim_idx
  on public.email_delivery_jobs(status, run_after, created_at);

alter table public.email_delivery_jobs enable row level security;
revoke all on table public.email_delivery_jobs from public, anon, authenticated;
grant all on table public.email_delivery_jobs to service_role;

drop trigger if exists email_delivery_jobs_set_updated_at on public.email_delivery_jobs;
create trigger email_delivery_jobs_set_updated_at
  before update on public.email_delivery_jobs
  for each row execute function public.set_updated_at();

create or replace function public.claim_email_delivery_jobs(p_limit integer default 20)
returns setof public.email_delivery_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.email_delivery_jobs
  set status = 'queued', run_after = now(), locked_at = null,
      error = 'Recovered after worker timeout.'
  where status = 'running'
    and locked_at < now() - interval '10 minutes'
    and attempts < max_attempts;

  return query
  update public.email_delivery_jobs jobs
  set status = 'running', attempts = jobs.attempts + 1,
      locked_at = now(), completed_at = null, error = null
  where jobs.id in (
    select candidate.id
    from public.email_delivery_jobs candidate
    where candidate.status = 'queued'
      and candidate.run_after <= now()
      and candidate.attempts < candidate.max_attempts
    order by candidate.run_after asc, candidate.created_at asc
    for update skip locked
    limit greatest(1, least(100, p_limit))
  )
  returning jobs.*;
end;
$$;

revoke all on function public.claim_email_delivery_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_email_delivery_jobs(integer)
  to service_role;

notify pgrst, 'reload schema';

