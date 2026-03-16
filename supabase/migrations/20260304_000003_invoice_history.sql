-- Persisted invoice history per project/company.

create table if not exists public.invoice_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  summary text not null default '',
  rpc_result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_history_company_project_created_idx
  on public.invoice_history(company_id, project_id, created_at desc);

create index if not exists invoice_history_order_idx
  on public.invoice_history(order_id);

alter table public.invoice_history enable row level security;

drop policy if exists invoice_history_select_member on public.invoice_history;
create policy invoice_history_select_member on public.invoice_history
for select
using (public.is_company_member(company_id));

drop policy if exists invoice_history_insert_finance on public.invoice_history;
create policy invoice_history_insert_finance on public.invoice_history
for insert
with check (public.has_finance_access(company_id));

drop policy if exists invoice_history_update_admin on public.invoice_history;
create policy invoice_history_update_admin on public.invoice_history
for update
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists invoice_history_delete_admin on public.invoice_history;
create policy invoice_history_delete_admin on public.invoice_history
for delete
using (public.app_user_role(company_id) = 'admin');

grant select, insert, update, delete on public.invoice_history to authenticated;
