-- B7: Refined permissions per action (governance vs bookkeeping)

create or replace function public.has_company_admin_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_role(p_company_id) = 'admin';
$$;

grant execute on function public.has_company_admin_access(uuid) to authenticated;

create or replace function public.can_company_perform_action(
  p_company_id uuid,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_action = 'finance.read' then public.app_user_role(p_company_id) in ('finance', 'admin', 'auditor')
    when p_action = 'finance.write' then public.app_user_role(p_company_id) in ('finance', 'admin')
    when p_action = 'finance.governance' then public.app_user_role(p_company_id) = 'admin'
    when p_action = 'members.manage' then public.app_user_role(p_company_id) = 'admin'
    else false
  end;
$$;

grant execute on function public.can_company_perform_action(uuid, text) to authenticated;

-- Backup snapshot creation should be governance-only (admin).
drop policy if exists company_backup_snapshots_insert_finance on public.company_backup_snapshots;
drop policy if exists company_backup_snapshots_insert_admin on public.company_backup_snapshots;
create policy company_backup_snapshots_insert_admin on public.company_backup_snapshots
for insert
with check (public.has_company_admin_access(company_id));

create or replace function public.set_period_lock(p_company_id uuid, p_locked_until date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_company_perform_action(p_company_id, 'finance.governance') then
    raise exception 'Admin required';
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

  if not public.can_company_perform_action(p_company_id, 'finance.governance') then
    raise exception 'Admin required';
  end if;

  if p_period_start is not null and p_period_end is not null and p_period_end < p_period_start then
    raise exception 'Invalid period';
  end if;

  select retention_years
  into v_retention_years
  from public.company_retention_policies rp
  where rp.company_id = p_company_id;

  v_retention_years := coalesce(v_retention_years, 7);
  v_retain_until := (current_date + make_interval(years => v_retention_years));

  v_payload := public.backup_payload_for_company(p_company_id, p_period_start, p_period_end);
  v_checksum := encode(public.digest(v_payload::text, 'sha256'), 'hex');

  v_counts := jsonb_build_object(
    'chart_of_accounts', (select count(*) from public.chart_of_accounts ca where ca.company_id = p_company_id),
    'customers', (select count(*) from public.customers cu where cu.company_id = p_company_id),
    'projects', (select count(*) from public.projects p where p.company_id = p_company_id),
    'orders', (select count(*) from public.orders o where o.company_id = p_company_id),
    'order_lines', (select count(*) from public.order_lines ol where ol.company_id = p_company_id),
    'verifications', (select count(*) from public.verifications v where v.company_id = p_company_id and (p_period_start is null or v.date >= p_period_start) and (p_period_end is null or v.date <= p_period_end)),
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
    'ledger_entries', (select count(*) from public.ledger_entries le where le.company_id = p_company_id and (p_period_start is null or le.entry_date >= p_period_start) and (p_period_end is null or le.entry_date <= p_period_end)),
    'invoices', (select count(*) from public.invoices i where i.company_id = p_company_id and (p_period_start is null or i.issue_date >= p_period_start) and (p_period_end is null or i.issue_date <= p_period_end)),
    'invoice_payments', (select count(*) from public.invoice_payments ip where ip.company_id = p_company_id and (p_period_start is null or ip.payment_date >= p_period_start) and (p_period_end is null or ip.payment_date <= p_period_end)),
    'invoice_reminders', (select count(*) from public.invoice_reminders ir where ir.company_id = p_company_id and (p_period_start is null or ir.sent_at::date >= p_period_start) and (p_period_end is null or ir.sent_at::date <= p_period_end)),
    'invoice_history', (select count(*) from public.invoice_history ih where ih.company_id = p_company_id),
    'finance_audit_log', (select count(*) from public.finance_audit_log fal where fal.company_id = p_company_id and (p_period_start is null or fal.created_at::date >= p_period_start) and (p_period_end is null or fal.created_at::date <= p_period_end))
  );

  insert into public.company_backup_snapshots as cbs (
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
  returning cbs.id, cbs.created_at into v_snapshot_id, v_created_at;

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

  if not public.can_company_perform_action(v_snapshot.company_id, 'finance.governance') then
    raise exception 'Admin required';
  end if;

  for v_key in select unnest(v_required_keys)
  loop
    if not (v_snapshot.payload ? v_key) then
      v_missing := array_append(v_missing, v_key);
      v_ok := false;
    end if;
  end loop;

  v_table := coalesce(v_snapshot.payload->'tables', '{}'::jsonb);

  v_checksum := encode(public.digest(v_snapshot.payload::text, 'sha256'), 'hex');
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
