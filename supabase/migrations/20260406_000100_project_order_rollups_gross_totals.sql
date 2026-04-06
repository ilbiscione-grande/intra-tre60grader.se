drop view if exists public.project_order_rollups;

create view public.project_order_rollups
with (security_invoker = true)
as
with order_totals as (
  select
    o.company_id,
    o.project_id,
    o.root_order_id,
    o.root_order_id as primary_order_id,
    count(*)::integer as order_count,
    count(*) filter (where o.order_kind = 'primary')::integer as primary_order_count,
    count(*) filter (where o.order_kind = 'change')::integer as change_order_count,
    count(*) filter (where o.order_kind = 'supplement')::integer as supplement_order_count,
    coalesce(sum(case when o.order_kind = 'primary' then gross.total else 0 end), 0)::numeric(12,2) as primary_total,
    coalesce(sum(case when o.order_kind = 'change' then gross.total else 0 end), 0)::numeric(12,2) as change_total,
    coalesce(sum(case when o.order_kind = 'supplement' then gross.total else 0 end), 0)::numeric(12,2) as supplement_total,
    coalesce(sum(gross.total), 0)::numeric(12,2) as total_order_value
  from public.orders o
  left join lateral (
    select coalesce(sum(round((coalesce(ol.total, 0) * (1 + coalesce(ol.vat_rate, 0) / 100.0))::numeric, 2)), 0)::numeric(12,2) as total
    from public.order_lines ol
    where ol.company_id = o.company_id
      and ol.order_id = o.id
  ) gross on true
  group by o.company_id, o.project_id, o.root_order_id
),
allocation_totals as (
  select
    a.company_id,
    a.project_id,
    a.root_order_id,
    coalesce(sum(case when a.allocation_source = 'invoice_source' and a.order_kind = 'primary' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as gross_invoiced_primary,
    coalesce(sum(case when a.allocation_source = 'invoice_source' and a.order_kind = 'change' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as gross_invoiced_change,
    coalesce(sum(case when a.allocation_source = 'invoice_source' and a.order_kind = 'supplement' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as gross_invoiced_supplement,
    coalesce(sum(case when a.allocation_source = 'invoice_source' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as gross_invoiced_total,
    coalesce(sum(case when a.allocation_source = 'credit_note_line' and a.order_kind = 'primary' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as credited_primary,
    coalesce(sum(case when a.allocation_source = 'credit_note_line' and a.order_kind = 'change' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as credited_change,
    coalesce(sum(case when a.allocation_source = 'credit_note_line' and a.order_kind = 'supplement' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as credited_supplement,
    coalesce(sum(case when a.allocation_source = 'credit_note_line' then a.gross_allocated_total else 0 end), 0)::numeric(12,2) as credited_total,
    coalesce(sum(case when a.order_kind = 'primary' then a.signed_allocated_total else 0 end), 0)::numeric(12,2) as net_invoiced_primary,
    coalesce(sum(case when a.order_kind = 'change' then a.signed_allocated_total else 0 end), 0)::numeric(12,2) as net_invoiced_change,
    coalesce(sum(case when a.order_kind = 'supplement' then a.signed_allocated_total else 0 end), 0)::numeric(12,2) as net_invoiced_supplement,
    coalesce(sum(a.signed_allocated_total), 0)::numeric(12,2) as net_invoiced_total
  from public.invoice_order_allocations a
  group by a.company_id, a.project_id, a.root_order_id
)
select
  o.company_id,
  o.project_id,
  o.root_order_id,
  o.primary_order_id,
  o.order_count,
  greatest(o.order_count - 1, 0)::integer as child_order_count,
  o.primary_order_count,
  o.change_order_count,
  o.supplement_order_count,
  o.primary_total,
  o.change_total,
  o.supplement_total,
  o.total_order_value,
  coalesce(a.gross_invoiced_primary, 0)::numeric(12,2) as gross_invoiced_primary,
  coalesce(a.gross_invoiced_change, 0)::numeric(12,2) as gross_invoiced_change,
  coalesce(a.gross_invoiced_supplement, 0)::numeric(12,2) as gross_invoiced_supplement,
  coalesce(a.gross_invoiced_total, 0)::numeric(12,2) as gross_invoiced_total,
  coalesce(a.credited_primary, 0)::numeric(12,2) as credited_primary,
  coalesce(a.credited_change, 0)::numeric(12,2) as credited_change,
  coalesce(a.credited_supplement, 0)::numeric(12,2) as credited_supplement,
  coalesce(a.credited_total, 0)::numeric(12,2) as credited_total,
  coalesce(a.net_invoiced_primary, 0)::numeric(12,2) as net_invoiced_primary,
  coalesce(a.net_invoiced_change, 0)::numeric(12,2) as net_invoiced_change,
  coalesce(a.net_invoiced_supplement, 0)::numeric(12,2) as net_invoiced_supplement,
  coalesce(a.net_invoiced_total, 0)::numeric(12,2) as net_invoiced_total,
  greatest((o.total_order_value - coalesce(a.net_invoiced_total, 0))::numeric, 0)::numeric(12,2) as remaining_total
from order_totals o
left join allocation_totals a
  on a.company_id = o.company_id
 and a.project_id = o.project_id
 and a.root_order_id = o.root_order_id;

grant select on public.project_order_rollups to authenticated;
