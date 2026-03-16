-- Server-side finance lock: once a project has a non-void invoice, block further economic edits.

create or replace function public.is_project_finance_locked(p_company_id uuid, p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.invoices i
    where i.company_id = p_company_id
      and i.project_id = p_project_id
      and i.status <> 'void'
  );
$$;

create or replace function public.guard_locked_project_finance_direct()
returns trigger
language plpgsql
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_project_id := old.project_id;
  else
    v_company_id := new.company_id;
    v_project_id := new.project_id;
  end if;

  if public.is_project_finance_locked(v_company_id, v_project_id) then
    raise exception 'Project finance is locked after invoice issuance';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_locked_project_finance_order_lines()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_company_id uuid;
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select o.company_id, o.project_id
  into v_company_id, v_project_id
  from public.orders o
  where o.id = v_order_id;

  if v_company_id is null or v_project_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if public.is_project_finance_locked(v_company_id, v_project_id) then
    raise exception 'Project finance is locked after invoice issuance';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_locked_project_finance_orders()
returns trigger
language plpgsql
as $$
begin
  if not public.is_project_finance_locked(new.company_id, new.project_id) then
    return new;
  end if;

  -- Allow internal transition to invoiced in create_invoice_from_order.
  if tg_op = 'UPDATE'
     and old.status is distinct from 'invoiced'
     and new.status = 'invoiced'
     and new.id = old.id
     and new.company_id = old.company_id
     and new.project_id = old.project_id
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'Project finance is locked after invoice issuance';
end;
$$;

drop trigger if exists trg_guard_locked_project_finance_plans on public.project_finance_plans;
create trigger trg_guard_locked_project_finance_plans
before insert or update or delete on public.project_finance_plans
for each row execute function public.guard_locked_project_finance_direct();

drop trigger if exists trg_guard_locked_project_finance_cost_entries on public.project_cost_entries;
create trigger trg_guard_locked_project_finance_cost_entries
before insert or update or delete on public.project_cost_entries
for each row execute function public.guard_locked_project_finance_direct();

drop trigger if exists trg_guard_locked_project_finance_order_lines on public.order_lines;
create trigger trg_guard_locked_project_finance_order_lines
before insert or update or delete on public.order_lines
for each row execute function public.guard_locked_project_finance_order_lines();

drop trigger if exists trg_guard_locked_project_finance_orders on public.orders;
create trigger trg_guard_locked_project_finance_orders
before update on public.orders
for each row execute function public.guard_locked_project_finance_orders();