-- Golden tests for finance domain (B6)
-- Goal: deterministic assertions for VAT, AP, and audit chain integrity.
-- Safe in SQL editor: transaction is rolled back.

begin;

do $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_today date := current_date;
  v_test_date date := current_date + 1;
  v_supplier_id uuid;
  v_supplier_name text := 'GOLDEN Supplier ' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_supplier_invoice_id uuid;
  v_supplier_payment_id uuid;
  v_report jsonb;
  v_vat jsonb;
  v_boxes jsonb;
  v_chain jsonb;
  v_chain_export jsonb;
  v_open_count integer;
  v_open_after integer;
  v_summary jsonb;
  v_req_sales text := 'golden-sales-' || gen_random_uuid()::text;
  v_req_purchase text := 'golden-purchase-' || gen_random_uuid()::text;
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

  -- Ensure test date is not inside locked period.
  update public.companies c
  set locked_until = least(coalesce(c.locked_until, v_test_date - 2), v_test_date - 2)
  where c.id = v_company_id;

  -- AP: supplier + supplier invoice + payment.
  insert into public.suppliers (company_id, name)
  values (v_company_id, v_supplier_name)
  returning id into v_supplier_id;

  v_supplier_invoice_id := (public.create_supplier_invoice(
    v_company_id,
    v_supplier_id,
    'GOLDEN-AP-001',
    v_today,
    v_today + 10,
    500,
    125,
    'SEK',
    'Golden AP invoice'
  )->>'supplier_invoice_id')::uuid;

  if v_supplier_invoice_id is null then
    raise exception 'create_supplier_invoice did not return supplier_invoice_id';
  end if;

  v_report := public.payables_open_report(v_company_id, v_today);
  v_open_count := coalesce((v_report->'summary'->>'invoice_count')::integer, 0);

  if v_open_count < 1 then
    raise exception 'Golden AP failed: expected at least one open supplier invoice';
  end if;

  v_supplier_payment_id := (public.register_supplier_invoice_payment(
    v_supplier_invoice_id,
    625,
    v_today,
    'bank',
    'GOLDEN-PAY',
    'Golden AP full payment'
  )->>'payment_id')::uuid;

  if v_supplier_payment_id is null then
    raise exception 'register_supplier_invoice_payment did not return payment_id';
  end if;

  v_report := public.payables_open_report(v_company_id, v_today);
  v_open_after := coalesce((v_report->'summary'->>'invoice_count')::integer, 0);

  if v_open_after <> 0 then
    raise exception 'Golden AP failed: expected 0 open invoices after full payment, got %', v_open_after;
  end if;

  -- VAT: deterministic sales and purchase vouchers (25%).
  perform public.create_verification_from_wizard(
    jsonb_build_object(
      'company_id', v_company_id,
      'date', v_test_date::text,
      'description', 'GOLDEN VAT SALES 25',
      'total', 1250,
      'source', 'desktop',
      'client_request_id', v_req_sales,
      'lines', jsonb_build_array(
        jsonb_build_object('account_no', '1930', 'debit', 1250, 'credit', 0),
        jsonb_build_object('account_no', '3001', 'debit', 0, 'credit', 1000, 'vat_code', '25'),
        jsonb_build_object('account_no', '2611', 'debit', 0, 'credit', 250, 'vat_code', '25')
      )
    )
  );

  perform public.create_verification_from_wizard(
    jsonb_build_object(
      'company_id', v_company_id,
      'date', v_test_date::text,
      'description', 'GOLDEN VAT PURCHASE 25',
      'total', 500,
      'source', 'desktop',
      'client_request_id', v_req_purchase,
      'lines', jsonb_build_array(
        jsonb_build_object('account_no', '4010', 'debit', 400, 'credit', 0, 'vat_code', '25'),
        jsonb_build_object('account_no', '2641', 'debit', 100, 'credit', 0, 'vat_code', '25'),
        jsonb_build_object('account_no', '1930', 'debit', 0, 'credit', 500)
      )
    )
  );

  v_vat := public.vat_report(v_company_id, v_test_date, v_test_date);
  v_boxes := coalesce(v_vat->'boxes', '{}'::jsonb);

  if coalesce((v_boxes->>'05')::numeric, 0) <> 1000 then
    raise exception 'Golden VAT failed: box 05 expected 1000, got %', coalesce(v_boxes->>'05', 'null');
  end if;

  if coalesce((v_boxes->>'10')::numeric, 0) <> 250 then
    raise exception 'Golden VAT failed: box 10 expected 250, got %', coalesce(v_boxes->>'10', 'null');
  end if;

  if coalesce((v_boxes->>'20')::numeric, 0) <> 400 then
    raise exception 'Golden VAT failed: box 20 expected 400, got %', coalesce(v_boxes->>'20', 'null');
  end if;

  if coalesce((v_boxes->>'48')::numeric, 0) <> 100 then
    raise exception 'Golden VAT failed: box 48 expected 100, got %', coalesce(v_boxes->>'48', 'null');
  end if;

  if coalesce((v_boxes->>'49')::numeric, 0) <> 150 then
    raise exception 'Golden VAT failed: box 49 expected 150, got %', coalesce(v_boxes->>'49', 'null');
  end if;

  -- Audit chain: normalize existing history for deterministic test run.
  perform public.rebuild_finance_audit_chain(v_company_id);

  -- Audit chain: verify and export.
  v_chain := public.finance_audit_chain_verify(v_company_id);
  if coalesce((v_chain->>'chain_ok')::boolean, false) is distinct from true then
    raise exception 'Golden audit chain failed: chain_ok = %', coalesce(v_chain->>'chain_ok', 'null');
  end if;

  if coalesce((v_chain->>'checked_events')::integer, 0) < 1 then
    raise exception 'Golden audit chain failed: expected checked_events >= 1';
  end if;

  v_chain_export := public.finance_audit_chain_export(v_company_id, null, 200);
  if jsonb_typeof(v_chain_export->'events') <> 'array' then
    raise exception 'Golden audit export failed: events is not array';
  end if;

  if jsonb_array_length(v_chain_export->'events') < 1 then
    raise exception 'Golden audit export failed: expected at least one exported event';
  end if;

  v_summary := jsonb_build_object(
    'company_id', v_company_id,
    'test_date', v_test_date,
    'ap_open_before', v_open_count,
    'ap_open_after', v_open_after,
    'vat_boxes', v_boxes,
    'audit_checked_events', v_chain->>'checked_events'
  );

  raise notice 'GOLDEN TEST PASSED: %', v_summary::text;
end
$$;

rollback;

