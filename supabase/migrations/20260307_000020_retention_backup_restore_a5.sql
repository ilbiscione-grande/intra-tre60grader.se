-- A5: Arkivering/retention 7 ar + backup/restore-test for räkenskapsinformation.

create table if not exists public.company_retention_policies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  retention_years integer not null default 7 check (retention_years >= 7 and retention_years <= 15),
  legal_hold boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.company_retention_policies (company_id)
select c.id
from public.companies c
on conflict (company_id) do nothing;

alter table public.company_retention_policies enable row level security;

drop policy if exists company_retention_policies_select_finance on public.company_retention_policies;
create policy company_retention_policies_select_finance on public.company_retention_policies
for select
using (public.has_finance_access(company_id));

drop policy if exists company_retention_policies_mutate_admin on public.company_retention_policies;
create policy company_retention_policies_mutate_admin on public.company_retention_policies
for all
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

create table if not exists public.company_backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_kind text not null default 'full_accounting' check (snapshot_kind in ('full_accounting')),
  label text,
  period_start date,
  period_end date,
  retain_until date not null,
  payload jsonb not null,
  payload_checksum text not null,
  row_counts jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  restore_tested_at timestamptz,
  restore_test_result jsonb
);

create index if not exists company_backup_snapshots_company_created_idx
  on public.company_backup_snapshots(company_id, created_at desc);

create index if not exists company_backup_snapshots_company_retain_idx
  on public.company_backup_snapshots(company_id, retain_until);

alter table public.company_backup_snapshots enable row level security;

drop policy if exists company_backup_snapshots_select_finance on public.company_backup_snapshots;
create policy company_backup_snapshots_select_finance on public.company_backup_snapshots
for select
using (public.has_finance_access(company_id));

drop policy if exists company_backup_snapshots_insert_finance on public.company_backup_snapshots;
create policy company_backup_snapshots_insert_finance on public.company_backup_snapshots
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists company_backup_snapshots_update_admin on public.company_backup_snapshots;
create policy company_backup_snapshots_update_admin on public.company_backup_snapshots
for update
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists company_backup_snapshots_delete_admin on public.company_backup_snapshots;
create policy company_backup_snapshots_delete_admin on public.company_backup_snapshots
for delete
using (public.app_user_role(company_id) = 'admin');

create or replace function public.backup_payload_for_company(
  p_company_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company jsonb;
  v_policy jsonb;
  v_result jsonb;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  select to_jsonb(c)
  into v_company
  from (
    select id, name, org_no, vat_no, billing_email, phone, address_line1, address_line2,
      postal_code, city, country, bankgiro, plusgiro, iban, bic, invoice_prefix,
      locked_until, default_payment_terms_days, late_payment_interest_rate, invoice_terms_note,
      created_at
    from public.companies
    where id = p_company_id
  ) c;

  if v_company is null then
    raise exception 'Company not found';
  end if;

  select to_jsonb(p)
  into v_policy
  from (
    select company_id, retention_years, legal_hold, updated_at
    from public.company_retention_policies
    where company_id = p_company_id
  ) p;

  v_result := jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'company_id', p_company_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'company', v_company,
    'retention_policy', coalesce(v_policy, '{}'::jsonb),
    'tables', jsonb_build_object(
      'chart_of_accounts', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.account_no)
        from public.chart_of_accounts t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'customers', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.customers t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'projects', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.projects t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'orders', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.orders t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'order_lines', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.order_lines t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'verifications', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.date, t.verification_no, t.id)
        from public.verifications t
        where t.company_id = p_company_id
          and (p_period_start is null or t.date >= p_period_start)
          and (p_period_end is null or t.date <= p_period_end)
      ), '[]'::jsonb),
      'verification_lines', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.verification_lines t
        where t.company_id = p_company_id
          and exists (
            select 1
            from public.verifications v
            where v.id = t.verification_id
              and (p_period_start is null or v.date >= p_period_start)
              and (p_period_end is null or v.date <= p_period_end)
          )
      ), '[]'::jsonb),
      'ledger_entries', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.entry_date, t.verification_no, t.id)
        from public.ledger_entries t
        where t.company_id = p_company_id
          and (p_period_start is null or t.entry_date >= p_period_start)
          and (p_period_end is null or t.entry_date <= p_period_end)
      ), '[]'::jsonb),
      'invoices', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.issue_date, t.invoice_no, t.id)
        from public.invoices t
        where t.company_id = p_company_id
          and (p_period_start is null or t.issue_date >= p_period_start)
          and (p_period_end is null or t.issue_date <= p_period_end)
      ), '[]'::jsonb),
      'invoice_payments', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.payment_date, t.id)
        from public.invoice_payments t
        where t.company_id = p_company_id
          and (p_period_start is null or t.payment_date >= p_period_start)
          and (p_period_end is null or t.payment_date <= p_period_end)
      ), '[]'::jsonb),
      'invoice_reminders', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.sent_at, t.id)
        from public.invoice_reminders t
        where t.company_id = p_company_id
          and (p_period_start is null or t.sent_at::date >= p_period_start)
          and (p_period_end is null or t.sent_at::date <= p_period_end)
      ), '[]'::jsonb),
      'invoice_history', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.invoice_history t
        where t.company_id = p_company_id
      ), '[]'::jsonb),
      'finance_audit_log', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
        from public.finance_audit_log t
        where t.company_id = p_company_id
          and (p_period_start is null or t.created_at::date >= p_period_start)
          and (p_period_end is null or t.created_at::date <= p_period_end)
      ), '[]'::jsonb)
    )
  );

  return v_result;
