-- Smoke test for C1 invoice flow
-- Validates: invoice creation, send, delivery status updates, version snapshots
-- Safe to run in SQL editor: wraps in transaction and rolls back.

begin;

do $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_customer_id uuid;
  v_project_result jsonb;
  v_project_id uuid;
  v_order_id uuid;
  v_invoice_result jsonb;
  v_invoice_id uuid;
  v_send_result jsonb;
  v_delivery_result jsonb;
  v_manual_version_result jsonb;
  v_delivery_id uuid;
  v_invoice_status text;
  v_delivery_status text;
  v_delivered_at timestamptz;
  v_provider_response jsonb;
  v_versions_total integer;
  v_versions_sent integer;
  v_versions_trigger integer;
  v_versions_manual integer;
  v_customer_name text := 'C1 Smoke Customer ' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  select cm.company_id, cm.user_id
  into v_company_id, v_user_id
  from public.company_members cm
  where cm.role in ('finance', 'admin')
  order by cm.created_at asc
  limit 1;

  if v_company_id is null or v_user_id is null then
    raise exception 'No finance/admin membership found. Seed a company member first.';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  perform public.seed_default_project_columns(v_company_id);

  update public.companies c
  set locked_until = least(coalesce(c.locked_until, current_date - 1), current_date - 1),
      vat_no = coalesce(nullif(trim(c.vat_no), ''), 'SE556677889901'),
      default_payment_terms_days = greatest(coalesce(c.default_payment_terms_days, 30), 0)
  where c.id = v_company_id;

  insert into public.customers (
    company_id,
    name,
    billing_email,
    country
  )
  values (
    v_company_id,
    v_customer_name,
    'c1-smoke@example.com',
    'SE'
  )
  returning id into v_customer_id;

  v_project_result := public.create_project_with_order(
    jsonb_build_object(
      'company_id', v_company_id,
      'title', 'C1 Smoke Project',
      'customer_id', v_customer_id,
      'order_total', 1000
    )
  );

  v_project_id := (v_project_result->>'project_id')::uuid;
  v_order_id := (v_project_result->>'order_id')::uuid;

  if v_project_id is null or v_order_id is null then
    raise exception 'create_project_with_order did not return project_id/order_id';
  end if;

  insert into public.order_lines (
    company_id,
    order_id,
    title,
    qty,
    unit_price,
    vat_rate,
    total
  )
  values (
    v_company_id,
    v_order_id,
    'C1 smoke line',
    1,
    1000,
    25,
    1000
  );

  v_invoice_result := public.create_invoice_from_order(v_order_id);
  v_invoice_id := (v_invoice_result->>'invoice_id')::uuid;

  if v_invoice_id is null then
    raise exception 'create_invoice_from_order did not return invoice_id';
  end if;

  select i.status
  into v_invoice_status
  from public.invoices i
  where i.id = v_invoice_id;

  if v_invoice_status is distinct from 'issued' then
    raise exception 'Expected issued invoice after creation, got %', coalesce(v_invoice_status, 'null');
  end if;

  select count(*)
  into v_versions_total
  from public.invoice_versions iv
  where iv.invoice_id = v_invoice_id;

  if v_versions_total < 1 then
    raise exception 'Expected at least one invoice version after invoice creation';
  end if;

  v_send_result := public.send_invoice(
    v_invoice_id,
    'email',
    'customer-c1@example.com',
    'C1 Smoke Subject',
    'C1 smoke message'
  );

  v_delivery_id := (v_send_result->>'delivery_id')::uuid;
  if v_delivery_id is null then
    raise exception 'send_invoice did not return delivery_id';
  end if;

  select i.status
  into v_invoice_status
  from public.invoices i
  where i.id = v_invoice_id;

  if v_invoice_status is distinct from 'sent' then
    raise exception 'Expected invoice status sent after send_invoice, got %', coalesce(v_invoice_status, 'null');
  end if;

  select
    d.status,
    d.delivered_at,
    d.provider_response
  into
    v_delivery_status,
    v_delivered_at,
    v_provider_response
  from public.invoice_deliveries d
  where d.id = v_delivery_id;

  if v_delivery_status is distinct from 'sent' then
    raise exception 'Expected delivery status sent after send_invoice, got %', coalesce(v_delivery_status, 'null');
  end if;

  select count(*)
  into v_versions_sent
  from public.invoice_versions iv
  where iv.invoice_id = v_invoice_id
    and iv.reason = 'invoice_sent'
    and iv.source = 'send_invoice';

  if v_versions_sent < 1 then
    raise exception 'Expected invoice_sent version snapshot after send_invoice';
  end if;

  select count(*)
  into v_versions_trigger
  from public.invoice_versions iv
  where iv.invoice_id = v_invoice_id
    and iv.reason = 'status_changed'
    and iv.source = 'trigger';

  if v_versions_trigger < 1 then
    raise exception 'Expected trigger-based status_changed snapshot after send_invoice';
  end if;

  v_delivery_result := public.update_invoice_delivery_status(
    v_delivery_id,
    'delivered',
    jsonb_build_object('provider', 'smoke'),
    null
  );

  if coalesce(v_delivery_result->>'status', '') <> 'delivered' then
    raise exception 'update_invoice_delivery_status did not return status=delivered';
  end if;

  select
    d.status,
    d.delivered_at,
    d.provider_response
  into
    v_delivery_status,
    v_delivered_at,
    v_provider_response
  from public.invoice_deliveries d
  where d.id = v_delivery_id;

  if v_delivery_status is distinct from 'delivered' then
    raise exception 'Expected persisted delivery status delivered, got %', coalesce(v_delivery_status, 'null');
  end if;

  if v_delivered_at is null then
    raise exception 'Expected delivered_at to be populated when marking delivery as delivered';
  end if;

  if coalesce(v_provider_response->>'provider', '') <> 'smoke' then
    raise exception 'Expected provider_response.provider = smoke after delivery status update';
  end if;

  v_manual_version_result := public.create_invoice_version_snapshot(
    v_invoice_id,
    'c1_smoke_manual',
    'sql_smoke'
  );

  if (v_manual_version_result->>'invoice_id')::uuid is distinct from v_invoice_id then
    raise exception 'create_invoice_version_snapshot returned wrong invoice_id';
  end if;

  select count(*)
  into v_versions_manual
  from public.invoice_versions iv
  where iv.invoice_id = v_invoice_id
    and iv.reason = 'c1_smoke_manual'
    and iv.source = 'sql_smoke';

  if v_versions_manual < 1 then
    raise exception 'Expected manual invoice version snapshot to be persisted';
  end if;

  raise notice 'C1 SMOKE TEST PASSED: company_id=%, invoice_id=%, delivery_id=%, versions_total=%',
    v_company_id, v_invoice_id, v_delivery_id,
    (
      select count(*)
      from public.invoice_versions iv
      where iv.invoice_id = v_invoice_id
    );
end
$$;

rollback;
