alter table public.verifications
  add column if not exists client_request_id text,
  add column if not exists status text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists void_reason text;

update public.verifications
set status = coalesce(status, 'booked')
where status is null;

alter table public.verifications
  alter column status set default 'booked';

alter table public.verifications
  add constraint verifications_status_check
  check (status in ('booked', 'voided'));

create unique index if not exists verifications_company_client_request_uidx
  on public.verifications(company_id, client_request_id)
  where client_request_id is not null;

create or replace function public.create_verification_from_wizard(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (payload->>'company_id')::uuid;
  v_verification_id uuid;
  v_source text := coalesce(nullif(payload->>'source', ''), 'desktop');
  v_client_request_id text := nullif(payload->>'client_request_id', '');
  v_existing_id uuid;
  line_item jsonb;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_line_count integer := 0;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  if v_source not in ('mobile', 'desktop', 'offline') then
    raise exception 'Invalid source %', v_source;
  end if;

  if coalesce(payload->>'description', '') = '' then
    raise exception 'payload.description is required';
  end if;

  if coalesce((payload->>'total')::numeric, 0) <= 0 then
    raise exception 'payload.total must be greater than 0';
  end if;

  if v_client_request_id is not null then
    select id into v_existing_id
    from public.verifications
    where company_id = v_company_id
      and client_request_id = v_client_request_id
    limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'verification_id', v_existing_id,
        'deduplicated', true
      );
    end if;
  end if;

  for line_item in
    select value from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb))
  loop
    v_line_count := v_line_count + 1;
    v_total_debit := v_total_debit + coalesce((line_item->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((line_item->>'credit')::numeric, 0);
  end loop;

  if v_line_count < 2 then
    raise exception 'At least two verification lines are required';
  end if;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Debet and kredit must balance';
  end if;

  insert into public.verifications (
    company_id,
    date,
    description,
    total,
    attachment_path,
    created_by,
    source,
    client_request_id,
    status
  )
  values (
    v_company_id,
    (payload->>'date')::date,
    coalesce(payload->>'description', ''),
    coalesce((payload->>'total')::numeric, 0),
    nullif(payload->>'attachment_path', ''),
    auth.uid(),
    v_source,
    v_client_request_id,
    'booked'
  )
  returning id into v_verification_id;

  for line_item in
    select value from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb))
  loop
    insert into public.verification_lines (
      company_id,
      verification_id,
      account_no,
      debit,
      credit,
      vat_code
    )
    values (
      v_company_id,
      v_verification_id,
      coalesce(line_item->>'account_no', '0000'),
      coalesce((line_item->>'debit')::numeric, 0),
      coalesce((line_item->>'credit')::numeric, 0),
      nullif(line_item->>'vat_code', '')
    );
  end loop;

  return jsonb_build_object(
    'verification_id', v_verification_id,
    'deduplicated', false
  );
end;
$$;

grant execute on function public.create_verification_from_wizard(jsonb) to authenticated;

create or replace function public.void_verification(verification_id uuid, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_status text;
begin
  select company_id, status into v_company_id, v_status
  from public.verifications
  where id = verification_id;

  if v_company_id is null then
    raise exception 'Verification not found';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  if v_status = 'voided' then
    return jsonb_build_object('verification_id', verification_id, 'status', 'voided');
  end if;

  update public.verifications
  set status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = nullif(reason, '')
  where id = verification_id;

  return jsonb_build_object('verification_id', verification_id, 'status', 'voided');
end;
$$;

grant execute on function public.void_verification(uuid, text) to authenticated;
