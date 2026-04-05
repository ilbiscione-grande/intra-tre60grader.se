alter table public.orders
  add column if not exists root_order_id uuid null references public.orders(id) on delete set null;

-- Backfill of hierarchy metadata must also work for projects that are finance-locked
-- after invoice issuance. Temporarily disable the order finance-lock trigger while
-- we populate root_order_id on historical rows.
alter table public.orders
  disable trigger trg_guard_locked_project_finance_orders;

with recursive order_tree as (
  select
    o.id as order_id,
    o.parent_order_id,
    o.project_id,
    o.company_id,
    o.id as root_candidate_id,
    0 as depth
  from public.orders o
  where o.parent_order_id is null

  union all

  select
    child.id as order_id,
    child.parent_order_id,
    child.project_id,
    child.company_id,
    tree.root_candidate_id,
    tree.depth + 1
  from public.orders child
  join order_tree tree on tree.order_id = child.parent_order_id
),
resolved_roots as (
  select distinct on (order_id)
    order_id,
    root_candidate_id
  from order_tree
  order by order_id, depth desc
)
update public.orders o
set root_order_id = coalesce(r.root_candidate_id, o.id)
from resolved_roots r
where o.id = r.order_id
  and (o.root_order_id is null or o.root_order_id is distinct from coalesce(r.root_candidate_id, o.id));

update public.orders
set root_order_id = id
where root_order_id is null;

alter table public.orders
  enable trigger trg_guard_locked_project_finance_orders;

alter table public.orders
  alter column root_order_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_parent_required_by_kind_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_parent_required_by_kind_check
      check (
        (order_kind = 'primary' and parent_order_id is null)
        or (order_kind in ('change', 'supplement') and parent_order_id is not null)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_root_matches_kind_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_root_matches_kind_check
      check (
        (order_kind = 'primary' and root_order_id = id)
        or (order_kind in ('change', 'supplement') and root_order_id <> id)
      );
  end if;
end
$$;

create index if not exists orders_root_order_idx
  on public.orders(root_order_id, created_at desc);

create or replace function public.guard_order_hierarchy_integrity()
returns trigger
language plpgsql
as $$
declare
  v_parent public.orders;
  v_expected_root_order_id uuid;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.order_kind is null or btrim(new.order_kind) = '' then
    new.order_kind := 'primary';
  end if;

  if new.order_kind = 'primary' then
    if new.parent_order_id is not null then
      raise exception 'Primary order cannot have a parent order';
    end if;

    new.parent_order_id := null;
    new.root_order_id := new.id;
    return new;
  end if;

  if new.parent_order_id is null then
    raise exception 'Secondary order must have a parent order';
  end if;

  if new.parent_order_id = new.id then
    raise exception 'Order cannot be its own parent';
  end if;

  select *
  into v_parent
  from public.orders
  where id = new.parent_order_id;

  if v_parent.id is null then
    raise exception 'Parent order not found';
  end if;

  if v_parent.company_id is distinct from new.company_id then
    raise exception 'Parent order must belong to the same company';
  end if;

  if v_parent.project_id is distinct from new.project_id then
    raise exception 'Parent order must belong to the same project';
  end if;

  if v_parent.order_kind <> 'primary' then
    raise exception 'Parent order must be a primary order';
  end if;

  v_expected_root_order_id := coalesce(v_parent.root_order_id, v_parent.id);

  if v_expected_root_order_id = new.id then
    raise exception 'Secondary order cannot be its own root order';
  end if;

  new.root_order_id := v_expected_root_order_id;
  return new;
end;
$$;

drop trigger if exists trg_guard_order_hierarchy_integrity on public.orders;
create trigger trg_guard_order_hierarchy_integrity
before insert or update on public.orders
for each row
execute function public.guard_order_hierarchy_integrity();

drop view if exists public.project_order_rollups;
drop view if exists public.invoice_order_allocations;
drop view if exists public.order_hierarchy_nodes;

create view public.order_hierarchy_nodes
with (security_invoker = true)
as
select
  o.company_id,
  o.project_id,
  o.id as order_id,
  o.order_no,
  o.order_kind,
  o.parent_order_id,
  o.root_order_id,
  root.order_no as root_order_no,
  case
    when o.id = o.root_order_id then 0
    else 1
  end as hierarchy_depth,
  o.sort_index,
  o.status,
  o.invoice_readiness_status,
  o.total,
  o.created_at,
  (
    select count(*)
    from public.orders child
    where child.parent_order_id = o.id
  )::integer as child_order_count
from public.orders o
left join public.orders root on root.id = o.root_order_id;

create view public.invoice_order_allocations
with (security_invoker = true)
as
select
  s.company_id,
  s.project_id,
  s.invoice_id,
  i.kind as invoice_kind,
  i.status as invoice_status,
  s.order_id,
  o.order_kind,
  o.parent_order_id,
  o.root_order_id,
  s.allocated_total::numeric(12,2) as gross_allocated_total,
  s.allocated_total::numeric(12,2) as signed_allocated_total,
  'invoice_source'::text as allocation_source
from public.invoice_sources s
join public.invoices i on i.id = s.invoice_id
join public.orders o on o.id = s.order_id
where i.status <> 'void'
  and i.kind = 'invoice'

union all

select
  i.company_id,
  o.project_id,
  i.id as invoice_id,
  i.kind as invoice_kind,
  i.status as invoice_status,
  o.id as order_id,
  o.order_kind,
  o.parent_order_id,
  o.root_order_id,
  abs(
    round(
      (
        coalesce((snapshot.item->>'total')::numeric, 0)
        * (1 + coalesce((snapshot.item->>'vat_rate')::numeric, 0) / 100.0)
      )::numeric,
      2
    )
  )::numeric(12,2) as gross_allocated_total,
  (
    abs(
      round(
        (
          coalesce((snapshot.item->>'total')::numeric, 0)
          * (1 + coalesce((snapshot.item->>'vat_rate')::numeric, 0) / 100.0)
        )::numeric,
        2
      )
    ) * -1
  )::numeric(12,2) as signed_allocated_total,
  'credit_note_line'::text as allocation_source
from public.invoices i
cross join lateral jsonb_array_elements(coalesce(i.lines_snapshot, '[]'::jsonb)) as snapshot(item)
join public.orders o
  on coalesce(snapshot.item->>'order_id', '') ~* '^[0-9a-f-]{36}$'
 and o.id = (snapshot.item->>'order_id')::uuid
 and o.company_id = i.company_id
where i.status <> 'void'
  and i.kind = 'credit_note';

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
    coalesce(sum(case when o.order_kind = 'primary' then o.total else 0 end), 0)::numeric(12,2) as primary_total,
    coalesce(sum(case when o.order_kind = 'change' then o.total else 0 end), 0)::numeric(12,2) as change_total,
    coalesce(sum(case when o.order_kind = 'supplement' then o.total else 0 end), 0)::numeric(12,2) as supplement_total,
    coalesce(sum(o.total), 0)::numeric(12,2) as total_order_value
  from public.orders o
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

grant select on public.order_hierarchy_nodes to authenticated;
grant select on public.invoice_order_allocations to authenticated;
grant select on public.project_order_rollups to authenticated;
