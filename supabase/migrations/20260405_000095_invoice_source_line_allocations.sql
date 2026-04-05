create table if not exists public.invoice_source_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  invoice_source_id uuid not null references public.invoice_sources(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_line_id uuid not null references public.order_lines(id) on delete restrict,
  allocated_total numeric(12,2) not null default 0 check (allocated_total >= 0),
  created_at timestamptz not null default now(),
  unique (invoice_source_id, order_line_id)
);

create index if not exists invoice_source_lines_company_order_line_idx
  on public.invoice_source_lines(company_id, order_line_id);

create index if not exists invoice_source_lines_company_order_idx
  on public.invoice_source_lines(company_id, order_id);

create index if not exists invoice_source_lines_source_idx
  on public.invoice_source_lines(invoice_source_id);

alter table public.invoice_source_lines enable row level security;

drop policy if exists invoice_source_lines_select_finance on public.invoice_source_lines;
create policy invoice_source_lines_select_finance on public.invoice_source_lines
for select
using (public.has_finance_access(company_id));

drop policy if exists invoice_source_lines_insert_finance on public.invoice_source_lines;
create policy invoice_source_lines_insert_finance on public.invoice_source_lines
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists invoice_source_lines_update_finance on public.invoice_source_lines;
create policy invoice_source_lines_update_finance on public.invoice_source_lines
for update
using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists invoice_source_lines_delete_admin on public.invoice_source_lines;
create policy invoice_source_lines_delete_admin on public.invoice_source_lines
for delete
using (public.app_user_role(company_id) = 'admin');

grant select, insert, update, delete on public.invoice_source_lines to authenticated;

