-- Auto-cleanup all user-owned rows when a user is deleted from auth.users
-- Deletes from any public table that has a user_id column, plus profiles.id

create or replace function public.ntj_cleanup_user_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  -- Delete from public tables that have a user_id column
  for t in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
  loop
    execute format('delete from public.%I where user_id = $1', t.table_name) using old.id;
  end loop;

  -- Delete from profiles by id (if exists)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'
  ) then
    execute 'delete from public.profiles where id = $1' using old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists ntj_auth_user_cleanup on auth.users;
create trigger ntj_auth_user_cleanup
after delete on auth.users
for each row execute function public.ntj_cleanup_user_data();
