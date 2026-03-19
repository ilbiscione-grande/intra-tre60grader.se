-- Add invoice_sources support to standard invoice creation and
-- introduce multi-order invoice creation for same-customer combined invoices.

create or replace function public.create_invoice_from_order(order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_order_id uuid := $1;
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

  if v_existing.id is null then
    select i.* into v_existing
    from public.invoice_sources s
    join public.invoices i on i.id = s.invoice_id
    where s.order_id = v_requested_order_id
      and i.kind = 'invoice'
      and i.status <> 'void'
    order by i.created_at desc
    limit 1;
  end if;

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
        'order_id', v_order.id,
        'project_id', v_order.project_id,
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
    'source_order_ids', jsonb_build_array(v_order.id),
    'source_count', 1,
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

  insert into public.invoice_sources (
    company_id,
    invoice_id,
    project_id,
    order_id,
    source_kind,
    position
  )
  values (
    v_order.company_id,
    v_invoice_id,
    v_order.project_id,
    v_order.id,
    'order',
    1
  )
  on conflict (invoice_id, order_id) do nothing;

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

create or replace function public.create_invoice_from_orders(order_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_order_ids uuid[];
  v_requested_count integer;
  v_found_count integer;
  v_order public.orders;
  v_project public.projects;
  v_customer public.customers;
  v_existing public.invoices;
  v_company_id uuid;
  v_customer_id uuid;
  v_primary_project_id uuid;
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
  v_subtotal numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_order_subtotal numeric(12,2);
  v_order_vat_total numeric(12,2);
  v_order_total numeric(12,2);
  v_order_count integer := 0;
  v_project_count integer := 0;
  v_position integer := 0;
begin
  select coalesce(array_agg(distinct source_id), '{}'::uuid[])
  into v_requested_order_ids
  from unnest(coalesce(order_ids, '{}'::uuid[])) as source_id;

  v_requested_count := coalesce(array_length(v_requested_order_ids, 1), 0);

  if v_requested_count = 0 then
    raise exception 'At least one order is required';
  end if;

  select count(*)
  into v_found_count
  from public.orders o
  where o.id = any(v_requested_order_ids);

  if v_found_count <> v_requested_count then
    raise exception 'One or more selected orders were not found';
  end if;

  for v_order in
    select *
    from public.orders o
    where o.id = any(v_requested_order_ids)
    order by o.created_at asc, o.id asc
    for update
  loop
    v_order_count := v_order_count + 1;

    if v_company_id is null then
      v_company_id := v_order.company_id;
      perform public.assert_finance_period_open(v_company_id, v_issue_date);

      if not public.has_finance_write_access(v_company_id) then
        raise exception 'Not allowed';
      end if;
    elsif v_order.company_id <> v_company_id then
      raise exception 'All selected orders must belong to the same company';
    end if;

    select * into v_project
    from public.projects p
    where p.id = v_order.project_id;

    if v_project.id is null then
      raise exception 'Project not found for order %', v_order.id;
    end if;

    if v_project.customer_id is null then
      raise exception 'Customer is required on every selected project';
    end if;

    if v_customer_id is null then
      v_customer_id := v_project.customer_id;
      v_primary_project_id := v_project.id;
    elsif v_project.customer_id <> v_customer_id then
      raise exception 'All selected orders must belong to the same customer';
    end if;

    select i.* into v_existing
    from public.invoice_sources s
    join public.invoices i on i.id = s.invoice_id
    where s.order_id = v_order.id
      and i.kind = 'invoice'
      and i.status <> 'void'
    order by i.created_at desc
    limit 1;

    if v_existing.id is null then
      select i.* into v_existing
      from public.invoices i
      where i.order_id = v_order.id
        and i.kind = 'invoice'
        and i.status <> 'void'
      order by i.created_at desc
      limit 1;
    end if;

    if v_existing.id is not null then
      raise exception 'Order % is already included in invoice %', v_order.id, v_existing.invoice_no;
    end if;

    select
      coalesce(sum(ol.total), 0)::numeric(12,2),
      coalesce(sum((ol.total * ol.vat_rate / 100.0)), 0)::numeric(12,2)
    into v_order_subtotal, v_order_vat_total
    from public.order_lines ol
    where ol.order_id = v_order.id
      and ol.company_id = v_order.company_id;

    v_order_total := round((v_order_subtotal + v_order_vat_total)::numeric, 2);

    if v_order_total <= 0 then
      raise exception 'Order % must be greater than 0 before invoice creation', v_order.id;
    end if;

    v_subtotal := v_subtotal + v_order_subtotal;
    v_vat_total := v_vat_total + v_order_vat_total;

    update public.orders
    set status = 'invoiced',
        total = v_order_total
    where id = v_order.id;
  end loop;

  select count(distinct o.project_id)
  into v_project_count
  from public.orders o
  where o.id = any(v_requested_order_ids);

  select * into v_customer
  from public.customers c
  where c.id = v_customer_id
    and c.company_id = v_company_id;

  if v_customer.id is null then
    raise exception 'Customer is required before invoice can be created';
  end if;

  if coalesce(nullif(trim(v_customer.name), ''), '') = '' then
    raise exception 'Customer name is required';
  end if;

  v_total := round((v_subtotal + v_vat_total)::numeric, 2);

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
  where c.id = v_company_id;

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
        'order_id', o.id,
        'order_no', o.order_no,
        'project_id', o.project_id,
        'project_title', p.title,
        'title', ol.title,
        'qty', ol.qty,
        'unit_price', ol.unit_price,
        'vat_rate', ol.vat_rate,
        'total', ol.total
      )
      order by o.created_at asc, ol.created_at asc
    ),
    '[]'::jsonb
  ) into v_lines_snapshot
  from public.order_lines ol
  join public.orders o on o.id = ol.order_id
  join public.projects p on p.id = o.project_id
  where o.id = any(v_requested_order_ids)
    and o.company_id = v_company_id;

  if jsonb_array_length(coalesce(v_lines_snapshot, '[]'::jsonb)) = 0 then
    raise exception 'Selected orders must contain at least one row';
  end if;

  v_invoice_no := public.next_invoice_number(v_company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'kind', 'invoice',
    'order_id', null,
    'project_id', v_primary_project_id,
    'source_order_ids', to_jsonb(v_requested_order_ids),
    'source_count', v_requested_count,
    'project_count', v_project_count,
    'order_count', v_order_count,
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
    v_company_id,
    v_primary_project_id,
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

  for v_order in
    select *
    from public.orders o
    where o.id = any(v_requested_order_ids)
    order by o.created_at asc, o.id asc
  loop
    v_position := v_position + 1;

    insert into public.invoice_sources (
      company_id,
      invoice_id,
      project_id,
      order_id,
      source_kind,
      position
    )
    values (
      v_company_id,
      v_invoice_id,
      v_order.project_id,
      v_order.id,
      'order',
      v_position
    );

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
  end loop;

  return v_result || jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_exists', false
  );
end;
$$;

grant execute on function public.create_invoice_from_order(uuid) to authenticated;
grant execute on function public.create_invoice_from_orders(uuid[]) to authenticated;
