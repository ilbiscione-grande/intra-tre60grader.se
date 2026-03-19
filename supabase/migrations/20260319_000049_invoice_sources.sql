-- Support source tracking for standard invoices and future combined invoices.

create table if not exists public.invoice_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  source_kind text not null default 'order' check (source_kind in ('order')),
  position integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  unique (invoice_id, order_id)
);

create index if not exists invoice_sources_company_invoice_position_idx
  on public.invoice_sources(company_id, invoice_id, position);

create index if not exists invoice_sources_company_order_idx
  on public.invoice_sources(company_id, order_id);

alter table public.invoice_sources enable row level security;

drop policy if exists invoice_sources_select_finance on public.invoice_sources;
create policy invoice_sources_select_finance on public.invoice_sources
for select
using (public.has_finance_access(company_id));

drop policy if exists invoice_sources_insert_finance on public.invoice_sources;
create policy invoice_sources_insert_finance on public.invoice_sources
for insert
with check (public.has_finance_access(company_id));

drop policy if exists invoice_sources_update_finance on public.invoice_sources;
create policy invoice_sources_update_finance on public.invoice_sources
for update
using (public.has_finance_access(company_id))
with check (public.has_finance_access(company_id));

drop policy if exists invoice_sources_delete_admin on public.invoice_sources;
create policy invoice_sources_delete_admin on public.invoice_sources
for delete
using (public.app_user_role(company_id) = 'admin');

grant select, insert, update, delete on public.invoice_sources to authenticated;
