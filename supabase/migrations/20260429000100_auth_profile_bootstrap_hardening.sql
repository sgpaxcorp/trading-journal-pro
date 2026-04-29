-- Harden the legacy auth.users -> profiles bootstrap used by production.
--
-- The current app already upserts profiles in its signup/admin flows, but
-- production still has a legacy trigger that calls public.handle_new_user_profile()
-- on auth.users inserts. That legacy function is not versioned in this repo and
-- can block Auth user creation when the profiles schema evolves.
--
-- This replacement keeps the trigger useful as a fallback for dashboard/manual
-- user creation while making it idempotent, explicit about columns, and
-- non-blocking if profile bootstrapping ever fails.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := trim(coalesce(meta->>'full_name', ''));
  derived_first text;
  derived_last text;
begin
  derived_first := nullif(
    coalesce(
      meta->>'first_name',
      meta->>'firstName',
      case
        when full_name <> '' then split_part(full_name, ' ', 1)
        else ''
      end
    ),
    ''
  );

  derived_last := nullif(
    coalesce(
      meta->>'last_name',
      meta->>'lastName',
      case
        when position(' ' in full_name) > 0 then trim(substr(full_name, position(' ' in full_name) + 1))
        else ''
      end
    ),
    ''
  );

  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    postal_address,
    plan,
    subscription_status,
    onboarding_completed
  )
  values (
    new.id,
    new.email,
    derived_first,
    derived_last,
    nullif(meta->>'phone', ''),
    nullif(coalesce(meta->>'postal_address', meta->>'address'), ''),
    coalesce(nullif(lower(meta->>'plan'), ''), 'core'),
    coalesce(
      nullif(meta->>'subscription_status', ''),
      nullif(meta->>'subscriptionStatus', ''),
      'pending'
    ),
    false
  )
  on conflict (id) do update
  set
    email = excluded.email,
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    phone = coalesce(excluded.phone, profiles.phone),
    postal_address = coalesce(excluded.postal_address, profiles.postal_address),
    plan = coalesce(excluded.plan, profiles.plan),
    subscription_status = coalesce(excluded.subscription_status, profiles.subscription_status);

  return new;
exception
  when others then
    raise warning 'handle_new_user_profile failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;
