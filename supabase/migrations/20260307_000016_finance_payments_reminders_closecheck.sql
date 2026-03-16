-- Finance step-up: payment correction/refund, reminder stages, attachments, and period close checklist.

insert into public.chart_of_accounts (company_id, account_no, name, account_type)
select c.id, '2420', 'Förskott från kunder', 'liability'
from public.companies c
on conflict (company_id, account_no) do nothing;

alter table public.invoices
  add column if not exists attachment_path text,
  add column if not exists collection_stage text not null default 'none',
  add column if not exists reminder_1_sent_at timestamptz,
  add column if not exists reminder_2_sent_at timestamptz,
  add column if not exists inkasso_sent_at timestamptz,
  add column if not exists collection_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_collection_stage_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_collection_stage_check
      check (collection_stage in ('none', 'reminder_1', 'reminder_2', 'inkasso', 'dispute', 'closed'));
  end if;
end $$;

alter table public.invoice_payments
  add column if not exists direction text not null default 'incoming',
  add column if not exists attachment_path text,
  add column if not exists reversed_from_payment_id uuid references public.invoice_payments(id) on delete set null,
  add column if not exists overpayment_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoice_payments_direction_check'
      and conrelid = 'public.invoice_payments'::regclass
  ) then
    alter table public.invoice_payments
      add constraint invoice_payments_direction_check
      check (direction in ('incoming', 'refund'));
  end if;
end $$;

create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  stage text not null,
  sent_at timestamptz not null default now(),
  fee numeric(12,2) not null default 0,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_reminders_company_sent_idx
  on public.invoice_reminders(company_id, sent_at desc);

alter table public.invoice_reminders enable row level security;

drop policy if exists invoice_reminders_select_finance on public.invoice_reminders;
create policy invoice_reminders_select_finance on public.invoice_reminders
for select
using (public.has_finance_access(company_id));

drop policy if exists invoice_reminders_insert_finance on public.invoice_reminders;
create policy invoice_reminders_insert_finance on public.invoice_reminders
for insert
with check (public.has_finance_write_access(company_id));

grant select, insert on public.invoice_reminders to authenticated;

insert into storage.buckets (id, name, public)
values ('invoice-attachments', 'invoice-attachments', false)
on conflict (id) do nothing;

drop policy if exists invoice_attachments_read on storage.objects;
create policy invoice_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'invoice-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists invoice_attachments_insert on storage.objects;
create policy invoice_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'invoice-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_write_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists invoice_attachments_update on storage.objects;
create policy invoice_attachments_update on storage.objects
for update to authenticated
using (
  bucket_id = 'invoice-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_write_access((split_part(name, '/', 1))::uuid)
)
with check (
  bucket_id = 'invoice-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_write_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists invoice_attachments_delete on storage.objects;
create policy invoice_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'invoice-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_write_access((split_part(name, '/', 1))::uuid)
);