create or replace function public.sync_invoice_source_line_allocations(p_invoice_source_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.invoice_sources;
  v_invoice public.invoices;
  v_match_count integer := 0;
  v_match_total numeric(12,2) := 0;
begin
  select *
  into v_source
  from public.invoice_sources
  where id = p_invoice_source_id;

  if v_source.id is null then
    return;
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = v_source.invoice_id;

  if v_invoice.id is null then
    return;
  end if;

  create temporary table if not exists tmp_invoice_source_line_allocations (
    seq integer not null,
    order_line_id uuid not null,
    allocated_total numeric(12,2) not null
  ) on commit drop;

  truncate table tmp_invoice_source_line_allocations;

  insert into tmp_invoice_source_line_allocations (seq, order_line_id, allocated_total)
  select
    row_number() over (order by ol.created_at asc, ol.id asc) as seq,
    ol.id as order_line_id,
    round(
      (
        coalesce((snapshot.item->>'total')::numeric, 0)
        * (1 + coalesce((snapshot.item->>'vat_rate')::numeric, 0) / 100.0)
      )::numeric,
      2
    ) as allocated_total
  from jsonb_array_elements(coalesce(v_invoice.lines_snapshot, '[]'::jsonb)) with ordinality as snapshot(item, ord)
  join public.order_lines ol
    on (snapshot.item->>'id') ~* '^[0-9a-f-]{36}$'
   and ol.id = (snapshot.item->>'id')::uuid
   and ol.order_id = v_source.order_id
   and ol.company_id = v_source.company_id
  where coalesce(snapshot.item->>'order_id', '') = v_source.order_id::text;

  select count(*), coalesce(sum(allocated_total), 0)::numeric(12,2)
  into v_match_count, v_match_total
  from tmp_invoice_source_line_allocations;

  if v_match_count > 0 then
    update tmp_invoice_source_line_allocations t
    set allocated_total = round(
      (
        v_source.allocated_total
        - coalesce(
            (
              select sum(t2.allocated_total)
              from tmp_invoice_source_line_allocations t2
              where t2.seq < t.seq
            ),
            0
          )
      )::numeric,
      2
    )
    where t.seq = (select max(seq) from tmp_invoice_source_line_allocations)
      and round(v_match_total, 2) <> round(v_source.allocated_total, 2);
  else
    with base_lines as (
      select
        row_number() over (order by ol.created_at asc, ol.id asc) as seq,
        ol.id as order_line_id,
        round((coalesce(ol.total, 0) * (1 + coalesce(ol.vat_rate, 0) / 100.0))::numeric, 2) as gross_total,
        count(*) over () as line_count,
        sum(round((coalesce(ol.total, 0) * (1 + coalesce(ol.vat_rate, 0) / 100.0))::numeric, 2)) over () as gross_sum
      from public.order_lines ol
      where ol.company_id = v_source.company_id
        and ol.order_id = v_source.order_id
    ),
    rounded_allocations as (
      select
        bl.seq,
        bl.order_line_id,
        bl.line_count,
        case
          when bl.gross_sum <= 0 then 0::numeric(12,2)
          else round(((v_source.allocated_total * bl.gross_total) / bl.gross_sum)::numeric, 2)
        end as rounded_allocation
      from base_lines bl
    ),
    final_allocations as (
      select
        ra.seq,
        ra.order_line_id,
        case
          when ra.seq < ra.line_count then ra.rounded_allocation
          else round(
            (
              v_source.allocated_total
              - coalesce(
                  sum(ra.rounded_allocation) over (
                    order by ra.seq
                    rows between unbounded preceding and 1 preceding
                  ),
                  0
                )
            )::numeric,
            2
          )
        end as allocated_total
      from rounded_allocations ra
    )
    insert into tmp_invoice_source_line_allocations (seq, order_line_id, allocated_total)
    select
      fa.seq,
      fa.order_line_id,
      fa.allocated_total
    from final_allocations fa;
  end if;

  delete from public.invoice_source_lines
  where invoice_source_id = v_source.id;

  insert into public.invoice_source_lines (
    company_id,
    invoice_id,
    invoice_source_id,
    order_id,
    order_line_id,
    allocated_total
  )
  select
    v_source.company_id,
    v_source.invoice_id,
    v_source.id,
    v_source.order_id,
    t.order_line_id,
    greatest(round(t.allocated_total::numeric, 2), 0)
  from tmp_invoice_source_line_allocations t
  where greatest(round(t.allocated_total::numeric, 2), 0) > 0;
end;
$$;

create or replace function public.trg_sync_invoice_source_line_allocations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_invoice_source_line_allocations(new.id);
  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_source_line_allocations on public.invoice_sources;
create trigger trg_sync_invoice_source_line_allocations
after insert or update of allocated_total on public.invoice_sources
for each row
execute function public.trg_sync_invoice_source_line_allocations();

do $$
declare
  v_source_id uuid;
begin
  for v_source_id in
    select id
    from public.invoice_sources
  loop
    perform public.sync_invoice_source_line_allocations(v_source_id);
  end loop;
end;
$$;

create or replace function public.create_partial_invoice_from_order_lines(
  p_order_id uuid,
  p_order_line_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_line_ids uuid[];
  v_requested_count integer;
  v_found_count integer;
  v_order public.orders;
  v_project public.projects;
  v_customer public.customers;
  v_invoice_no text;
  v_issue_date date := current_date;
  v_due_date date;
  v_supply_date date := current_date;
  v_terms_days integer := 30;
  v_terms_text text := '30 dagar netto';
  v_seller_vat_no text;
  v_company_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_lines_snapshot jsonb;
  v_result jsonb;
  v_invoice_id uuid;
  v_invoice_source_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_order_remaining_total numeric(12,2) := 0;
begin
  select coalesce(array_agg(distinct line_id), '{}'::uuid[])
  into v_requested_line_ids
  from unnest(coalesce(p_order_line_ids, '{}'::uuid[])) as line_id;

  v_requested_count := coalesce(array_length(v_requested_line_ids, 1), 0);

  if v_requested_count = 0 then
    raise exception 'At least one order line is required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if not public.has_finance_write_access(v_order.company_id) then
    raise exception 'Not allowed';
  end if;

  perform public.assert_finance_period_open(v_order.company_id, v_issue_date);

  select count(*)
  into v_found_count
  from public.order_lines ol
  where ol.company_id = v_order.company_id
    and ol.order_id = v_order.id
    and ol.id = any(v_requested_line_ids);

  if v_found_count <> v_requested_count then
    raise exception 'One or more selected order lines were not found';
  end if;

  select * into v_project
  from public.projects p
  where p.id = v_order.project_id;

  if v_project.id is null then
    raise exception 'Project not found for order';
  end if;

  if v_project.customer_id is not null then
    select * into v_customer
    from public.customers c
    where c.id = v_project.customer_id
      and c.company_id = v_order.company_id;
  end if;

  if v_customer.id is null then
    raise exception 'Customer is required before invoice can be created';
  end if;

  if coalesce(nullif(trim(v_customer.name), ''), '') = '' then
    raise exception 'Customer name is required';
  end if;

  create temporary table if not exists tmp_partial_selected_lines (
    seq integer not null,
    order_line_id uuid not null,
    title text not null,
    vat_rate numeric(12,2) not null,
    remaining_gross numeric(12,2) not null,
    remaining_net numeric(12,2) not null
  ) on commit drop;

  truncate table tmp_partial_selected_lines;

  insert into tmp_partial_selected_lines (
    seq,
    order_line_id,
    title,
    vat_rate,
    remaining_gross,
    remaining_net
  )
  select
    row_number() over (order by ol.created_at asc, ol.id asc) as seq,
    ol.id,
    coalesce(nullif(trim(ol.title), ''), 'Rad') as title,
    coalesce(ol.vat_rate, 0)::numeric(12,2) as vat_rate,
    round(
      greatest(
        round((coalesce(ol.total, 0) * (1 + coalesce(ol.vat_rate, 0) / 100.0))::numeric, 2)
        - coalesce((
            select sum(isl.allocated_total)
            from public.invoice_source_lines isl
            join public.invoices i on i.id = isl.invoice_id
            where isl.order_line_id = ol.id
              and i.kind = 'invoice'
              and i.status <> 'void'
          ), 0),
        0
      )::numeric,
      2
    ) as remaining_gross,
    0::numeric(12,2) as remaining_net
  from public.order_lines ol
  where ol.company_id = v_order.company_id
    and ol.order_id = v_order.id
    and ol.id = any(v_requested_line_ids);

  if exists (
    select 1
    from tmp_partial_selected_lines
    where remaining_gross <= 0
  ) then
    raise exception 'One or more selected order lines are already fully invoiced';
  end if;

  update tmp_partial_selected_lines
  set remaining_net = round(
    (
      remaining_gross / (1 + coalesce(vat_rate, 0) / 100.0)
    )::numeric,
    2
  );

  select
    coalesce(sum(remaining_net), 0)::numeric(12,2),
    coalesce(sum(remaining_gross - remaining_net), 0)::numeric(12,2),
    coalesce(sum(remaining_gross), 0)::numeric(12,2)
  into v_subtotal, v_vat_total, v_total
  from tmp_partial_selected_lines;

  if v_total <= 0 then
    raise exception 'Selected order lines must contain invoiceable value';
  end if;

  select
    coalesce(c.default_payment_terms_days, 30),
    nullif(trim(c.vat_no), ''),
    jsonb_build_object(
      'company_id', c.id,
      'name', c.name,
      'org_no', c.org_no,
      'vat_no', c.vat_no,
      'billing_email', c.billing_email,
      'phone', c.phone,
      'address_line1', c.address_line1,
      'address_line2', c.address_line2,
      'postal_code', c.postal_code,
      'city', c.city,
      'country', c.country,
      'bankgiro', c.bankgiro,
      'plusgiro', c.plusgiro,
      'iban', c.iban,
      'bic', c.bic,
      'invoice_prefix', c.invoice_prefix,
      'default_payment_terms_days', c.default_payment_terms_days,
      'late_payment_interest_rate', c.late_payment_interest_rate,
      'invoice_terms_note', c.invoice_terms_note
    )
  into v_terms_days, v_seller_vat_no, v_company_snapshot
  from public.companies c
  where c.id = v_order.company_id;

  v_terms_days := greatest(coalesce(v_terms_days, 30), 0);
  v_due_date := v_issue_date + v_terms_days;
  v_terms_text := format('%s dagar netto', v_terms_days);

  if coalesce(nullif(trim(v_company_snapshot->>'name'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'org_no'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'address_line1'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'postal_code'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'city'), ''), '') = '' then
    raise exception 'Company invoice profile is incomplete. Fill in name/org no/address/postal code/city first.';
  end if;

  if v_vat_total > 0 and v_seller_vat_no is null then
    raise exception 'Company VAT number is required when invoice contains VAT.';
  end if;

  v_customer_snapshot := jsonb_build_object(
    'customer_id', v_customer.id,
    'name', v_customer.name,
    'org_no', v_customer.org_no,
    'vat_no', v_customer.vat_no,
    'billing_email', v_customer.billing_email,
    'phone', v_customer.phone,
    'address_line1', v_customer.address_line1,
    'address_line2', v_customer.address_line2,
    'postal_code', v_customer.postal_code,
    'city', v_customer.city,
    'country', v_customer.country
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', order_line_id,
        'order_id', v_order.id,
        'project_id', v_order.project_id,
        'title', title,
        'qty', 1,
        'unit_price', remaining_net,
        'vat_rate', vat_rate,
        'total', remaining_net
      )
      order by seq asc
    ),
    '[]'::jsonb
  ) into v_lines_snapshot
  from tmp_partial_selected_lines;

  v_invoice_no := public.next_invoice_number(v_order.company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'kind', 'invoice',
    'partial', true,
    'selection_mode', 'lines',
    'order_id', null,
    'project_id', v_order.project_id,
    'source_order_ids', jsonb_build_array(v_order.id),
    'source_count', 1,
    'line_count', v_requested_count,
    'issue_date', v_issue_date,
    'supply_date', v_supply_date,
    'due_date', v_due_date,
    'payment_terms_text', v_terms_text,
    'seller_vat_no', v_seller_vat_no,
    'buyer_reference', null,
    'subtotal', v_subtotal,
    'vat_total', v_vat_total,
    'total', v_total
  );

  insert into public.invoices (
    company_id,
    project_id,
    order_id,
    invoice_no,
    kind,
    status,
    currency,
    issue_date,
    supply_date,
    due_date,
    payment_terms_text,
    seller_vat_no,
    buyer_reference,
    subtotal,
    vat_total,
    total,
    company_snapshot,
    customer_snapshot,
    lines_snapshot,
    rpc_result,
    created_by
  )
  values (
    v_order.company_id,
    v_order.project_id,
    null,
    v_invoice_no,
    'invoice',
    'issued',
    'SEK',
    v_issue_date,
    v_supply_date,
    v_due_date,
    v_terms_text,
    v_seller_vat_no,
    null,
    v_subtotal,
    v_vat_total,
    v_total,
    coalesce(v_company_snapshot, '{}'::jsonb),
    coalesce(v_customer_snapshot, '{}'::jsonb),
    coalesce(v_lines_snapshot, '[]'::jsonb),
    v_result,
    auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.invoice_sources (
    company_id,
    invoice_id,
    project_id,
    order_id,
    source_kind,
    position,
    allocated_total
  )
  values (
    v_order.company_id,
    v_invoice_id,
    v_order.project_id,
    v_order.id,
    'order',
    1,
    v_total
  )
  returning id into v_invoice_source_id;

  perform public.sync_invoice_source_line_allocations(v_invoice_source_id);

  select coalesce(sum(
    round((coalesce(ol.total, 0) * (1 + coalesce(ol.vat_rate, 0) / 100.0))::numeric, 2)
    - coalesce((
        select sum(isl.allocated_total)
        from public.invoice_source_lines isl
        join public.invoices i on i.id = isl.invoice_id
        where isl.order_line_id = ol.id
          and i.kind = 'invoice'
          and i.status <> 'void'
      ), 0)
  ), 0)::numeric(12,2)
  into v_order_remaining_total
  from public.order_lines ol
  where ol.company_id = v_order.company_id
    and ol.order_id = v_order.id;

  if round(greatest(v_order_remaining_total, 0)::numeric, 2) <= 0 then
    update public.orders
    set status = 'invoiced'
    where id = v_order.id;
  end if;

  update public.invoice_history
  set rpc_result = jsonb_build_object(
      'invoice_rpc_result', v_result,
      'company_snapshot', coalesce(v_company_snapshot, '{}'::jsonb)
    )
  where id = (
    select ih.id
    from public.invoice_history ih
    where ih.order_id = v_order.id
    order by ih.created_at desc
    limit 1
  );

  return v_result || jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_exists', false
  );
end;
$$;

grant execute on function public.create_partial_invoice_from_order_lines(uuid, uuid[]) to authenticated;
