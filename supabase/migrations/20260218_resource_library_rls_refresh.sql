-- Ensure Resource Library RLS + policies exist and refresh PostgREST schema cache.
alter table public.ntj_resource_library_items enable row level security;

drop policy if exists "ntj_resource_library_items_select_own" on public.ntj_resource_library_items;
create policy "ntj_resource_library_items_select_own"
  on public.ntj_resource_library_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ntj_resource_library_items_insert_own" on public.ntj_resource_library_items;
create policy "ntj_resource_library_items_insert_own"
  on public.ntj_resource_library_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "ntj_resource_library_items_update_own" on public.ntj_resource_library_items;
create policy "ntj_resource_library_items_update_own"
  on public.ntj_resource_library_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ntj_resource_library_items_delete_own" on public.ntj_resource_library_items;
create policy "ntj_resource_library_items_delete_own"
  on public.ntj_resource_library_items
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Refresh PostgREST schema cache so the table is visible immediately.
notify pgrst, 'reload schema';
