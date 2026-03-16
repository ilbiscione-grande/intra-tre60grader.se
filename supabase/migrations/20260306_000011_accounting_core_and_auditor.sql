-- Accounting core: chart of accounts, ledger, period close RPC, reporting RPCs, auditor role

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'company_members_role_check'
      and conrelid = 'public.company_members'::regclass
  ) then
    alter table public.company_members drop constraint company_members_role_check;
  end if;

  alter table public.company_members
    add constraint company_members_role_check
    check (role in ('member', 'finance', 'admin', 'auditor'));
exception
  when duplicate_object then
    null;
end;
$$;

create or replace function public.has_finance_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_role(p_company_id) in ('finance', 'admin', 'auditor');
$$;

create or replace function public.has_finance_write_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_role(p_company_id) in ('finance', 'admin');
$$;

grant execute on function public.has_finance_access(uuid) to authenticated;
grant execute on function public.has_finance_write_access(uuid) to authenticated;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_no text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, account_no)
);

create index if not exists chart_of_accounts_company_type_idx
  on public.chart_of_accounts(company_id, account_type);

insert into public.chart_of_accounts (company_id, account_no, name, account_type)
select c.id, a.account_no, a.name, a.account_type
from public.companies c
cross join (
  values
    ('1930', 'Företagskonto', 'asset'),
    ('1630', 'Avräkning för skatter och avgifter', 'asset'),
    ('2018', 'Egen insättning', 'equity'),
    ('2611', 'Utgående moms 25%', 'liability'),
    ('2641', 'Ingående moms', 'asset'),
    ('3001', 'Försäljning varor 25%', 'income'),
    ('3041', 'Försäljning tjänster 25%', 'income'),
    ('3911', 'Hyresintäkter', 'income'),
    ('3990', 'Övriga rörelseintäkter', 'income'),
    ('3997', 'Försäkringsersättning', 'income'),
    ('4010', 'Varuinköp', 'expense'),
    ('5010', 'Lokalhyra', 'expense'),
    ('5410', 'Förbrukningsinventarier', 'expense'),
    ('5611', 'Drivmedel för personbilar', 'expense'),
    ('5615', 'Leasing av personbilar', 'expense'),
    ('5800', 'Resekostnader', 'expense'),
    ('5831', 'Logikostnader', 'expense'),
    ('5910', 'Annonsering', 'expense'),
    ('6071', 'Representation avdragsgill', 'expense'),
    ('6110', 'Kontorsmaterial', 'expense'),
    ('6212', 'Mobiltelefon', 'expense'),
    ('6231', 'Datakommunikation', 'expense'),
    ('6310', 'Företagsförsäkringar', 'expense'),
    ('6540', 'IT-tjänster', 'expense'),
    ('6550', 'Konsultarvoden', 'expense'),
    ('6570', 'Bankkostnader', 'expense'),
    ('6991', 'Övriga externa kostnader', 'expense'),
    ('7010', 'Löner till kollektivanställda', 'expense'),
    ('7510', 'Arbetsgivaravgifter', 'expense')
) as a(account_no, name, account_type)
on conflict (company_id, account_no) do nothing;

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  verification_id uuid not null references public.verifications(id) on delete cascade,
  verification_line_id uuid not null references public.verification_lines(id) on delete cascade,
  entry_date date not null,
  account_no text not null,
  description text not null,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  fiscal_year integer,
  verification_no integer,
  created_at timestamptz not null default now(),
  unique (verification_line_id)
);

create index if not exists ledger_entries_company_date_idx
  on public.ledger_entries(company_id, entry_date);
create index if not exists ledger_entries_company_account_idx
  on public.ledger_entries(company_id, account_no, entry_date);

alter table public.ledger_entries enable row level security;

drop policy if exists ledger_entries_select_finance on public.ledger_entries;
create policy ledger_entries_select_finance on public.ledger_entries
for select
using (public.has_finance_access(company_id));

create table if not exists public.finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_audit_log_company_created_idx
  on public.finance_audit_log(company_id, created_at desc);

