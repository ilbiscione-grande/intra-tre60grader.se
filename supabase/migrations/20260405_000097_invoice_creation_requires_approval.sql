create or replace function public.trg_require_approved_order_for_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order public.orders;
  v_order_label text;
begin
  if new.kind <> 'invoice' then
    return new;
  end if;

  if new.order_id is not null then
    select *
    into v_order
    from public.orders
    where id = new.order_id
      and company_id = new.company_id;

    if v_order.id is null then
      raise exception 'Order not found for invoice creation';
    end if;

    if coalesce(v_order.invoice_readiness_status, 'not_ready') <> 'approved_for_invoicing' then
      v_order_label := coalesce(nullif(trim(v_order.order_no), ''), v_order.id::text);
      raise exception 'Order % must be Fastställd för fakturering before invoice creation', v_order_label;
    end if;
  end if;

  for v_order_id in
    select distinct (item->>'order_id')::uuid
    from jsonb_array_elements(coalesce(new.lines_snapshot, '[]'::jsonb)) as item
    where coalesce(item->>'order_id', '') ~* '^[0-9a-f-]{36}$'
  loop
    if new.order_id is not null and v_order_id = new.order_id then
      continue;
    end if;

    select *
    into v_order
    from public.orders
    where id = v_order_id
      and company_id = new.company_id;

    if v_order.id is null then
      raise exception 'Order % not found for invoice creation', v_order_id;
    end if;

    if coalesce(v_order.invoice_readiness_status, 'not_ready') <> 'approved_for_invoicing' then
      v_order_label := coalesce(nullif(trim(v_order.order_no), ''), v_order.id::text);
      raise exception 'Order % must be Fastställd för fakturering before invoice creation', v_order_label;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_require_approved_order_for_invoice on public.invoices;
create trigger trg_require_approved_order_for_invoice
before insert on public.invoices
for each row
execute function public.trg_require_approved_order_for_invoice();
