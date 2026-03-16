-- Soft archive support for customers
alter table public.customers
  add column if not exists archived_at timestamptz;

create index if not exists customers_company_archived_idx
  on public.customers (company_id, archived_at);