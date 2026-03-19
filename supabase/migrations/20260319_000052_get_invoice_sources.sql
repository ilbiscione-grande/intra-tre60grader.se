-- Read helper for standard invoices and future combined invoices.

create or replace function public.get_invoice_sources(p_invoice_id uuid)
returns table (
  invoice_id uuid,
  company_id uuid,
  project_id uuid,
  project_title text,
  order_id uuid,
  order_no text,
  order_status text,
  source_position integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.invoice_id,
    s.company_id,
    s.project_id,
    p.title as project_title,
    s.order_id,
    o.order_no,
    o.status as order_status,
    s.position as source_position
  from public.invoice_sources s
  join public.projects p on p.id = s.project_id
  join public.orders o on o.id = s.order_id
  where s.invoice_id = p_invoice_id
    and public.has_finance_access(s.company_id)
  order by s.position asc, s.created_at asc;
$$;

grant execute on function public.get_invoice_sources(uuid) to authenticated;
