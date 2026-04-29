-- RLS policies for journal-related tables (owner-only)

-- journal_entries
alter table if exists public.journal_entries enable row level security;
drop policy if exists "Journal entries are read by owner" on public.journal_entries;
drop policy if exists "Journal entries are insert by owner" on public.journal_entries;
drop policy if exists "Journal entries are update by owner" on public.journal_entries;
drop policy if exists "Journal entries are delete by owner" on public.journal_entries;
create policy "Journal entries are read by owner"
  on public.journal_entries
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "Journal entries are insert by owner"
  on public.journal_entries
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "Journal entries are update by owner"
  on public.journal_entries
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Journal entries are delete by owner"
  on public.journal_entries
  for delete
  to authenticated
  using (user_id = auth.uid());

-- journal_trades
alter table if exists public.journal_trades enable row level security;
drop policy if exists "Journal trades are read by owner" on public.journal_trades;
drop policy if exists "Journal trades are insert by owner" on public.journal_trades;
drop policy if exists "Journal trades are update by owner" on public.journal_trades;
drop policy if exists "Journal trades are delete by owner" on public.journal_trades;
create policy "Journal trades are read by owner"
  on public.journal_trades
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "Journal trades are insert by owner"
  on public.journal_trades
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "Journal trades are update by owner"
  on public.journal_trades
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Journal trades are delete by owner"
  on public.journal_trades
  for delete
  to authenticated
  using (user_id = auth.uid());

-- journal_templates
alter table if exists public.journal_templates enable row level security;
drop policy if exists "Journal templates are read by owner" on public.journal_templates;
drop policy if exists "Journal templates are insert by owner" on public.journal_templates;
drop policy if exists "Journal templates are update by owner" on public.journal_templates;
drop policy if exists "Journal templates are delete by owner" on public.journal_templates;
create policy "Journal templates are read by owner"
  on public.journal_templates
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "Journal templates are insert by owner"
  on public.journal_templates
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "Journal templates are update by owner"
  on public.journal_templates
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Journal templates are delete by owner"
  on public.journal_templates
  for delete
  to authenticated
  using (user_id = auth.uid());

-- journal_ui_settings
alter table if exists public.journal_ui_settings enable row level security;
drop policy if exists "Journal UI settings are read by owner" on public.journal_ui_settings;
drop policy if exists "Journal UI settings are insert by owner" on public.journal_ui_settings;
drop policy if exists "Journal UI settings are update by owner" on public.journal_ui_settings;
drop policy if exists "Journal UI settings are delete by owner" on public.journal_ui_settings;
create policy "Journal UI settings are read by owner"
  on public.journal_ui_settings
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "Journal UI settings are insert by owner"
  on public.journal_ui_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "Journal UI settings are update by owner"
  on public.journal_ui_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Journal UI settings are delete by owner"
  on public.journal_ui_settings
  for delete
  to authenticated
  using (user_id = auth.uid());

-- daily_checklists
alter table if exists public.daily_checklists enable row level security;
drop policy if exists "Daily checklists are read by owner" on public.daily_checklists;
drop policy if exists "Daily checklists are insert by owner" on public.daily_checklists;
drop policy if exists "Daily checklists are update by owner" on public.daily_checklists;
drop policy if exists "Daily checklists are delete by owner" on public.daily_checklists;
create policy "Daily checklists are read by owner"
  on public.daily_checklists
  for select
  to authenticated
  using (user_id = auth.uid());
create policy "Daily checklists are insert by owner"
  on public.daily_checklists
  for insert
  to authenticated
  with check (user_id = auth.uid());
create policy "Daily checklists are update by owner"
  on public.daily_checklists
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Daily checklists are delete by owner"
  on public.daily_checklists
  for delete
  to authenticated
  using (user_id = auth.uid());
