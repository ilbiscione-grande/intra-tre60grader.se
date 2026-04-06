create or replace function public.is_order_finance_locked(p_company_id uuid, p_order_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.invoices i
    where i.company_id = p_company_id
      and i.status <> 'void'
      and (
        i.order_id = p_order_id
        or exists (
          select 1
          from public.invoice_sources s
          where s.company_id = i.company_id
            and s.invoice_id = i.id
            and s.order_id = p_order_id
        )
        or (
          i.kind = 'credit_note'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(i.lines_snapshot, '[]'::jsonb)) as item
            where coalesce(item->>'order_id', '') ~* '^[0-9a-f-]{36}$'
              and (item->>'order_id')::uuid = p_order_id
          )
        )
      )
  );
$$;

grant execute on function public.is_order_finance_locked(uuid, uuid) to authenticated;

create or replace function public.guard_locked_project_finance_order_lines()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_company_id uuid;
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select o.company_id
  into v_company_id
  from public.orders o
  where o.id = v_order_id;

  if v_company_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if public.is_order_finance_locked(v_company_id, v_order_id) then
    raise exception 'Order finance is locked after invoice issuance';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_locked_project_finance_orders()
returns trigger
language plpgsql
as $$
begin
  if not public.is_order_finance_locked(new.company_id, new.id) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from 'invoiced'
     and new.status = 'invoiced'
     and new.id = old.id
     and new.company_id = old.company_id
     and new.project_id = old.project_id
     and new.created_at = old.created_at
     and coalesce(new.order_no, '') = coalesce(old.order_no, '') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.company_id = old.company_id
     and new.project_id = old.project_id
     and new.status = old.status
     and new.total = old.total
     and new.created_at = old.created_at
     and coalesce(new.order_no, '') is distinct from coalesce(old.order_no, '') then
    return new;
  end if;

  raise exception 'Order finance is locked after invoice issuance';
end;
$$;
