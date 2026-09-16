-- Subscription state and billing identifiers are server-owned. Authenticated
-- users can still edit ordinary profile fields, but cannot mint paid access.

create or replace function public.protect_profile_server_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan := 'core';
    new.subscription_status := 'pending';
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.trial_started_at := null;
    new.trial_ended_at := null;
    new.legal_terms_version := null;
    new.legal_privacy_version := null;
    new.legal_accepted_at := null;
    new.legal_checkout_accepted_at := null;
    new.legal_acceptance_ip := null;
    new.legal_acceptance_user_agent := null;
    new.email := nullif(auth.jwt()->>'email', '');
    return new;
  end if;

  if new.plan is distinct from old.plan
    or new.subscription_status is distinct from old.subscription_status
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.trial_started_at is distinct from old.trial_started_at
    or new.trial_ended_at is distinct from old.trial_ended_at
    or new.legal_terms_version is distinct from old.legal_terms_version
    or new.legal_privacy_version is distinct from old.legal_privacy_version
    or new.legal_accepted_at is distinct from old.legal_accepted_at
    or new.legal_checkout_accepted_at is distinct from old.legal_checkout_accepted_at
    or new.legal_acceptance_ip is distinct from old.legal_acceptance_ip
    or new.legal_acceptance_user_agent is distinct from old.legal_acceptance_user_agent
    or new.email is distinct from old.email
  then
    raise exception 'Profile contains server-managed fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_server_columns on public.profiles;
create trigger profiles_protect_server_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_server_columns();

create or replace function public.user_has_advanced_plan(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and p_user_id = auth.uid()
    and exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = p_user_id
        and ue.entitlement_key = 'platform_access'
        and lower(coalesce(ue.status, '')) in ('active', 'trialing')
        and lower(coalesce(ue.metadata->>'plan', '')) in ('advanced', 'pro')
    );
$$;

revoke all on function public.protect_profile_server_columns() from public, anon, authenticated;
revoke all on function public.user_has_advanced_plan(uuid) from public;
grant execute on function public.user_has_advanced_plan(uuid) to authenticated;

-- RLS is the second line of defense; table privileges must not permit direct
-- entitlement mutation through PostgREST either.
revoke insert, update, delete, truncate, references, trigger
  on table public.user_entitlements from anon, authenticated;

notify pgrst, 'reload schema';