alter table public.finance_audit_log enable row level security;

drop policy if exists finance_audit_log_select_finance on public.finance_audit_log;
create policy finance_audit_log_select_finance on public.finance_audit_log
for select
using (public.has_finance_access(company_id));

create or replace function public.log_finance_action(
  p_company_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_audit_log (company_id, actor_user_id, action, entity, entity_id, payload)
  values (p_company_id, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

grant execute on function public.log_finance_action(uuid, text, text, uuid, jsonb) to authenticated;

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

  delete from public.ledger_entries
  where verification_id = p_verification_id;

  if v_ver.status is distinct from 'booked' then
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
end;
$$;

grant execute on function public.sync_ledger_for_verification(uuid) to authenticated;

create or replace function public.set_period_lock(p_company_id uuid, p_locked_until date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_finance_write_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  update public.companies
  set locked_until = p_locked_until
  where id = p_company_id;

  perform public.log_finance_action(
    p_company_id,
    case when p_locked_until is null then 'period_unlock' else 'period_lock' end,
    'company',
    p_company_id,
    jsonb_build_object('locked_until', p_locked_until)
  );

  return jsonb_build_object('company_id', p_company_id, 'locked_until', p_locked_until);
end;
$$;

grant execute on function public.set_period_lock(uuid, date) to authenticated;

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
  v_account_no text;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if v_date is null then
    raise exception 'payload.date is required';
  end if;

  if not public.has_finance_write_access(v_company_id) then
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

    v_account_no := coalesce(line_item->>'account_no', '');
    if not exists (
      select 1
      from public.chart_of_accounts coa
      where coa.company_id = v_company_id
        and coa.account_no = v_account_no
        and coa.active = true
    ) then
      raise exception 'Account % is not active in chart_of_accounts', v_account_no;
    end if;
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

  perform public.sync_ledger_for_verification(v_verification_id);
  perform public.log_finance_action(
    v_company_id,
    'verification_created',
    'verification',
    v_verification_id,
    jsonb_build_object(
      'fiscal_year', (v_no->>'fiscal_year')::integer,
      'verification_no', (v_no->>'verification_no')::integer,
      'source', v_source
    )
  );

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

  if not public.has_finance_write_access(v_company_id) then
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

  perform public.sync_ledger_for_verification(verification_id);
  perform public.log_finance_action(
    v_company_id,
    'verification_voided',
    'verification',
    verification_id,
    jsonb_build_object('reason', reason)
  );

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

  if not public.has_finance_write_access(v_original.company_id) then
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

  perform public.sync_ledger_for_verification(v_original.id);
  perform public.sync_ledger_for_verification(v_reversal_id);

  perform public.log_finance_action(
    v_original.company_id,
    'verification_reversed',
    'verification',
    v_original.id,
    jsonb_build_object('reversal_verification_id', v_reversal_id, 'reason', reason)
  );

  return jsonb_build_object(
    'original_verification_id', v_original.id,
    'reversal_verification_id', v_reversal_id,
    'fiscal_year', (v_no->>'fiscal_year')::integer,
    'verification_no', (v_no->>'verification_no')::integer
  );
end;
$$;

grant execute on function public.create_reversal_verification(uuid, text) to authenticated;

create or replace function public.general_ledger_report(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.entry_date, t.verification_no, t.account_no), '[]'::jsonb)
  from (
    select
      le.entry_date,
      le.account_no,
      coalesce(coa.name, '') as account_name,
      le.description,
      le.debit,
      le.credit,
      le.amount,
      le.fiscal_year,
      le.verification_no,
      le.verification_id
    from public.ledger_entries le
    left join public.chart_of_accounts coa
      on coa.company_id = le.company_id
      and coa.account_no = le.account_no
    where le.company_id = p_company_id
      and le.entry_date between p_period_start and p_period_end
    order by le.entry_date, le.verification_no, le.account_no
  ) t;
$$;

create or replace function public.trial_balance_report(
  p_company_id uuid,
  p_as_of date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.account_no), '[]'::jsonb)
  from (
    select
      le.account_no,
      coalesce(coa.name, '') as account_name,
      round(sum(le.debit), 2) as debit,
      round(sum(le.credit), 2) as credit,
      round(sum(le.amount), 2) as balance
    from public.ledger_entries le
    left join public.chart_of_accounts coa
      on coa.company_id = le.company_id
      and coa.account_no = le.account_no
    where le.company_id = p_company_id
      and le.entry_date <= p_as_of
    group by le.account_no, coa.name
    order by le.account_no
  ) t;
$$;

create or replace function public.income_statement_report(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with rows as (
    select
      le.account_no,
      coalesce(coa.name, '') as account_name,
      coalesce(coa.account_type, case when le.account_no like '3%' then 'income' else 'expense' end) as account_type,
      round(sum(le.amount), 2) as amount
    from public.ledger_entries le
    left join public.chart_of_accounts coa
      on coa.company_id = le.company_id
      and coa.account_no = le.account_no
    where le.company_id = p_company_id
      and le.entry_date between p_period_start and p_period_end
      and (
        le.account_no like '3%'
        or le.account_no like '4%'
        or le.account_no like '5%'
        or le.account_no like '6%'
        or le.account_no like '7%'
        or le.account_no like '8%'
      )
    group by le.account_no, coa.name, coa.account_type
  ), normalized as (
    select
      account_no,
      account_name,
      account_type,
      case when account_type = 'income' then amount * -1 else amount end as signed_amount
    from rows
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(n) order by n.account_no) from normalized n), '[]'::jsonb),
    'total_income', coalesce((select round(sum(signed_amount), 2) from normalized where account_type = 'income'), 0),
    'total_expense', coalesce((select round(sum(signed_amount), 2) from normalized where account_type = 'expense'), 0),
    'result', coalesce((select round(sum(case when account_type = 'income' then signed_amount else -signed_amount end), 2) from normalized), 0)
  );