end;
$$;

grant execute on function public.backup_payload_for_company(uuid, date, date) to authenticated;

create or replace function public.create_company_backup_snapshot(
  p_company_id uuid,
  p_label text default null,
  p_period_start date default null,
  p_period_end date default null
)
returns table(snapshot_id uuid, retain_until date, created_at timestamptz, payload_checksum text, row_counts jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_checksum text;
  v_retention_years integer := 7;
  v_retain_until date;
  v_snapshot_id uuid;
  v_created_at timestamptz;
  v_counts jsonb;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_write_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  if p_period_start is not null and p_period_end is not null and p_period_end < p_period_start then
    raise exception 'Invalid period';
  end if;

  select retention_years
  into v_retention_years
  from public.company_retention_policies
  where company_id = p_company_id;

  v_retention_years := coalesce(v_retention_years, 7);
  v_retain_until := (current_date + make_interval(years => v_retention_years));

  v_payload := public.backup_payload_for_company(p_company_id, p_period_start, p_period_end);
  v_checksum := encode(digest(v_payload::text, 'sha256'), 'hex');

  v_counts := jsonb_build_object(
    'chart_of_accounts', (select count(*) from public.chart_of_accounts where company_id = p_company_id),
    'customers', (select count(*) from public.customers where company_id = p_company_id),
    'projects', (select count(*) from public.projects where company_id = p_company_id),
    'orders', (select count(*) from public.orders where company_id = p_company_id),
    'order_lines', (select count(*) from public.order_lines where company_id = p_company_id),
    'verifications', (select count(*) from public.verifications where company_id = p_company_id and (p_period_start is null or date >= p_period_start) and (p_period_end is null or date <= p_period_end)),
    'verification_lines', (
      select count(*)
      from public.verification_lines vl
      where vl.company_id = p_company_id
        and exists (
          select 1 from public.verifications v
          where v.id = vl.verification_id
            and (p_period_start is null or v.date >= p_period_start)
            and (p_period_end is null or v.date <= p_period_end)
        )
    ),
    'ledger_entries', (select count(*) from public.ledger_entries where company_id = p_company_id and (p_period_start is null or entry_date >= p_period_start) and (p_period_end is null or entry_date <= p_period_end)),
    'invoices', (select count(*) from public.invoices where company_id = p_company_id and (p_period_start is null or issue_date >= p_period_start) and (p_period_end is null or issue_date <= p_period_end)),
    'invoice_payments', (select count(*) from public.invoice_payments where company_id = p_company_id and (p_period_start is null or payment_date >= p_period_start) and (p_period_end is null or payment_date <= p_period_end)),
    'invoice_reminders', (select count(*) from public.invoice_reminders where company_id = p_company_id and (p_period_start is null or sent_at::date >= p_period_start) and (p_period_end is null or sent_at::date <= p_period_end)),
    'invoice_history', (select count(*) from public.invoice_history where company_id = p_company_id),
    'finance_audit_log', (select count(*) from public.finance_audit_log where company_id = p_company_id and (p_period_start is null or created_at::date >= p_period_start) and (p_period_end is null or created_at::date <= p_period_end))
  );

  insert into public.company_backup_snapshots (
    company_id,
    snapshot_kind,
    label,
    period_start,
    period_end,
    retain_until,
    payload,
    payload_checksum,
    row_counts,
    created_by
  ) values (
    p_company_id,
    'full_accounting',
    nullif(trim(coalesce(p_label, '')), ''),
    p_period_start,
    p_period_end,
    v_retain_until,
    v_payload,
    v_checksum,
    v_counts,
    auth.uid()
  )
  returning id, company_backup_snapshots.created_at into v_snapshot_id, v_created_at;

  perform public.log_finance_event(
    p_company_id,
    'backup.snapshot.created',
    'company_backup_snapshots',
    v_snapshot_id,
    jsonb_build_object(
      'period_start', p_period_start,
      'period_end', p_period_end,
      'retain_until', v_retain_until,
      'checksum', v_checksum
    )
  );

  return query
  select v_snapshot_id, v_retain_until, v_created_at, v_checksum, v_counts;
end;
$$;

grant execute on function public.create_company_backup_snapshot(uuid, text, date, date) to authenticated;

create or replace function public.run_company_backup_restore_test(
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.company_backup_snapshots;
  v_table jsonb;
  v_required_keys text[] := array['schema_version', 'generated_at', 'company_id', 'company', 'retention_policy', 'tables'];
  v_missing text[] := '{}';
  v_key text;
  v_checksum text;
  v_checksum_match boolean;
  v_tables text[] := array['chart_of_accounts','customers','projects','orders','order_lines','verifications','verification_lines','ledger_entries','invoices','invoice_payments','invoice_reminders','invoice_history','finance_audit_log'];
  v_tbl text;
  v_diff jsonb := '{}'::jsonb;
  v_exported_count integer;
  v_expected_count integer;
  v_ok boolean := true;
  v_result jsonb;
begin
  select * into v_snapshot
  from public.company_backup_snapshots
  where id = p_snapshot_id;

  if v_snapshot.id is null then
    raise exception 'Backup snapshot not found';
  end if;

  if not public.has_finance_access(v_snapshot.company_id) then
    raise exception 'Not allowed';
  end if;

  for v_key in select unnest(v_required_keys)
  loop
    if not (v_snapshot.payload ? v_key) then
      v_missing := array_append(v_missing, v_key);
      v_ok := false;
    end if;
  end loop;

  v_table := coalesce(v_snapshot.payload->'tables', '{}'::jsonb);

  v_checksum := encode(digest(v_snapshot.payload::text, 'sha256'), 'hex');
  v_checksum_match := (v_checksum = v_snapshot.payload_checksum);
  if not v_checksum_match then
    v_ok := false;
  end if;

  foreach v_tbl in array v_tables
  loop
    v_exported_count := coalesce(jsonb_array_length(coalesce(v_table->v_tbl, '[]'::jsonb)), 0);
    v_expected_count := coalesce((v_snapshot.row_counts->>v_tbl)::integer, 0);

    if v_exported_count <> v_expected_count then
      v_ok := false;
      v_diff := v_diff || jsonb_build_object(v_tbl, jsonb_build_object('exported', v_exported_count, 'expected', v_expected_count));
    end if;
  end loop;

  v_result := jsonb_build_object(
    'ok', v_ok,
    'snapshot_id', v_snapshot.id,
    'company_id', v_snapshot.company_id,
    'tested_at', now(),
    'checksum_match', v_checksum_match,
    'missing_keys', v_missing,
    'table_count_diffs', v_diff
  );

  update public.company_backup_snapshots
  set restore_tested_at = now(),
      restore_test_result = v_result
  where id = v_snapshot.id;

  perform public.log_finance_event(
    v_snapshot.company_id,
    'backup.restore_test.ran',
    'company_backup_snapshots',
    v_snapshot.id,
    v_result
  );

  return v_result;
end;
$$;

grant execute on function public.run_company_backup_restore_test(uuid) to authenticated;

create or replace function public.set_company_retention_policy(
  p_company_id uuid,
  p_retention_years integer,
  p_legal_hold boolean default false
)
returns public.company_retention_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.company_retention_policies;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if public.app_user_role(p_company_id) <> 'admin' then
    raise exception 'Admin required';
  end if;

  if p_retention_years < 7 or p_retention_years > 15 then
    raise exception 'retention_years must be between 7 and 15';
  end if;

  insert into public.company_retention_policies (company_id, retention_years, legal_hold, updated_by, updated_at)
  values (p_company_id, p_retention_years, coalesce(p_legal_hold, false), auth.uid(), now())
  on conflict (company_id)
  do update set
    retention_years = excluded.retention_years,
    legal_hold = excluded.legal_hold,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  perform public.log_finance_event(
    p_company_id,
    'backup.retention_policy.updated',
    'company_retention_policies',
    p_company_id,
    jsonb_build_object('retention_years', v_row.retention_years, 'legal_hold', v_row.legal_hold)
  );

  return v_row;
end;
$$;

grant execute on function public.set_company_retention_policy(uuid, integer, boolean) to authenticated;

create or replace function public.guard_backup_snapshot_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legal_hold boolean := false;
begin
  select coalesce(legal_hold, false)
  into v_legal_hold
  from public.company_retention_policies
  where company_id = old.company_id;

  if v_legal_hold then
    raise exception 'Kan inte radera backup under legal hold';
  end if;

  if old.retain_until >= current_date then
    raise exception 'Kan inte radera backup fore retain_until (%)', old.retain_until;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guard_backup_snapshot_delete on public.company_backup_snapshots;
create trigger trg_guard_backup_snapshot_delete
before delete on public.company_backup_snapshots
for each row
execute function public.guard_backup_snapshot_delete();
