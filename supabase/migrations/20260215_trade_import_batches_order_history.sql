-- Adds order history metadata to import batches
alter table if exists public.trade_import_batches
  add column if not exists order_history_events integer default 0;

alter table if exists public.trade_import_batches
  add column if not exists order_history_duplicates integer default 0;

alter table if exists public.trade_import_batches
  add column if not exists order_history_import_id uuid;
