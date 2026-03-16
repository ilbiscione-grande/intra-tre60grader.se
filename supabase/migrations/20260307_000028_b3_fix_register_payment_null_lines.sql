-- B3 hotfix: register_invoice_payment ska inte skicka null-rader i lines-array.
-- jsonb_strip_nulls tar inte bort null-element i arrayer, vilket kan ge tomt account_no i create_verification_from_wizard.

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
  v_lines jsonb := '[]'::jsonb;
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

  -- Bygg lines-array utan null-element.
  select coalesce(jsonb_agg(x.item), '[]'::jsonb)
  into v_lines
  from (
    select jsonb_build_object('account_no', '1930', 'debit', round(p_amount, 2), 'credit', 0) as item
    union all
    select case when v_apply_amount > 0 then jsonb_build_object('account_no', '1510', 'debit', 0, 'credit', v_apply_amount) end
    union all
    select case when v_overpayment > 0 then jsonb_build_object('account_no', '2420', 'debit', 0, 'credit', v_overpayment) end
  ) as x
  where x.item is not null;

  v_verification_result := public.create_verification_from_wizard(
    jsonb_build_object(
      'company_id', v_invoice.company_id,
      'date', p_payment_date,
      'description', format('Inbetalning %s', v_invoice.invoice_no),
      'total', round(p_amount, 2),
      'source', 'desktop',
      'client_request_id', format('invoice-payment:%s', v_payment_id),
      'lines', v_lines
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

grant execute on function public.register_invoice_payment(uuid, numeric, date, text, text, text, boolean, text) to authenticated;
