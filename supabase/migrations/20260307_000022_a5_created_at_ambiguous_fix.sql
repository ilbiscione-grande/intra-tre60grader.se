-- A5 hotfix 2: disambiguate created_at references in backup snapshot function.

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
