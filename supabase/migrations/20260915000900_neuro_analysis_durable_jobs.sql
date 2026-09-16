alter table public.neuro_analysis_jobs
  add column if not exists max_attempts integer not null default 3,
  add column if not exists locked_at timestamptz,
  add column if not exists dedupe_key text;

create unique index if not exists neuro_analysis_jobs_dedupe_key_idx
  on public.neuro_analysis_jobs(dedupe_key)
  where dedupe_key is not null;

drop policy if exists "neuro_analysis_jobs_insert_own" on public.neuro_analysis_jobs;
drop policy if exists "neuro_analysis_jobs_update_own" on public.neuro_analysis_jobs;
revoke insert, update, delete on public.neuro_analysis_jobs from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'neuro-analysis-staging',
  'neuro-analysis-staging',
  false,
  36700160,
  array['application/pdf', 'text/html', 'application/octet-stream']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_neuro_analysis_jobs(p_limit integer default 2)
returns setof public.neuro_analysis_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.neuro_analysis_jobs
  set status = 'queued',
      run_after = now(),
      locked_at = null,
      error = 'Recovered after worker timeout.'
  where status = 'running'
    and locked_at < now() - interval '10 minutes'
    and attempts < max_attempts;

  return query
  update public.neuro_analysis_jobs jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      started_at = now(),
      locked_at = now(),
      completed_at = null,
      error = null
  where jobs.id in (
    select candidate.id
    from public.neuro_analysis_jobs candidate
    where candidate.status = 'queued'
      and candidate.run_after <= now()
      and candidate.attempts < candidate.max_attempts
    order by candidate.run_after asc, candidate.created_at asc
    for update skip locked
    limit greatest(1, least(10, p_limit))
  )
  returning jobs.*;
end;
$$;

revoke all on function public.claim_neuro_analysis_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_neuro_analysis_jobs(integer)
  to service_role;

notify pgrst, 'reload schema';

