-- Invoice model + secure invoice numbering + robust invoice creation RPC.

create table if not exists public.invoice_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  invoice_no text not null,
  status text not null default 'issued' check (status in ('issued', 'sent', 'paid', 'void')),
  currency text not null default 'SEK',
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  vat_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  company_snapshot jsonb not null default '{}'::jsonb,
  customer_snapshot jsonb not null default '{}'::jsonb,
  lines_snapshot jsonb not null default '[]'::jsonb,
  rpc_result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, invoice_no)
);

create index if not exists invoices_company_created_idx
  on public.invoices(company_id, created_at desc);

create index if not exists invoices_company_project_created_idx
  on public.invoices(company_id, project_id, created_at desc);

create index if not exists invoices_company_status_created_idx
  on public.invoices(company_id, status, created_at desc);

alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;

drop policy if exists invoice_counters_select_finance on public.invoice_counters;
create policy invoice_counters_select_finance on public.invoice_counters
for select
using (public.has_finance_access(company_id));

drop policy if exists invoice_counters_mutate_admin on public.invoice_counters;
create policy invoice_counters_mutate_admin on public.invoice_counters
for all
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists invoices_select_finance on public.invoices;
create policy invoices_select_finance on public.invoices
for select
using (public.has_finance_access(company_id));

drop policy if exists invoices_insert_finance on public.invoices;
create policy invoices_insert_finance on public.invoices
for insert
with check (public.has_finance_access(company_id));

drop policy if exists invoices_update_finance on public.invoices;
create policy invoices_update_finance on public.invoices
for update
using (public.has_finance_access(company_id))
with check (public.has_finance_access(company_id));

drop policy if exists invoices_delete_admin on public.invoices;
create policy invoices_delete_admin on public.invoices
for delete
using (public.app_user_role(company_id) = 'admin');

create or replace function public.next_invoice_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next integer;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.invoice_counters(company_id, last_number)
  values (p_company_id, 0)
  on conflict (company_id) do nothing;

  update public.invoice_counters
  set last_number = last_number + 1,
      updated_at = now()
  where company_id = p_company_id
  returning last_number into v_next;

  select nullif(trim(c.invoice_prefix), '') into v_prefix
  from public.companies c
  where c.id = p_company_id;

  v_prefix := coalesce(v_prefix, 'INV');

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.create_invoice_from_order(order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_project public.projects;
  v_customer public.customers;
  v_invoice_no text;
  v_issue_date date := current_date;
  v_due_date date := current_date + 30;
  v_subtotal numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_invoice_id uuid;
  v_existing public.invoices;
  v_company_snapshot jsonb;
  v_customer_snapshot jsonb;
  v_lines_snapshot jsonb;
  v_result jsonb;
begin
  select * into v_order
  from public.orders
  where id = order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if not public.has_finance_access(v_order.company_id) then
    raise exception 'Not allowed';
  end if;

  select * into v_existing
  from public.invoices i
  where i.order_id = order_id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'invoice_no', v_existing.invoice_no,
      'status', v_existing.status,
      'total', v_existing.total,
      'already_exists', true
    );
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

  select
    coalesce(sum(ol.total), 0)::numeric(12,2),
    coalesce(sum((ol.total * ol.vat_rate / 100.0)), 0)::numeric(12,2)
  into v_subtotal, v_vat_total
  from public.order_lines ol
  where ol.order_id = v_order.id
    and ol.company_id = v_order.company_id;

  v_total := round((v_subtotal + v_vat_total)::numeric, 2);

  if v_total <= 0 then
    raise exception 'Order total must be greater than 0';
  end if;

  select jsonb_build_object(
    'company_id', c.id,
    'name', c.name,
    'org_no', c.org_no,
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
    'invoice_prefix', c.invoice_prefix
  ) into v_company_snapshot
  from public.companies c
  where c.id = v_order.company_id;

  v_customer_snapshot := coalesce(
    jsonb_build_object(
      'customer_id', v_customer.id,
      'name', v_customer.name
    ),
    '{}'::jsonb
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ol.id,
        'title', ol.title,
        'qty', ol.qty,
        'unit_price', ol.unit_price,
        'vat_rate', ol.vat_rate,
        'total', ol.total
      )
      order by ol.created_at asc
    ),
    '[]'::jsonb
  ) into v_lines_snapshot
  from public.order_lines ol
  where ol.order_id = v_order.id
    and ol.company_id = v_order.company_id;

  v_invoice_no := public.next_invoice_number(v_order.company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'order_id', v_order.id,
    'project_id', v_order.project_id,
    'issue_date', v_issue_date,
    'due_date', v_due_date,
    'subtotal', v_subtotal,
    'vat_total', v_vat_total,
    'total', v_total
  );

  insert into public.invoices (
    company_id,
    project_id,
    order_id,
    invoice_no,
    status,
    currency,
    issue_date,
    due_date,
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
    v_order.id,
    v_invoice_no,
    'issued',
    'SEK',
    v_issue_date,
    v_due_date,
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

  update public.orders
  set status = 'invoiced',
      total = v_total
  where id = v_order.id;

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

  return v_result || jsonb_build_object('invoice_id', v_invoice_id, 'already_exists', false);
end;
$$;

grant select on public.invoice_counters to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant execute on function public.next_invoice_number(uuid) to authenticated;
grant execute on function public.create_invoice_from_order(uuid) to authenticated;