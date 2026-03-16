-- Kundreskontra: registrera inbetalningar, öppna fordringar och avstämning mot konto 1510.

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  method text not null default 'bank',
  reference text,
  note text,
  booking_verification_id uuid references public.verifications(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_company_date_idx
  on public.invoice_payments(company_id, payment_date desc);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments(invoice_id, created_at desc);

alter table public.invoice_payments enable row level security;

drop policy if exists invoice_payments_select_finance on public.invoice_payments;
create policy invoice_payments_select_finance on public.invoice_payments
for select
using (public.has_finance_access(company_id));

drop policy if exists invoice_payments_insert_finance on public.invoice_payments;
create policy invoice_payments_insert_finance on public.invoice_payments
for insert
with check (public.has_finance_write_access(company_id));

grant select, insert on public.invoice_payments to authenticated;

create or replace function public.guard_invoice_payments_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Invoice payments are immutable. Use a correcting verification for adjustments.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_payments_immutability on public.invoice_payments;
create trigger trg_guard_invoice_payments_immutability
before update or delete on public.invoice_payments
for each row
execute function public.guard_invoice_payments_immutability();

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
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
  v_invoice public.invoices;
  v_paid_before numeric(12,2) := 0;
  v_paid_after numeric(12,2) := 0;
  v_open_before numeric(12,2) := 0;
  v_open_after numeric(12,2) := 0;
  v_payment_id uuid;
  v_verification_result jsonb;
  v_verification_id uuid;
  v_result_status text;
begin
  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.kind <> 'invoice' then
    raise exception 'Payments can only be registered for regular invoices';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Cannot register payment for void invoice';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, p_payment_date);

  select coalesce(sum(ip.amount), 0)::numeric(12,2)
  into v_paid_before
  from public.invoice_payments ip
  where ip.invoice_id = v_invoice.id;

  v_open_before := round(v_invoice.total - v_paid_before, 2);

  if v_open_before <= 0 then
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no,
      'already_paid', true,
      'paid_total', v_paid_before,
      'open_amount', 0
    );
  end if;

  if round(p_amount, 2) > v_open_before then
    raise exception 'Payment amount exceeds open receivable';
  end if;

  insert into public.invoice_payments (
    company_id,
    invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    created_by
  )
  values (
    v_invoice.company_id,
    v_invoice.id,
    round(p_amount, 2),
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
      'description', format('Inbetalning %s', v_invoice.invoice_no),
      'total', round(p_amount, 2),
      'source', 'desktop',
      'client_request_id', format('invoice-payment:%s', v_payment_id),
      'lines', jsonb_build_array(
        jsonb_build_object('account_no', '1930', 'debit', round(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_no', '1510', 'debit', 0, 'credit', round(p_amount, 2))
      )
    )
  );

  v_verification_id := (v_verification_result->>'verification_id')::uuid;

  update public.invoice_payments
  set booking_verification_id = v_verification_id
  where id = v_payment_id;

  select coalesce(sum(ip.amount), 0)::numeric(12,2)
  into v_paid_after
  from public.invoice_payments ip
  where ip.invoice_id = v_invoice.id;

  v_open_after := round(v_invoice.total - v_paid_after, 2);

  v_result_status := case when v_open_after <= 0 then 'paid' else v_invoice.status end;

  update public.invoices
  set status = v_result_status
  where id = v_invoice.id;

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_payment_registered',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'payment_id', v_payment_id,
      'payment_amount', round(p_amount, 2),
      'payment_date', p_payment_date,
      'verification_id', v_verification_id
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'payment_id', v_payment_id,
    'payment_amount', round(p_amount, 2),
    'payment_date', p_payment_date,
    'booking_verification_id', v_verification_id,
    'paid_total', v_paid_after,
    'open_amount', greatest(v_open_after, 0),
    'status', v_result_status,
    'already_paid', false
  );
end;
$$;

create or replace function public.receivables_open_report(
  p_company_id uuid,
  p_as_of date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with paid as (
    select
      ip.invoice_id,
      round(coalesce(sum(ip.amount), 0), 2) as paid_total
    from public.invoice_payments ip
    where ip.company_id = p_company_id
      and ip.payment_date <= p_as_of
    group by ip.invoice_id
  ),
  rows as (
    select
      i.id as invoice_id,
      i.invoice_no,
      i.issue_date,
      i.due_date,
      i.status,
      coalesce(i.customer_snapshot->>'name', '') as customer_name,
      round(i.total, 2) as invoice_total,
      coalesce(p.paid_total, 0)::numeric(12,2) as paid_total,
      round(i.total - coalesce(p.paid_total, 0), 2) as open_amount
    from public.invoices i
    left join paid p on p.invoice_id = i.id
    where i.company_id = p_company_id
      and i.kind = 'invoice'
      and i.status <> 'void'
  ),
  open_rows as (
    select
      r.*,
      greatest((p_as_of - r.due_date), 0)::integer as days_overdue
    from rows r
    where r.open_amount > 0
  )
  select jsonb_build_object(
    'company_id', p_company_id,
    'as_of', p_as_of,
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(o) order by o.due_date asc, o.invoice_no asc)
        from open_rows o
      ),
      '[]'::jsonb
    ),
    'summary', jsonb_build_object(
      'open_total', coalesce((select round(sum(open_amount), 2) from open_rows), 0),
      'overdue_total', coalesce((select round(sum(open_amount), 2) from open_rows where days_overdue > 0), 0),
      'invoice_count', coalesce((select count(*) from open_rows), 0)
    )
  );
$$;

create or replace function public.receivables_reconciliation_report(
  p_company_id uuid,
  p_as_of date default current_date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with receivables as (
    select
      round(
        coalesce(
          (
            (
              select sum(i.total)
              from public.invoices i
              where i.company_id = p_company_id
                and i.kind = 'invoice'
                and i.status <> 'void'
                and i.issue_date <= p_as_of
            ) -
            (
              select sum(ip.amount)
              from public.invoice_payments ip
              where ip.company_id = p_company_id
                and ip.payment_date <= p_as_of
            )
          ),
          0
        ),
        2
      ) as receivables_open_total
  ),
  ledger as (
    select round(coalesce(sum(le.amount), 0), 2) as ledger_1510_balance
    from public.ledger_entries le
    where le.company_id = p_company_id
      and le.account_no = '1510'
      and le.entry_date <= p_as_of
  )
  select jsonb_build_object(
    'company_id', p_company_id,
    'as_of', p_as_of,
    'receivables_open_total', r.receivables_open_total,
    'ledger_1510_balance', l.ledger_1510_balance,
    'difference', round(r.receivables_open_total - l.ledger_1510_balance, 2),
    'ok', abs(round(r.receivables_open_total - l.ledger_1510_balance, 2)) < 0.01
  )
  from receivables r
  cross join ledger l;
$$;

grant execute on function public.register_invoice_payment(uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.receivables_open_report(uuid, date) to authenticated;
grant execute on function public.receivables_reconciliation_report(uuid, date) to authenticated;