create or replace function public.invoice_net_paid_total(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select round(
    coalesce(sum(
      case
        when ip.direction = 'incoming' then ip.amount
        when ip.direction = 'refund' then -ip.amount
        else 0
      end
    ), 0),
    2
  )
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id;
$$;

create or replace function public.update_invoice_payment_status(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_paid numeric(12,2) := 0;
  v_open numeric(12,2) := 0;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    return;
  end if;

  v_paid := public.invoice_net_paid_total(v_invoice.id);
  v_open := round(v_invoice.total - v_paid, 2);

  update public.invoices
  set status = case
      when status = 'void' then status
      when v_open <= 0 then 'paid'
      else 'issued'
    end,
    collection_stage = case
      when v_open <= 0 then 'closed'
      when collection_stage = 'closed' then 'none'
      else collection_stage
    end
  where id = v_invoice.id;
end;
$$;

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text default null,
  p_reference text default null,
  p_note text default null,
  p_allow_overpayment boolean default false,
  p_attachment_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_paid_before numeric(12,2) := 0;
  v_open_before numeric(12,2) := 0;
  v_apply_amount numeric(12,2) := 0;
  v_overpayment numeric(12,2) := 0;
  v_payment_id uuid;
  v_verification_result jsonb;
  v_verification_id uuid;
  v_paid_after numeric(12,2) := 0;
  v_open_after numeric(12,2) := 0;
begin
  select * into v_invoice
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

  v_paid_before := public.invoice_net_paid_total(v_invoice.id);
  v_open_before := round(v_invoice.total - v_paid_before, 2);

  if v_open_before <= 0 and not p_allow_overpayment then
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no,
      'already_paid', true,
      'paid_total', v_paid_before,
      'open_amount', 0
    );
  end if;

  if v_open_before <= 0 and p_allow_overpayment then
    v_apply_amount := 0;
    v_overpayment := round(p_amount, 2);
  elsif round(p_amount, 2) > v_open_before then
    if not p_allow_overpayment then
      raise exception 'Payment amount exceeds open receivable';
    end if;

    v_apply_amount := v_open_before;
    v_overpayment := round(p_amount - v_open_before, 2);
  else
    v_apply_amount := round(p_amount, 2);
    v_overpayment := 0;
  end if;

  insert into public.invoice_payments (
    company_id,
    invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    direction,
    overpayment_amount,
    attachment_path,
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
    'incoming',
    v_overpayment,
    nullif(trim(p_attachment_path), ''),
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
      'lines', jsonb_strip_nulls(
        jsonb_build_array(
          jsonb_build_object('account_no', '1930', 'debit', round(p_amount, 2), 'credit', 0),
          case when v_apply_amount > 0 then jsonb_build_object('account_no', '1510', 'debit', 0, 'credit', v_apply_amount) else null end,
          case when v_overpayment > 0 then jsonb_build_object('account_no', '2420', 'debit', 0, 'credit', v_overpayment) else null end
        )
      )
    )
  );

  v_verification_id := (v_verification_result->>'verification_id')::uuid;

  update public.invoice_payments
  set booking_verification_id = v_verification_id
  where id = v_payment_id;

  perform public.update_invoice_payment_status(v_invoice.id);

  v_paid_after := public.invoice_net_paid_total(v_invoice.id);
  v_open_after := round(v_invoice.total - v_paid_after, 2);

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_payment_registered',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'payment_id', v_payment_id,
      'payment_amount', round(p_amount, 2),
      'applied_amount', v_apply_amount,
      'overpayment_amount', v_overpayment,
      'payment_date', p_payment_date,
      'verification_id', v_verification_id
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'payment_id', v_payment_id,
    'payment_amount', round(p_amount, 2),
    'applied_amount', v_apply_amount,
    'overpayment_amount', v_overpayment,
    'payment_date', p_payment_date,
    'booking_verification_id', v_verification_id,
    'paid_total', v_paid_after,
    'open_amount', greatest(v_open_after, 0),
    'already_paid', false
  );
end;
$$;

