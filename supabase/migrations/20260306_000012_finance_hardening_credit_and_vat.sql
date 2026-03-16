-- Finance hardening: immutable ledger controls, invoice credit notes, VAT report v1, stricter invoice bookkeeping.

insert into public.chart_of_accounts (company_id, account_no, name, account_type)
select c.id, '1510', 'Kundfordringar', 'asset'
from public.companies c
on conflict (company_id, account_no) do nothing;

alter table public.invoices
  add column if not exists kind text not null default 'invoice' check (kind in ('invoice', 'credit_note')),
  add column if not exists credit_for_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists credited_at timestamptz,
  add column if not exists credited_by uuid references auth.users(id) on delete set null;

alter table public.invoices
  alter column order_id drop not null;

alter table public.invoices
  drop constraint if exists invoices_order_id_key;

create unique index if not exists invoices_order_id_uidx
  on public.invoices(order_id)
  where order_id is not null;

create unique index if not exists invoices_credit_for_invoice_uidx
  on public.invoices(credit_for_invoice_id)
  where credit_for_invoice_id is not null;

drop policy if exists invoices_insert_finance on public.invoices;
create policy invoices_insert_finance on public.invoices
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists invoices_update_finance on public.invoices;
create policy invoices_update_finance on public.invoices
for update
using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

create or replace function public.guard_verification_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Verifications are immutable. Use reversal/void flow instead.';
  end if;

  if tg_op = 'UPDATE' then
    if (
      new.company_id is distinct from old.company_id
      or new.date is distinct from old.date
      or new.description is distinct from old.description
      or new.total is distinct from old.total
      or new.attachment_path is distinct from old.attachment_path
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
      or new.source is distinct from old.source
      or new.client_request_id is distinct from old.client_request_id
      or new.fiscal_year is distinct from old.fiscal_year
      or new.verification_no is distinct from old.verification_no
    ) then
      raise exception 'Verification core fields are immutable. Create a reversal instead.';
    end if;

    if old.status = 'voided' and new.status is distinct from 'voided' then
      raise exception 'Voided verification cannot be reopened.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_verification_immutability on public.verifications;
create trigger trg_guard_verification_immutability
before update or delete on public.verifications
for each row
execute function public.guard_verification_immutability();

create or replace function public.guard_verification_lines_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Verification lines are immutable. Create a new correcting verification instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_verification_lines_immutability on public.verification_lines;
create trigger trg_guard_verification_lines_immutability
before update or delete on public.verification_lines
for each row
execute function public.guard_verification_lines_immutability();

create or replace function public.guard_ledger_immutability()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.bypass_immutable_guard', true), '0') <> '1' then
    raise exception 'Ledger entries are immutable and can only be changed by system sync.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_ledger_immutability on public.ledger_entries;
create trigger trg_guard_ledger_immutability
before insert or update or delete on public.ledger_entries
for each row
execute function public.guard_ledger_immutability();

