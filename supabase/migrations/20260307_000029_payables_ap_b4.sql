-- B4: Leverantorsreskontra (AP) - leverantorsfakturor, betalningar, rapport.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  org_no text,
  vat_no text,
  billing_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists suppliers_company_archived_idx
  on public.suppliers(company_id, archived_at, name);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_invoice_no text not null,
  status text not null default 'issued' check (status in ('issued', 'paid', 'void')),
  currency text not null default 'SEK',
  issue_date date not null,
  due_date date not null,
  description text,
  subtotal numeric(12,2) not null default 0,
  vat_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  open_amount numeric(12,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, supplier_id, supplier_invoice_no)
);

create index if not exists supplier_invoices_company_due_idx
  on public.supplier_invoices(company_id, due_date, created_at desc);

create index if not exists supplier_invoices_company_status_idx
  on public.supplier_invoices(company_id, status, due_date);

create table if not exists public.supplier_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null,
  method text,
  reference text,
  note text,
  booking_verification_id uuid references public.verifications(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists supplier_invoice_payments_company_date_idx
  on public.supplier_invoice_payments(company_id, payment_date desc);

create index if not exists supplier_invoice_payments_invoice_idx
  on public.supplier_invoice_payments(supplier_invoice_id, created_at desc);

alter table public.suppliers enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_payments enable row level security;

drop policy if exists suppliers_select_finance on public.suppliers;
create policy suppliers_select_finance on public.suppliers
for select using (public.has_finance_access(company_id));

drop policy if exists suppliers_insert_finance on public.suppliers;
create policy suppliers_insert_finance on public.suppliers
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists suppliers_update_finance on public.suppliers;
create policy suppliers_update_finance on public.suppliers
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists supplier_invoices_select_finance on public.supplier_invoices;
create policy supplier_invoices_select_finance on public.supplier_invoices
for select using (public.has_finance_access(company_id));

drop policy if exists supplier_invoices_insert_finance on public.supplier_invoices;
create policy supplier_invoices_insert_finance on public.supplier_invoices
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists supplier_invoices_update_finance on public.supplier_invoices;
create policy supplier_invoices_update_finance on public.supplier_invoices
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists supplier_invoice_payments_select_finance on public.supplier_invoice_payments;
create policy supplier_invoice_payments_select_finance on public.supplier_invoice_payments
for select using (public.has_finance_access(company_id));

drop policy if exists supplier_invoice_payments_insert_finance on public.supplier_invoice_payments;
create policy supplier_invoice_payments_insert_finance on public.supplier_invoice_payments
for insert with check (public.has_finance_write_access(company_id));

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.supplier_invoices to authenticated;
grant select, insert on public.supplier_invoice_payments to authenticated;

-- Konton som AP-flodet använder: 2440 leverantörsskulder, 1930 bank.
insert into public.chart_of_accounts (company_id, account_no, name, account_type, active)
select c.id, x.account_no, x.name, x.account_type, true
from public.companies c
cross join (
  values
    ('2440', 'Leverantörsskulder', 'liability'),
    ('1930', 'Företagskonto', 'asset')
) as x(account_no, name, account_type)
on conflict (company_id, account_no)
do update set
  active = true,
  name = excluded.name,
  account_type = excluded.account_type;

create or replace function public.create_supplier_invoice(
  p_company_id uuid,
  p_supplier_id uuid,
  p_supplier_invoice_no text,
  p_issue_date date,
  p_due_date date,
  p_subtotal numeric,
  p_vat_total numeric,
  p_currency text default 'SEK',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_total numeric(12,2);
  v_invoice_no text;
begin
  if p_company_id is null or p_supplier_id is null then
    raise exception 'company_id and supplier_id are required';
  end if;

  if not public.has_finance_write_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  if p_issue_date is null or p_due_date is null then
    raise exception 'issue_date and due_date are required';
  end if;

  if p_due_date < p_issue_date then
    raise exception 'due_date cannot be before issue_date';
  end if;

  if coalesce(p_subtotal, 0) < 0 or coalesce(p_vat_total, 0) < 0 then
    raise exception 'subtotal/vat_total cannot be negative';
  end if;

  v_total := round(coalesce(p_subtotal, 0) + coalesce(p_vat_total, 0), 2);
  if v_total <= 0 then
    raise exception 'total must be greater than 0';
  end if;

  v_invoice_no := nullif(trim(coalesce(p_supplier_invoice_no, '')), '');
  if v_invoice_no is null then
    raise exception 'supplier_invoice_no is required';
  end if;

  insert into public.supplier_invoices (
    company_id,
    supplier_id,
    supplier_invoice_no,
    status,
    currency,
    issue_date,
    due_date,
    description,
    subtotal,
    vat_total,
    total,
    paid_total,
    open_amount,
    created_by
  ) values (
    p_company_id,
    p_supplier_id,
    v_invoice_no,
    'issued',
    upper(coalesce(nullif(trim(p_currency), ''), 'SEK')),
    p_issue_date,
    p_due_date,
    nullif(trim(coalesce(p_description, '')), ''),
    round(coalesce(p_subtotal, 0), 2),
    round(coalesce(p_vat_total, 0), 2),
    v_total,
    0,
    v_total,
    auth.uid()
  )
  returning id into v_invoice_id;

  perform public.log_finance_action(
    p_company_id,
    'supplier_invoice_created',
    'supplier_invoice',
    v_invoice_id,
    jsonb_build_object('supplier_invoice_no', v_invoice_no, 'total', v_total)
  );

  return jsonb_build_object('supplier_invoice_id', v_invoice_id, 'supplier_invoice_no', v_invoice_no, 'total', v_total);
end;
$$;

create or replace function public.register_supplier_invoice_payment(
  p_supplier_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text default null,
  p_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices;
  v_payment_id uuid;
  v_amount numeric(12,2);
  v_verification_result jsonb;
  v_verification_id uuid;
begin
  if p_supplier_invoice_id is null then
    raise exception 'supplier_invoice_id is required';
  end if;

  if p_payment_date is null then
    raise exception 'payment_date is required';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  select * into v_invoice
  from public.supplier_invoices
  where id = p_supplier_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Supplier invoice not found';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Cannot pay a void supplier invoice';
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, p_payment_date);

  if v_invoice.open_amount <= 0 then
    raise exception 'Supplier invoice already fully paid';
  end if;

  if v_amount > v_invoice.open_amount then
    raise exception 'Payment exceeds open amount';
  end if;

  -- Sakerstall att konton finns och ar aktiva.
  insert into public.chart_of_accounts (company_id, account_no, name, account_type, active)
  values
    (v_invoice.company_id, '2440', 'Leverantörsskulder', 'liability', true),
    (v_invoice.company_id, '1930', 'Företagskonto', 'asset', true)
  on conflict (company_id, account_no)
  do update set
    active = true,
    name = excluded.name,
    account_type = excluded.account_type;

  insert into public.supplier_invoice_payments (
    company_id,
    supplier_invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    created_by
  ) values (
    v_invoice.company_id,
    v_invoice.id,
    v_amount,
    p_payment_date,
    coalesce(nullif(trim(p_method), ''), 'bank'),
    nullif(trim(p_reference), ''),
    nullif(trim(p_note), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  v_verification_result := public.create_verification_from_wizard(
    jsonb_build_object(
      'company_id', v_invoice.company_id,
      'date', p_payment_date,
      'description', format('Utbetalning leverantörsfaktura %s', v_invoice.supplier_invoice_no),
      'total', v_amount,
      'source', 'desktop',
      'client_request_id', format('supplier-invoice-payment:%s', v_payment_id),
      'lines', jsonb_build_array(
        jsonb_build_object('account_no', '2440', 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_no', '1930', 'debit', 0, 'credit', v_amount)
      )
    )
  );

  v_verification_id := nullif(v_verification_result->>'verification_id', '')::uuid;

  update public.supplier_invoice_payments
  set booking_verification_id = v_verification_id
  where id = v_payment_id;

  update public.supplier_invoices
  set paid_total = round(paid_total + v_amount, 2),
      open_amount = round(greatest(open_amount - v_amount, 0), 2),
      status = case when round(greatest(open_amount - v_amount, 0), 2) <= 0 then 'paid' else 'issued' end
  where id = v_invoice.id;

  perform public.log_finance_action(
    v_invoice.company_id,
    'supplier_invoice_payment_registered',
    'supplier_invoice',
    v_invoice.id,
    jsonb_build_object(
      'supplier_invoice_no', v_invoice.supplier_invoice_no,
      'payment_id', v_payment_id,
      'amount', v_amount,
      'verification_id', v_verification_id
    )
  );

  return jsonb_build_object(
    'supplier_invoice_id', v_invoice.id,
    'payment_id', v_payment_id,
    'booking_verification_id', v_verification_id,
    'amount', v_amount
  );
end;
$$;

create or replace function public.payables_open_report(
  p_company_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_summary jsonb;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.due_date asc, x.created_at asc), '[]'::jsonb)
  into v_rows
  from (
    select
      si.id as supplier_invoice_id,
      si.supplier_invoice_no,
      s.name as supplier_name,
      si.status,
      si.issue_date,
      si.due_date,
      si.total,
      si.paid_total,
      si.open_amount,
      greatest((p_as_of - si.due_date), 0) as days_overdue,
      si.currency,
      si.created_at
    from public.supplier_invoices si
    join public.suppliers s
      on s.id = si.supplier_id
     and s.company_id = si.company_id
    where si.company_id = p_company_id
      and si.status in ('issued', 'paid')
      and si.issue_date <= p_as_of
      and si.open_amount > 0
  ) x;

  select jsonb_build_object(
    'invoice_count', count(*),
    'open_total', round(coalesce(sum(si.open_amount), 0), 2),
    'overdue_total', round(coalesce(sum(case when si.due_date < p_as_of then si.open_amount else 0 end), 0), 2)
  )
  into v_summary
  from public.supplier_invoices si
  where si.company_id = p_company_id
    and si.status in ('issued', 'paid')
    and si.issue_date <= p_as_of
    and si.open_amount > 0;

  return jsonb_build_object(
    'as_of', p_as_of,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.create_supplier_invoice(uuid, uuid, text, date, date, numeric, numeric, text, text) to authenticated;
grant execute on function public.register_supplier_invoice_payment(uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.payables_open_report(uuid, date) to authenticated;
