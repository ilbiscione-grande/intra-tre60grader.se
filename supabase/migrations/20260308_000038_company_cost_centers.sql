-- Company-specific cost centers for project finance
create table if not exists public.company_cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists company_cost_centers_company_active_sort_idx
  on public.company_cost_centers(company_id, active, sort_order, name);

create or replace function public.touch_company_cost_centers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_company_cost_centers_updated_at on public.company_cost_centers;
create trigger trg_touch_company_cost_centers_updated_at
before update on public.company_cost_centers
for each row execute function public.touch_company_cost_centers_updated_at();

alter table public.company_cost_centers enable row level security;

drop policy if exists company_cost_centers_select_finance on public.company_cost_centers;
create policy company_cost_centers_select_finance on public.company_cost_centers
for select using (public.has_finance_access(company_id));

drop policy if exists company_cost_centers_insert_finance on public.company_cost_centers;
create policy company_cost_centers_insert_finance on public.company_cost_centers
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists company_cost_centers_update_finance on public.company_cost_centers;
create policy company_cost_centers_update_finance on public.company_cost_centers
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists company_cost_centers_delete_finance on public.company_cost_centers;
create policy company_cost_centers_delete_finance on public.company_cost_centers
for delete using (public.has_finance_write_access(company_id));

grant select, insert, update, delete on public.company_cost_centers to authenticated;