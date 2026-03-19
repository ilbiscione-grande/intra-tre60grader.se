-- Protect invoice_sources so combined invoices cannot bypass existing
-- invoice period locks and invoice integrity rules.

create or replace function public.guard_invoice_source_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_order public.orders;
  v_conflict_invoice public.invoices;
begin
  if tg_op = 'DELETE' then
    select * into v_invoice
    from public.invoices
    where id = old.invoice_id;

    if v_invoice.id is not null and v_invoice.status <> 'void' then
      raise exception 'Invoice sources are immutable unless the invoice is void';
    end if;

    if v_invoice.id is not null then
      perform public.assert_finance_period_open(v_invoice.company_id, v_invoice.issue_date);
    end if;

    return old;
  end if;

  select * into v_invoice
  from public.invoices
  where id = new.invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found for invoice source';
  end if;

  select * into v_order
  from public.orders
  where id = new.order_id;

  if v_order.id is null then
    raise exception 'Order not found for invoice source';
  end if;

  if new.company_id <> v_invoice.company_id or new.company_id <> v_order.company_id then
    raise exception 'Invoice source company mismatch';
  end if;

  if new.project_id <> v_order.project_id then
    raise exception 'Invoice source project must match the order project';
  end if;

  if v_invoice.kind <> 'invoice' then
    raise exception 'Invoice sources are only supported for regular invoices';
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, v_invoice.issue_date);

  if tg_op = 'UPDATE' and old.invoice_id <> new.invoice_id and v_invoice.status <> 'void' then
    raise exception 'Invoice sources are immutable unless the invoice is void';
  end if;

  select i.*
  into v_conflict_invoice
  from public.invoice_sources s
  join public.invoices i on i.id = s.invoice_id
  where s.order_id = new.order_id
    and i.kind = 'invoice'
    and i.status <> 'void'
    and i.id <> new.invoice_id
  order by i.created_at desc
  limit 1;

  if v_conflict_invoice.id is not null then
    raise exception 'Order is already linked to active invoice %', v_conflict_invoice.invoice_no;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_source_integrity on public.invoice_sources;
create trigger trg_guard_invoice_source_integrity
before insert or update or delete on public.invoice_sources
for each row
execute function public.guard_invoice_source_integrity();

grant execute on function public.guard_invoice_source_integrity() to authenticated;
