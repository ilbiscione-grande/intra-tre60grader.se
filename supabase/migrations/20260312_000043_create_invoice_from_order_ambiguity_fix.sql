-- Hotfix: latest create_invoice_from_order() reintroduced ambiguous order_id references.

create or replace function public.create_invoice_from_order(order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_order_id uuid := create_invoice_from_order.order_id;
  v_order public.orders;
  v_project public.projects;
  v_customer public.customers;
  v_invoice_no text;
  v_issue_date date := current_date;
  v_due_date date;
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
  v_terms_days integer := 30;
  v_terms_text text := '30 dagar netto';
  v_supply_date date := current_date;
  v_seller_vat_no text;
begin
  select * into v_order
  from public.orders
  where id = v_requested_order_id
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
  where i.order_id = v_requested_order_id
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
    v_order.id,
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

grant execute on function public.create_invoice_from_order(uuid) to authenticated;
