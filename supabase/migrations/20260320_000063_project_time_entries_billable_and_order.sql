alter table public.project_time_entries
  add column if not exists order_id uuid null references public.orders(id) on delete set null,
  add column if not exists is_billable boolean not null default true;

create index if not exists project_time_entries_company_order_idx
  on public.project_time_entries(company_id, order_id, entry_date desc);