$$;

create or replace function public.balance_sheet_report(
  p_company_id uuid,
  p_as_of date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with rows as (
    select
      le.account_no,
      coalesce(coa.name, '') as account_name,
      coalesce(coa.account_type,
        case
          when le.account_no like '1%' then 'asset'
          when le.account_no like '2%' then 'liability'
          else 'equity'
        end
      ) as account_type,
      round(sum(le.amount), 2) as amount
    from public.ledger_entries le
    left join public.chart_of_accounts coa
      on coa.company_id = le.company_id
      and coa.account_no = le.account_no
    where le.company_id = p_company_id
      and le.entry_date <= p_as_of
      and (le.account_no like '1%' or le.account_no like '2%')
    group by le.account_no, coa.name, coa.account_type
  )
  select jsonb_build_object(
    'assets', coalesce((select jsonb_agg(to_jsonb(r) order by r.account_no) from rows r where r.account_type = 'asset'), '[]'::jsonb),
    'liabilities_equity', coalesce((select jsonb_agg(to_jsonb(r) order by r.account_no) from rows r where r.account_type in ('liability', 'equity')), '[]'::jsonb),
    'total_assets', coalesce((select round(sum(amount), 2) from rows where account_type = 'asset'), 0),
    'total_liabilities_equity', coalesce((select round(sum(amount * -1), 2) from rows where account_type in ('liability', 'equity')), 0)
  );
$$;

create or replace function public.finance_audit_log_report(
  p_company_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(t) order by t.created_at desc),
    '[]'::jsonb
  )
  from (
    select id, company_id, actor_user_id, action, entity, entity_id, payload, created_at
    from public.finance_audit_log
    where company_id = p_company_id
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  ) t;
$$;

grant execute on function public.general_ledger_report(uuid, date, date) to authenticated;
grant execute on function public.trial_balance_report(uuid, date) to authenticated;
grant execute on function public.income_statement_report(uuid, date, date) to authenticated;
grant execute on function public.balance_sheet_report(uuid, date) to authenticated;
grant execute on function public.finance_audit_log_report(uuid, integer) to authenticated;
grant execute on function public.set_period_lock(uuid, date) to authenticated;
