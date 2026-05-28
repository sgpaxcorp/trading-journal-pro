-- Lock broker credential tables so secrets/tokens are never readable by browser/mobile clients.
-- Server APIs use the service-role client and remain responsible for all broker operations.

begin;

alter table if exists public.snaptrade_users enable row level security;
alter table if exists public.snaptrade_authorizations enable row level security;
alter table if exists public.broker_oauth_connections enable row level security;

drop policy if exists "snaptrade_users_select_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_insert_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_update_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_delete_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_select_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_insert_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_update_broker_sync_own" on public.snaptrade_users;
drop policy if exists "snaptrade_users_delete_broker_sync_own" on public.snaptrade_users;

drop policy if exists "snaptrade_auth_select_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_insert_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_update_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_delete_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_select_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_insert_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_update_broker_sync_own" on public.snaptrade_authorizations;
drop policy if exists "snaptrade_auth_delete_broker_sync_own" on public.snaptrade_authorizations;

drop policy if exists "broker_oauth_connections_select_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_insert_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_update_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_delete_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_select_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_insert_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_update_broker_sync_own" on public.broker_oauth_connections;
drop policy if exists "broker_oauth_connections_delete_broker_sync_own" on public.broker_oauth_connections;

revoke all on table public.snaptrade_users from anon, authenticated;
revoke all on table public.snaptrade_authorizations from anon, authenticated;
revoke all on table public.broker_oauth_connections from anon, authenticated;

grant all on table public.snaptrade_users to service_role;
grant all on table public.snaptrade_authorizations to service_role;
grant all on table public.broker_oauth_connections to service_role;

comment on table public.snaptrade_users is
  'Server-only SnapTrade credential table. Contains secrets; browser/mobile clients must not access it directly.';
comment on table public.snaptrade_authorizations is
  'Server-only SnapTrade authorization metadata/raw payload table. Browser/mobile clients must use backend APIs.';
comment on table public.broker_oauth_connections is
  'Server-only broker OAuth token table. Contains access/refresh tokens; browser/mobile clients must not access it directly.';

commit;

