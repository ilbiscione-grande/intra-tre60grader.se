-- Backfill invoice_sources from existing invoices while keeping
-- invoices.project_id and invoices.order_id as compatibility fields in V1.

insert into public.invoice_sources (
  company_id,
  invoice_id,
  project_id,
  order_id,
  source_kind,
  position
)
select
  i.company_id,
  i.id,
  i.project_id,
  i.order_id,
  'order',
  1
from public.invoices i
where i.order_id is not null
  and not exists (
    select 1
    from public.invoice_sources s
    where s.invoice_id = i.id
      and s.order_id = i.order_id
  );