create or replace function public.sync_ledger_for_verification(p_verification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver public.verifications;
begin
  select * into v_ver
  from public.verifications
  where id = p_verification_id;

  if v_ver.id is null then
    return;
  end if;

  perform set_config('app.bypass_immutable_guard', '1', true);

  delete from public.ledger_entries
  where verification_id = p_verification_id;

  if v_ver.status is distinct from 'booked' then
    perform set_config('app.bypass_immutable_guard', '0', true);
    return;
  end if;

  insert into public.ledger_entries (
    company_id,
    verification_id,
    verification_line_id,
    entry_date,
    account_no,
    description,
    debit,
    credit,
    amount,
    fiscal_year,
    verification_no
  )
  select
    v_ver.company_id,
    v_ver.id,
    vl.id,
    v_ver.date,
    vl.account_no,
    v_ver.description,
    vl.debit,
    vl.credit,
    round(vl.debit - vl.credit, 2),
    v_ver.fiscal_year,
    v_ver.verification_no
  from public.verification_lines vl
  where vl.verification_id = v_ver.id;

  perform set_config('app.bypass_immutable_guard', '0', true);
end;
$$;

create or replace function public.book_invoice_issue(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_verification_result jsonb;
  v_verification_id uuid;
  v_subtotal numeric(12,2);
  v_vat_total numeric(12,2);
  v_total numeric(12,2);
  v_description text;
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

  if coalesce((v_invoice.rpc_result->>'booking_verification_id')::uuid, null) is not null then
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'booking_verification_id', (v_invoice.rpc_result->>'booking_verification_id')::uuid,
      'already_booked', true
    );
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, v_invoice.issue_date);

  v_subtotal := abs(coalesce(v_invoice.subtotal, 0));
  v_vat_total := abs(coalesce(v_invoice.vat_total, 0));
  v_total := abs(coalesce(v_invoice.total, 0));

  if v_total <= 0 then
    raise exception 'Invoice total must be greater than 0 for booking';
  end if;

  if v_invoice.kind = 'credit_note' then
    v_description := format('Kreditfaktura %s', v_invoice.invoice_no);

    v_verification_result := public.create_verification_from_wizard(
      jsonb_build_object(
        'company_id', v_invoice.company_id,
        'date', v_invoice.issue_date,
        'description', v_description,
        'total', v_total,
        'source', 'desktop',
        'client_request_id', format('invoice-credit:%s', v_invoice.id),
        'lines', jsonb_strip_nulls(
          jsonb_build_array(
            jsonb_build_object('account_no', '3001', 'debit', v_subtotal, 'credit', 0),
            case when v_vat_total > 0 then jsonb_build_object('account_no', '2611', 'debit', v_vat_total, 'credit', 0, 'vat_code', '25') else null end,
            jsonb_build_object('account_no', '1510', 'debit', 0, 'credit', v_total)
          )
        )
      )
    );
  else
    v_description := format('Faktura %s', v_invoice.invoice_no);

    v_verification_result := public.create_verification_from_wizard(
      jsonb_build_object(
        'company_id', v_invoice.company_id,
        'date', v_invoice.issue_date,
        'description', v_description,
        'total', v_total,
        'source', 'desktop',
        'client_request_id', format('invoice:%s', v_invoice.id),
        'lines', jsonb_strip_nulls(
          jsonb_build_array(
            jsonb_build_object('account_no', '1510', 'debit', v_total, 'credit', 0),
            jsonb_build_object('account_no', '3001', 'debit', 0, 'credit', v_subtotal),
            case when v_vat_total > 0 then jsonb_build_object('account_no', '2611', 'debit', 0, 'credit', v_vat_total, 'vat_code', '25') else null end
          )
        )
      )
    );
  end if;

  v_verification_id := (v_verification_result->>'verification_id')::uuid;

  update public.invoices
  set rpc_result = coalesce(rpc_result, '{}'::jsonb)
      || jsonb_build_object(
        'booking_verification_id', v_verification_id,
        'booking_result', v_verification_result
      )
  where id = v_invoice.id;

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_booked',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'kind', v_invoice.kind,
      'verification_id', v_verification_id
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'booking_verification_id', v_verification_id,
    'already_booked', false
  );
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
  v_booking jsonb;
