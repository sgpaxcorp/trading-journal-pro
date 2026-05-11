create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_limit_buckets_count_check check (count >= 0),
  constraint rate_limit_buckets_key_length_check check (char_length(bucket_key) between 1 and 191)
);

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;

drop policy if exists "rate_limit_buckets_service_only" on public.rate_limit_buckets;
create policy "rate_limit_buckets_service_only"
  on public.rate_limit_buckets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists rate_limit_buckets_set_updated_at on public.rate_limit_buckets;
create trigger rate_limit_buckets_set_updated_at
before update on public.rate_limit_buckets
for each row
execute function public.set_updated_at();

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_ms integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  current_count integer,
  limit_value integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
  v_window interval;
begin
  if coalesce(char_length(trim(p_bucket_key)), 0) = 0 then
    raise exception 'rate limit bucket key is required';
  end if;

  if p_limit <= 0 then
    raise exception 'rate limit must be greater than zero';
  end if;

  if p_window_ms <= 0 then
    raise exception 'rate limit window must be greater than zero';
  end if;

  v_window := make_interval(secs => p_window_ms::double precision / 1000.0);

  insert into public.rate_limit_buckets as buckets (
    bucket_key,
    count,
    reset_at
  )
  values (
    p_bucket_key,
    1,
    now() + v_window
  )
  on conflict (bucket_key) do update
  set
    count = case
      when buckets.reset_at <= now() then 1
      else buckets.count + 1
    end,
    reset_at = case
      when buckets.reset_at <= now() then now() + v_window
      else buckets.reset_at
    end,
    updated_at = now()
  returning count, reset_at
  into v_count, v_reset_at;

  return query
  select
    v_count <= p_limit as allowed,
    greatest(0, p_limit - v_count) as remaining,
    v_reset_at as reset_at,
    v_count as current_count,
    p_limit as limit_value;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