create or replace function public.refund_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text default null,
  p_reference text default null,
  p_note text default null,
  p_attachment_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_payment_id uuid;
  v_verification_result jsonb;
  v_verification_id uuid;
  v_paid_after numeric(12,2) := 0;
  v_open_after numeric(12,2) := 0;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.kind <> 'invoice' then
    raise exception 'Refund can only be registered for regular invoices';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Refund amount must be greater than 0';
  end if;

  if p_payment_date is null then
    raise exception 'Refund date is required';
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, p_payment_date);

  insert into public.invoice_payments (
    company_id,
    invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    direction,
    attachment_path,
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
    'refund',
    nullif(trim(p_attachment_path), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  v_verification_result := public.create_verification_from_wizard(
    jsonb_build_object(
      'company_id', v_invoice.company_id,
      'date', p_payment_date,
      'description', format('Återbetalning %s', v_invoice.invoice_no),
      'total', round(p_amount, 2),
      'source', 'desktop',
      'client_request_id', format('invoice-refund:%s', v_payment_id),
      'lines', jsonb_build_array(
        jsonb_build_object('account_no', '1510', 'debit', round(p_amount, 2), 'credit', 0),
        jsonb_build_object('account_no', '1930', 'debit', 0, 'credit', round(p_amount, 2))
      )
    )
  );

  v_verification_id := (v_verification_result->>'verification_id')::uuid;

  update public.invoice_payments
  set booking_verification_id = v_verification_id
  where id = v_payment_id;

  perform public.update_invoice_payment_status(v_invoice.id);

  v_paid_after := public.invoice_net_paid_total(v_invoice.id);
  v_open_after := round(v_invoice.total - v_paid_after, 2);

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_payment_refunded',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'refund_id', v_payment_id,
      'refund_amount', round(p_amount, 2),
      'payment_date', p_payment_date,
      'verification_id', v_verification_id
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'refund_payment_id', v_payment_id,
    'refund_amount', round(p_amount, 2),
    'payment_date', p_payment_date,
    'booking_verification_id', v_verification_id,
    'paid_total', v_paid_after,
    'open_amount', greatest(v_open_after, 0)
  );
end;
$$;

create or replace function public.reverse_invoice_payment(
  p_payment_id uuid,
  p_reverse_date date default current_date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.invoice_payments;
  v_invoice public.invoices;
  v_result jsonb;
begin
  select * into v_payment
  from public.invoice_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;

  if v_payment.reversed_from_payment_id is not null then
    raise exception 'Payment is already a reversal row';
  end if;

  if exists (
    select 1
    from public.invoice_payments p
    where p.reversed_from_payment_id = v_payment.id
  ) then
    raise exception 'Payment already reversed';
  end if;

  select * into v_invoice
  from public.invoices
  where id = v_payment.invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found for payment';
  end if;

  if v_payment.direction = 'incoming' then
    v_result := public.refund_invoice_payment(
      v_payment.invoice_id,
      v_payment.amount,
      coalesce(p_reverse_date, current_date),
      'correction',
      coalesce(v_payment.reference, ''),
      coalesce(nullif(trim(p_reason), ''), 'Automatisk korrigering av betalning'),
      null
    );
  else
    v_result := public.register_invoice_payment(
      v_payment.invoice_id,
      v_payment.amount,
      coalesce(p_reverse_date, current_date),
      'correction',
      coalesce(v_payment.reference, ''),
      coalesce(nullif(trim(p_reason), ''), 'Automatisk korrigering av återbetalning'),
      true,
      null
    );
  end if;

  update public.invoice_payments
  set reversed_from_payment_id = v_payment.id
  where id = coalesce((v_result->>'refund_payment_id')::uuid, (v_result->>'payment_id')::uuid);

  perform public.log_finance_action(
    v_payment.company_id,
    'invoice_payment_reversed',
    'invoice_payment',
    v_payment.id,
    jsonb_build_object('reverse_result', v_result)
  );

  return jsonb_build_object('original_payment_id', v_payment.id, 'result', v_result);
end;
$$;

create or replace function public.mark_invoice_collection_stage(
  p_invoice_id uuid,
  p_stage text,
  p_fee numeric default 0,
  p_note text default null,
  p_sent_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_stage text := coalesce(nullif(trim(p_stage), ''), 'none');
  v_reminder_id uuid;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_stage not in ('none', 'reminder_1', 'reminder_2', 'inkasso', 'dispute', 'closed') then
    raise exception 'Invalid collection stage';
  end if;

  update public.invoices
  set collection_stage = v_stage,
      collection_note = case when p_note is null then collection_note else nullif(trim(p_note), '') end,
      reminder_1_sent_at = case when v_stage = 'reminder_1' then coalesce(p_sent_at, now()) else reminder_1_sent_at end,
      reminder_2_sent_at = case when v_stage = 'reminder_2' then coalesce(p_sent_at, now()) else reminder_2_sent_at end,
      inkasso_sent_at = case when v_stage = 'inkasso' then coalesce(p_sent_at, now()) else inkasso_sent_at end
  where id = v_invoice.id;

  if v_stage in ('reminder_1', 'reminder_2', 'inkasso') then
    insert into public.invoice_reminders (
      company_id,
      invoice_id,
      stage,
      sent_at,
      fee,
      note,
      created_by
    )
    values (
      v_invoice.company_id,
      v_invoice.id,
      v_stage,
      coalesce(p_sent_at, now()),
      greatest(coalesce(p_fee, 0), 0),
      nullif(trim(p_note), ''),
      auth.uid()
    )
    returning id into v_reminder_id;
  end if;

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_collection_stage_changed',
    'invoice',
    v_invoice.id,
    jsonb_build_object('stage', v_stage, 'fee', p_fee, 'note', p_note, 'reminder_id', v_reminder_id)
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'collection_stage', v_stage,
    'reminder_id', v_reminder_id
  );
end;
$$;

create or replace function public.period_close_checklist(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unbooked_invoices integer := 0;
  v_unpaid_overdue_invoices integer := 0;
  v_ver_without_attachment integer := 0;
  v_recon jsonb;
  v_diff numeric(12,2) := 0;
  v_ok boolean := false;
begin
  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  select count(*) into v_unbooked_invoices
  from public.invoices i
  where i.company_id = p_company_id
    and i.issue_date between p_period_start and p_period_end
    and coalesce((i.rpc_result->>'booking_verification_id')::uuid, null) is null
    and i.status <> 'void';

  select count(*) into v_unpaid_overdue_invoices
  from public.invoices i
  where i.company_id = p_company_id
    and i.kind = 'invoice'
    and i.status <> 'void'
    and i.due_date <= p_period_end
    and round(i.total - public.invoice_net_paid_total(i.id), 2) > 0;

  select count(*) into v_ver_without_attachment
  from public.verifications v
  where v.company_id = p_company_id
    and v.status = 'booked'
    and v.date between p_period_start and p_period_end
    and coalesce(v.attachment_path, '') = '';

  v_recon := public.receivables_reconciliation_report(p_company_id, p_period_end);
  v_diff := coalesce((v_recon->>'difference')::numeric, 0);
  v_ok := abs(v_diff) < 0.01;

  return jsonb_build_object(
    'company_id', p_company_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'checks', jsonb_build_object(
      'unbooked_invoices', v_unbooked_invoices,
      'unpaid_overdue_invoices', v_unpaid_overdue_invoices,
      'verifications_without_attachment', v_ver_without_attachment,
      'receivables_reconciliation_ok', v_ok,
      'receivables_reconciliation_diff', v_diff
    ),
    'ready_to_lock',
      v_unbooked_invoices = 0
      and v_unpaid_overdue_invoices = 0
      and v_ver_without_attachment = 0
      and v_ok
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
      round(coalesce(sum(case when ip.direction = 'incoming' then ip.amount else -ip.amount end), 0), 2) as paid_total,
      round(coalesce(sum(ip.overpayment_amount), 0), 2) as overpayment_total
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
      i.collection_stage,
      coalesce(i.customer_snapshot->>'name', '') as customer_name,
      round(i.total, 2) as invoice_total,
      coalesce(p.paid_total, 0)::numeric(12,2) as paid_total,
      round(i.total - coalesce(p.paid_total, 0), 2) as open_amount,
      coalesce(p.overpayment_total, 0)::numeric(12,2) as overpayment_total
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
    'rows', coalesce((select jsonb_agg(to_jsonb(o) order by o.due_date asc, o.invoice_no asc) from open_rows o), '[]'::jsonb),
    'summary', jsonb_build_object(
      'open_total', coalesce((select round(sum(open_amount), 2) from open_rows), 0),
      'overdue_total', coalesce((select round(sum(open_amount), 2) from open_rows where days_overdue > 0), 0),
      'invoice_count', coalesce((select count(*) from open_rows), 0),
      'overpayment_total', coalesce((select round(sum(overpayment_total), 2) from rows), 0)
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
              select sum(case when ip.direction = 'incoming' then ip.amount else -ip.amount end)
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

grant execute on function public.register_invoice_payment(uuid, numeric, date, text, text, text, boolean, text) to authenticated;
grant execute on function public.refund_invoice_payment(uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.reverse_invoice_payment(uuid, date, text) to authenticated;
grant execute on function public.mark_invoice_collection_stage(uuid, text, numeric, text, timestamptz) to authenticated;
grant execute on function public.period_close_checklist(uuid, date, date) to authenticated;
grant execute on function public.update_invoice_payment_status(uuid) to authenticated;
grant execute on function public.invoice_net_paid_total(uuid) to authenticated;