begin
  select * into v_order
  from public.orders
  where id = order_id
  for update;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if not public.has_finance_write_access(v_order.company_id) then
    raise exception 'Not allowed';
  end if;

  perform public.assert_finance_period_open(v_order.company_id, v_issue_date);

  select * into v_existing
  from public.invoices i
  where i.order_id = order_id
    and i.kind = 'invoice'
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

  if v_customer.id is null then
    raise exception 'Customer is required before invoice can be created';
  end if;

  if coalesce(nullif(trim(v_customer.name), ''), '') = '' then
    raise exception 'Customer name is required';
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

  if coalesce(nullif(trim(v_company_snapshot->>'name'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'org_no'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'address_line1'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'postal_code'), ''), '') = ''
    or coalesce(nullif(trim(v_company_snapshot->>'city'), ''), '') = '' then
    raise exception 'Company invoice profile is incomplete. Fill in name/org no/address/postal code/city first.';
  end if;

  v_customer_snapshot := jsonb_build_object(
    'customer_id', v_customer.id,
    'name', v_customer.name
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

  if jsonb_array_length(coalesce(v_lines_snapshot, '[]'::jsonb)) = 0 then
    raise exception 'Order must have at least one row before invoice creation';
  end if;

  v_invoice_no := public.next_invoice_number(v_order.company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'kind', 'invoice',
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
    kind,
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
    'invoice',
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

  perform public.log_finance_action(
    v_order.company_id,
    'invoice_created',
    'invoice',
    v_invoice_id,
    jsonb_build_object('invoice_no', v_invoice_no, 'order_id', v_order.id, 'project_id', v_order.project_id)
  );

  v_booking := public.book_invoice_issue(v_invoice_id);

  return v_result
    || jsonb_build_object(
      'invoice_id', v_invoice_id,
      'already_exists', false,
      'booking', v_booking
    );
end;
$$;

create or replace function public.create_credit_invoice(p_original_invoice_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.invoices;
  v_existing public.invoices;
  v_invoice_id uuid;
  v_invoice_no text;
  v_issue_date date := current_date;
  v_due_date date := current_date;
  v_lines_snapshot jsonb;
  v_result jsonb;
  v_booking jsonb;
begin
  select * into v_original
  from public.invoices
  where id = p_original_invoice_id
  for update;

  if v_original.id is null then
    raise exception 'Original invoice not found';
  end if;

  if not public.has_finance_write_access(v_original.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_original.kind = 'credit_note' then
    raise exception 'Cannot credit a credit note';
  end if;

  perform public.assert_finance_period_open(v_original.company_id, v_issue_date);

  select * into v_existing
  from public.invoices
  where credit_for_invoice_id = v_original.id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'invoice_id', v_existing.id,
      'invoice_no', v_existing.invoice_no,
      'already_exists', true
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', row_item->>'id',
        'title', row_item->>'title',
        'qty', coalesce((row_item->>'qty')::numeric, 0) * -1,
        'unit_price', coalesce((row_item->>'unit_price')::numeric, 0),
        'vat_rate', coalesce((row_item->>'vat_rate')::numeric, 0),
        'total', coalesce((row_item->>'total')::numeric, 0) * -1
      )
    ),
    '[]'::jsonb
  ) into v_lines_snapshot
  from jsonb_array_elements(coalesce(v_original.lines_snapshot, '[]'::jsonb)) row_item;

  v_invoice_no := public.next_invoice_number(v_original.company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'kind', 'credit_note',
    'credit_for_invoice_id', v_original.id,
    'issue_date', v_issue_date,
    'due_date', v_due_date,
    'subtotal', abs(coalesce(v_original.subtotal, 0)) * -1,
    'vat_total', abs(coalesce(v_original.vat_total, 0)) * -1,
    'total', abs(coalesce(v_original.total, 0)) * -1,
    'reason', p_reason
  );

  insert into public.invoices (
    company_id,
    project_id,
    order_id,
    invoice_no,
    kind,
    credit_for_invoice_id,
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
    v_original.company_id,
    v_original.project_id,
    null,
    v_invoice_no,
    'credit_note',
    v_original.id,
    'issued',
    v_original.currency,
    v_issue_date,
    v_due_date,
    abs(coalesce(v_original.subtotal, 0)) * -1,
    abs(coalesce(v_original.vat_total, 0)) * -1,
    abs(coalesce(v_original.total, 0)) * -1,
    v_original.company_snapshot,
    v_original.customer_snapshot,
    coalesce(v_lines_snapshot, '[]'::jsonb),
    v_result,
    auth.uid()
  )
  returning id into v_invoice_id;

  update public.invoices
  set credited_at = now(),
      credited_by = auth.uid()
  where id = v_original.id;

  perform public.log_finance_action(
    v_original.company_id,
    'credit_invoice_created',
    'invoice',
    v_invoice_id,
    jsonb_build_object(
      'credit_invoice_no', v_invoice_no,
      'original_invoice_id', v_original.id,
      'reason', p_reason
    )
  );

  v_booking := public.book_invoice_issue(v_invoice_id);

  return v_result || jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_exists', false,
    'booking', v_booking
  );
end;
$$;

create or replace function public.vat_report(company_id uuid, period_start date, period_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_output_25 numeric(12,2) := 0;
  v_input_vat numeric(12,2) := 0;
  v_sales_base_25 numeric(12,2) := 0;
  v_purchase_base_25 numeric(12,2) := 0;
  v_result jsonb;
begin
  if not public.has_finance_access(company_id) then
    raise exception 'Not allowed';
  end if;

  select
    coalesce(sum(case when vl.account_no = '2611' and vl.vat_code = '25' then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.account_no = '2641' then vl.debit - vl.credit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '25' and (vl.account_no like '3%' or vl.account_no like '4%') then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '25' and (vl.account_no like '4%' or vl.account_no like '5%' or vl.account_no like '6%' or vl.account_no like '7%') then vl.debit - vl.credit else 0 end), 0)
  into v_output_25, v_input_vat, v_sales_base_25, v_purchase_base_25
  from public.verification_lines vl
  join public.verifications v on v.id = vl.verification_id
  where v.company_id = company_id
    and v.status = 'booked'
    and v.date between period_start and period_end;

  v_result := jsonb_build_object(
    'company_id', company_id,
    'period_start', period_start,
    'period_end', period_end,
    'boxes', jsonb_build_object(
      '05', round(v_sales_base_25, 2),
      '10', round(v_purchase_base_25, 2),
      '30', round(v_output_25, 2),
      '48', round(v_input_vat, 2),
      '49', round(v_output_25 - v_input_vat, 2)
    ),
    'totals', jsonb_build_object(
      'utgaende_moms', round(v_output_25, 2),
      'ingaende_moms', round(v_input_vat, 2),
      'moms_att_betala_eller_fa_tillbaka', round(v_output_25 - v_input_vat, 2)
    ),
    'note', 'MVP momsrapport. Kontrollera särskilda momsfall manuellt.'
  );

  return v_result;
end;
$$;

grant execute on function public.book_invoice_issue(uuid) to authenticated;
grant execute on function public.create_credit_invoice(uuid, text) to authenticated;
grant execute on function public.vat_report(uuid, date, date) to authenticated;