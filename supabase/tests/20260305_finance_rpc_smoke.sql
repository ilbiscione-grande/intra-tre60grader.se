-- Smoke test for finance RPCs
-- Validates: idempotency, void, reversal, period lock
-- Safe to run in SQL editor: wraps in transaction and rolls back.

begin;

do $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_request_id text := 'smoke-' || gen_random_uuid()::text;
  v_request_id_2 text := 'smoke-' || gen_random_uuid()::text;
  v_request_id_3 text := 'smoke-' || gen_random_uuid()::text;
  v_payload jsonb;
  v_payload_2 jsonb;
  v_payload_3 jsonb;
  v_first jsonb;
  v_second jsonb;
  v_void jsonb;
  v_reversal jsonb;
  v_verification_id uuid;
  v_verification_id_2 uuid;
  v_reversal_id uuid;
  v_original_status text;
  v_reversal_links uuid;
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

  v_payload := jsonb_build_object(
    'company_id', v_company_id,
    'date', current_date::text,
    'description', 'SMOKE idempotency check',
    'total', 125.00,
    'source', 'desktop',
    'client_request_id', v_request_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_no', '6110', 'debit', 100, 'credit', 0),
      jsonb_build_object('account_no', '2641', 'debit', 25, 'credit', 0, 'vat_code', '25'),
      jsonb_build_object('account_no', '1930', 'debit', 0, 'credit', 125)
    )
  );

  v_first := public.create_verification_from_wizard(v_payload);
  v_verification_id := (v_first->>'verification_id')::uuid;

  if v_verification_id is null then
    raise exception 'create_verification_from_wizard did not return verification_id';
  end if;

  v_second := public.create_verification_from_wizard(v_payload);

  if coalesce((v_second->>'deduplicated')::boolean, false) is distinct from true then
    raise exception 'Idempotency failed: second call was not deduplicated';
  end if;

  if (v_second->>'verification_id')::uuid is distinct from v_verification_id then
    raise exception 'Idempotency failed: second call returned different verification_id';
  end if;

  v_void := public.void_verification(v_verification_id, 'SMOKE void check');

  if coalesce(v_void->>'status', '') <> 'voided' then
    raise exception 'void_verification did not return status=voided';
  end if;

  select status into v_original_status
  from public.verifications
  where id = v_verification_id;

  if v_original_status is distinct from 'voided' then
    raise exception 'void_verification did not persist status=voided';
  end if;

  v_payload_2 := jsonb_build_object(
    'company_id', v_company_id,
    'date', current_date::text,
    'description', 'SMOKE reversal check',
    'total', 200.00,
    'source', 'desktop',
    'client_request_id', v_request_id_2,
    'lines', jsonb_build_array(
      jsonb_build_object('account_no', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account_no', '3041', 'debit', 0, 'credit', 160),
      jsonb_build_object('account_no', '2611', 'debit', 0, 'credit', 40, 'vat_code', '25')
    )
  );

  v_verification_id_2 := (public.create_verification_from_wizard(v_payload_2)->>'verification_id')::uuid;

  if v_verification_id_2 is null then
    raise exception 'Could not create verification for reversal test';
  end if;

  v_reversal := public.create_reversal_verification(v_verification_id_2, 'SMOKE reversal');
  v_reversal_id := (v_reversal->>'reversal_verification_id')::uuid;

  if v_reversal_id is null then
    raise exception 'create_reversal_verification did not return reversal_verification_id';
  end if;

  select reversed_from_id into v_reversal_links
  from public.verifications
  where id = v_reversal_id;

  if v_reversal_links is distinct from v_verification_id_2 then
    raise exception 'Reversal verification is not linked to original via reversed_from_id';
  end if;

  select status into v_original_status
  from public.verifications
  where id = v_verification_id_2;

  if v_original_status is distinct from 'voided' then
    raise exception 'Original verification was not voided during reversal';
  end if;

  update public.companies
  set locked_until = current_date
  where id = v_company_id;

  v_payload_3 := jsonb_build_object(
    'company_id', v_company_id,
    'date', current_date::text,
    'description', 'SMOKE lock check',
    'total', 50.00,
    'source', 'desktop',
    'client_request_id', v_request_id_3,
    'lines', jsonb_build_array(
      jsonb_build_object('account_no', '6110', 'debit', 40, 'credit', 0),
      jsonb_build_object('account_no', '2641', 'debit', 10, 'credit', 0, 'vat_code', '25'),
      jsonb_build_object('account_no', '1930', 'debit', 0, 'credit', 50)
    )
  );

  begin
    perform public.create_verification_from_wizard(v_payload_3);
    raise exception 'Expected period lock error but create_verification_from_wizard succeeded';
  exception
    when others then
      if position('Period is locked' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  raise notice 'SMOKE TEST PASSED for company_id=% and user_id=%', v_company_id, v_user_id;
end
$$;

rollback;
