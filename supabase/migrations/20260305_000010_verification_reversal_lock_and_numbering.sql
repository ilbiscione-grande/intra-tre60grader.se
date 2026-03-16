alter table public.companies
  add column if not exists locked_until date;

alter table public.verifications
  add column if not exists fiscal_year integer,
  add column if not exists verification_no integer,
  add column if not exists reversed_from_id uuid references public.verifications(id) on delete set null;

create table if not exists public.verification_number_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_year integer not null,
  next_no integer not null default 1,
  primary key (company_id, fiscal_year)
);

create unique index if not exists verifications_company_year_no_uidx
  on public.verifications(company_id, fiscal_year, verification_no)
  where fiscal_year is not null and verification_no is not null;

create unique index if not exists verifications_reversed_from_uidx
  on public.verifications(reversed_from_id)
  where reversed_from_id is not null;

with numbered as (
  select
    id,
    extract(year from date)::integer as fiscal_year,
    row_number() over (
      partition by company_id, extract(year from date)::integer
      order by date, created_at, id
    )::integer as verification_no
  from public.verifications
), updated as (
  update public.verifications v
  set
    fiscal_year = n.fiscal_year,
    verification_no = n.verification_no
  from numbered n
  where v.id = n.id
  returning v.company_id, v.fiscal_year, v.verification_no
)
insert into public.verification_number_counters (company_id, fiscal_year, next_no)
select company_id, fiscal_year, max(verification_no) + 1
from updated
group by company_id, fiscal_year
on conflict (company_id, fiscal_year)
do update set next_no = greatest(public.verification_number_counters.next_no, excluded.next_no);

create or replace function public.next_verification_number(p_company_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from p_date)::integer;
  v_no integer;
begin
  insert into public.verification_number_counters (company_id, fiscal_year, next_no)
  values (p_company_id, v_year, 2)
  on conflict (company_id, fiscal_year)
  do update set next_no = public.verification_number_counters.next_no + 1
  returning next_no - 1 into v_no;

  return jsonb_build_object('fiscal_year', v_year, 'verification_no', v_no);
end;
$$;

grant execute on function public.next_verification_number(uuid, date) to authenticated;

create or replace function public.assert_finance_period_open(p_company_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until date;
begin
  select locked_until into v_locked_until
  from public.companies
  where id = p_company_id;

  if v_locked_until is not null and p_date <= v_locked_until then
    raise exception 'Period is locked through %', v_locked_until;
  end if;
end;
$$;

grant execute on function public.assert_finance_period_open(uuid, date) to authenticated;

create or replace function public.create_verification_from_wizard(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (payload->>'company_id')::uuid;
  v_date date := (payload->>'date')::date;
  v_verification_id uuid;
  v_source text := coalesce(nullif(payload->>'source', ''), 'desktop');
  v_client_request_id text := nullif(payload->>'client_request_id', '');
  v_existing_id uuid;
  v_no jsonb;
  line_item jsonb;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_line_count integer := 0;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if v_date is null then
    raise exception 'payload.date is required';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  perform public.assert_finance_period_open(v_company_id, v_date);

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

  v_no := public.next_verification_number(v_company_id, v_date);

  insert into public.verifications (
    company_id,
    date,
    description,
    total,
    attachment_path,
    created_by,
    source,
    client_request_id,
    status,
    fiscal_year,
    verification_no
  )
  values (
    v_company_id,
    v_date,
    coalesce(payload->>'description', ''),
    coalesce((payload->>'total')::numeric, 0),
    nullif(payload->>'attachment_path', ''),
    auth.uid(),
    v_source,
    v_client_request_id,
    'booked',
    (v_no->>'fiscal_year')::integer,
    (v_no->>'verification_no')::integer
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
    'deduplicated', false,
    'fiscal_year', (v_no->>'fiscal_year')::integer,
    'verification_no', (v_no->>'verification_no')::integer
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
  v_date date;
begin
  select company_id, status, date into v_company_id, v_status, v_date
  from public.verifications
  where id = verification_id;

  if v_company_id is null then
    raise exception 'Verification not found';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  perform public.assert_finance_period_open(v_company_id, v_date);

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

create or replace function public.create_reversal_verification(original_verification_id uuid, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.verifications;
  v_reversal_id uuid;
  v_no jsonb;
  v_line public.verification_lines;
begin
  select * into v_original
  from public.verifications
  where id = original_verification_id;

  if v_original.id is null then
    raise exception 'Original verification not found';
  end if;

  if not public.has_finance_access(v_original.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_original.status = 'voided' then
    raise exception 'Original verification is already voided';
  end if;

  if exists (select 1 from public.verifications where reversed_from_id = v_original.id) then
    raise exception 'A reversal already exists for this verification';
  end if;

  perform public.assert_finance_period_open(v_original.company_id, current_date);

  v_no := public.next_verification_number(v_original.company_id, current_date);

  insert into public.verifications (
    company_id,
    date,
    description,
    total,
    attachment_path,
    created_by,
    source,
    status,
    fiscal_year,
    verification_no,
    reversed_from_id
  )
  values (
    v_original.company_id,
    current_date,
    format('Rättelse av verifikation %s', coalesce(v_original.verification_no::text, v_original.id::text)),
    v_original.total,
    null,
    auth.uid(),
    'desktop',
    'booked',
    (v_no->>'fiscal_year')::integer,
    (v_no->>'verification_no')::integer,
    v_original.id
  )
  returning id into v_reversal_id;

  for v_line in
    select * from public.verification_lines where verification_id = v_original.id
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
      v_original.company_id,
      v_reversal_id,
      v_line.account_no,
      v_line.credit,
      v_line.debit,
      v_line.vat_code
    );
  end loop;

  update public.verifications
  set status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = coalesce(nullif(reason, ''), format('Rättad via verifikation %s', (v_no->>'verification_no')))
  where id = v_original.id;

  return jsonb_build_object(
    'original_verification_id', v_original.id,
    'reversal_verification_id', v_reversal_id,
    'fiscal_year', (v_no->>'fiscal_year')::integer,
    'verification_no', (v_no->>'verification_no')::integer
  );
end;
$$;

grant execute on function public.create_reversal_verification(uuid, text) to authenticated;
