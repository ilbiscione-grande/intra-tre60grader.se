-- C2: project-finance coupling (budget, outcome, margin, cost center)

create table if not exists public.project_finance_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_center text,
  budget_revenue numeric(12,2) not null default 0,
  budget_cost numeric(12,2) not null default 0,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, project_id)
);

create table if not exists public.project_cost_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  supplier text,
  source text not null default 'manual',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_cost_entries_company_project_date_idx
  on public.project_cost_entries(company_id, project_id, entry_date desc, created_at desc);

alter table public.project_finance_plans enable row level security;
alter table public.project_cost_entries enable row level security;

drop policy if exists project_finance_plans_select_finance on public.project_finance_plans;
create policy project_finance_plans_select_finance on public.project_finance_plans
for select using (public.has_finance_access(company_id));

drop policy if exists project_finance_plans_insert_finance on public.project_finance_plans;
create policy project_finance_plans_insert_finance on public.project_finance_plans
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists project_finance_plans_update_finance on public.project_finance_plans;
create policy project_finance_plans_update_finance on public.project_finance_plans
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists project_cost_entries_select_finance on public.project_cost_entries;
create policy project_cost_entries_select_finance on public.project_cost_entries
for select using (public.has_finance_access(company_id));

drop policy if exists project_cost_entries_insert_finance on public.project_cost_entries;
create policy project_cost_entries_insert_finance on public.project_cost_entries
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists project_cost_entries_update_finance on public.project_cost_entries;
create policy project_cost_entries_update_finance on public.project_cost_entries
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists project_cost_entries_delete_finance on public.project_cost_entries;
create policy project_cost_entries_delete_finance on public.project_cost_entries
for delete using (public.has_finance_write_access(company_id));

grant select, insert, update on public.project_finance_plans to authenticated;
grant select, insert, update, delete on public.project_cost_entries to authenticated;

create or replace function public.project_finance_summary(
  p_company_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.project_finance_plans;
  v_actual_revenue numeric(12,2) := 0;
  v_actual_cost numeric(12,2) := 0;
  v_budget_revenue numeric(12,2) := 0;
  v_budget_cost numeric(12,2) := 0;
  v_actual_margin numeric(12,2) := 0;
  v_budget_margin numeric(12,2) := 0;
  v_margin_pct numeric(8,2) := 0;
begin
  if p_company_id is null or p_project_id is null then
    raise exception 'company_id and project_id are required';
  end if;

  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  select * into v_plan
  from public.project_finance_plans p
  where p.company_id = p_company_id
    and p.project_id = p_project_id;

  v_budget_revenue := round(coalesce(v_plan.budget_revenue, 0), 2);
  v_budget_cost := round(coalesce(v_plan.budget_cost, 0), 2);

  select round(coalesce(sum(
    case
      when i.kind = 'credit_note' then i.total * -1
      else i.total
    end
  ), 0), 2)
  into v_actual_revenue
  from public.invoices i
  where i.company_id = p_company_id
    and i.project_id = p_project_id
    and i.status <> 'void';

  select round(coalesce(sum(c.amount), 0), 2)
  into v_actual_cost
  from public.project_cost_entries c
  where c.company_id = p_company_id
    and c.project_id = p_project_id;

  v_actual_margin := round(v_actual_revenue - v_actual_cost, 2);
  v_budget_margin := round(v_budget_revenue - v_budget_cost, 2);

  if v_actual_revenue <> 0 then
    v_margin_pct := round((v_actual_margin / v_actual_revenue) * 100, 2);
  else
    v_margin_pct := 0;
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'project_id', p_project_id,
    'cost_center', coalesce(v_plan.cost_center, null),
    'budget', jsonb_build_object(
      'revenue', v_budget_revenue,
      'cost', v_budget_cost,
      'margin', v_budget_margin
    ),
    'actual', jsonb_build_object(
      'revenue', v_actual_revenue,
      'cost', v_actual_cost,
      'margin', v_actual_margin,
      'margin_pct', v_margin_pct
    )
  );
end;
$$;

grant execute on function public.project_finance_summary(uuid, uuid) to authenticated;
