-- C1: invoice flow end-to-end (send, delivery status, versioning)

create table if not exists public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  version_no integer not null,
  reason text,
  source text not null default 'system',
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (invoice_id, version_no)
);

create index if not exists invoice_versions_company_invoice_created_idx
  on public.invoice_versions(company_id, invoice_id, created_at desc);

create table if not exists public.invoice_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'manual', 'api')),
  recipient text,
  subject text,
  message text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider text,
  provider_message_id text,
  provider_response jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_deliveries_company_invoice_created_idx
  on public.invoice_deliveries(company_id, invoice_id, created_at desc);

create index if not exists invoice_deliveries_company_status_created_idx
  on public.invoice_deliveries(company_id, status, created_at desc);

alter table public.invoice_versions enable row level security;
alter table public.invoice_deliveries enable row level security;

drop policy if exists invoice_versions_select_finance on public.invoice_versions;
create policy invoice_versions_select_finance on public.invoice_versions
for select using (public.has_finance_access(company_id));

drop policy if exists invoice_versions_insert_finance on public.invoice_versions;
create policy invoice_versions_insert_finance on public.invoice_versions
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists invoice_deliveries_select_finance on public.invoice_deliveries;
create policy invoice_deliveries_select_finance on public.invoice_deliveries
for select using (public.has_finance_access(company_id));

drop policy if exists invoice_deliveries_insert_finance on public.invoice_deliveries;
create policy invoice_deliveries_insert_finance on public.invoice_deliveries
for insert with check (public.has_finance_write_access(company_id));

drop policy if exists invoice_deliveries_update_finance on public.invoice_deliveries;
create policy invoice_deliveries_update_finance on public.invoice_deliveries
for update using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

grant select, insert on public.invoice_versions to authenticated;
grant select, insert, update on public.invoice_deliveries to authenticated;

create or replace function public.create_invoice_version_snapshot(
  p_invoice_id uuid,
  p_reason text default null,
  p_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_next_version integer;
  v_snapshot jsonb;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  select coalesce(max(iv.version_no), 0) + 1
  into v_next_version
  from public.invoice_versions iv
  where iv.invoice_id = v_invoice.id;

  v_snapshot := jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'captured_at', now()
  );

  insert into public.invoice_versions (
    company_id,
    invoice_id,
    version_no,
    reason,
    source,
    snapshot,
    created_by
  ) values (
    v_invoice.company_id,
    v_invoice.id,
    v_next_version,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'system'),
    v_snapshot,
    auth.uid()
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'version_no', v_next_version
  );
end;
$$;

grant execute on function public.create_invoice_version_snapshot(uuid, text, text) to authenticated;

create or replace function public.send_invoice(
  p_invoice_id uuid,
  p_channel text default 'email',
  p_recipient text default null,
  p_subject text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_customer jsonb;
  v_channel text;
  v_recipient text;
  v_subject text;
  v_delivery_id uuid;
  v_version jsonb;
begin
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;

  if not public.has_finance_write_access(v_invoice.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Cannot send void invoice';
  end if;

  if v_invoice.kind = 'credit_note' and v_invoice.status = 'paid' then
    raise exception 'Credit note already closed';
  end if;

  v_channel := lower(coalesce(nullif(trim(p_channel), ''), 'email'));
  if v_channel not in ('email', 'manual', 'api') then
    raise exception 'Unsupported channel';
  end if;

  v_customer := coalesce(v_invoice.customer_snapshot, '{}'::jsonb);
  v_recipient := nullif(trim(coalesce(p_recipient, v_customer->>'billing_email', '')), '');

  if v_channel = 'email' and v_recipient is null then
    raise exception 'Recipient email is required';
  end if;

  v_subject := coalesce(nullif(trim(coalesce(p_subject, '')), ''), format('Faktura %s', v_invoice.invoice_no));

  insert into public.invoice_deliveries (
    company_id,
    invoice_id,
    channel,
    recipient,
    subject,
    message,
    status,
    provider,
    provider_message_id,
    provider_response,
    sent_at,
    created_by
  ) values (
    v_invoice.company_id,
    v_invoice.id,
    v_channel,
    v_recipient,
    v_subject,
    nullif(trim(coalesce(p_message, '')), ''),
    'sent',
    'internal-mock',
    gen_random_uuid()::text,
    jsonb_build_object('mock', true),
    now(),
    auth.uid()
  )
  returning id into v_delivery_id;

  if v_invoice.status = 'issued' then
    update public.invoices
    set status = 'sent'
    where id = v_invoice.id;
  end if;

  v_version := public.create_invoice_version_snapshot(
    v_invoice.id,
    'invoice_sent',
    'send_invoice'
  );

  insert into public.invoice_history (
    company_id,
    project_id,
    order_id,
    summary,
    rpc_result,
    created_by
  )
  values (
    v_invoice.company_id,
    v_invoice.project_id,
    v_invoice.order_id,
    format('Faktura skickad (%s) till %s', v_channel, coalesce(v_recipient, '-')),
    jsonb_build_object(
      'event', 'invoice_sent',
      'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no,
      'delivery_id', v_delivery_id,
      'channel', v_channel,
      'recipient', v_recipient
    ),
    auth.uid()
  );

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_sent',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'delivery_id', v_delivery_id,
      'channel', v_channel,
      'recipient', v_recipient,
      'version_no', v_version->>'version_no'
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'delivery_id', v_delivery_id,
    'status', 'sent',
    'channel', v_channel,
    'recipient', v_recipient,
    'version', v_version
  );
end;
$$;

grant execute on function public.send_invoice(uuid, text, text, text, text) to authenticated;

create or replace function public.update_invoice_delivery_status(
  p_delivery_id uuid,
  p_status text,
  p_provider_response jsonb default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.invoice_deliveries;
  v_status text;
begin
  select * into v_delivery
  from public.invoice_deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'Delivery not found';
  end if;

  if not public.has_finance_write_access(v_delivery.company_id) then
    raise exception 'Not allowed';
  end if;

  v_status := lower(coalesce(nullif(trim(p_status), ''), ''));
  if v_status not in ('queued', 'sent', 'delivered', 'failed') then
    raise exception 'Invalid delivery status';
  end if;

  update public.invoice_deliveries
  set
    status = v_status,
    provider_response = coalesce(p_provider_response, provider_response),
    delivered_at = case when v_status = 'delivered' then now() else delivered_at end,
    failed_at = case when v_status = 'failed' then now() else failed_at end,
    failure_reason = case when v_status = 'failed' then nullif(trim(coalesce(p_failure_reason, '')), '') else failure_reason end
  where id = v_delivery.id;

  perform public.log_finance_action(
    v_delivery.company_id,
    'invoice_delivery_status_updated',
    'invoice_delivery',
    v_delivery.id,
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('delivery_id', v_delivery.id, 'status', v_status);
end;
$$;

grant execute on function public.update_invoice_delivery_status(uuid, text, jsonb, text) to authenticated;

-- Backfill at least one version per invoice.
insert into public.invoice_versions (company_id, invoice_id, version_no, reason, source, snapshot, created_by)
select
  i.company_id,
  i.id,
  1,
  'initial_backfill',
  'migration',
  jsonb_build_object('invoice', to_jsonb(i), 'captured_at', now()),
  i.created_by
from public.invoices i
where not exists (
  select 1 from public.invoice_versions iv where iv.invoice_id = i.id
);

create or replace function public.capture_invoice_version_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version integer;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_reason := 'invoice_created';
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_reason := 'status_changed';
    elsif old.attachment_path is distinct from new.attachment_path then
      v_reason := 'attachment_changed';
    elsif old.collection_stage is distinct from new.collection_stage then
      v_reason := 'collection_stage_changed';
    else
      v_reason := 'invoice_updated';
    end if;
  else
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));

  select coalesce(max(iv.version_no), 0) + 1
  into v_next_version
  from public.invoice_versions iv
  where iv.invoice_id = new.id;

  insert into public.invoice_versions (
    company_id,
    invoice_id,
    version_no,
    reason,
    source,
    snapshot,
    created_by
  )
  values (
    new.company_id,
    new.id,
    v_next_version,
    v_reason,
    'trigger',
    jsonb_build_object('invoice', to_jsonb(new), 'captured_at', now()),
    auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_capture_invoice_version_on_insert on public.invoices;
create trigger trg_capture_invoice_version_on_insert
after insert on public.invoices
for each row
execute function public.capture_invoice_version_on_change();

drop trigger if exists trg_capture_invoice_version_on_update on public.invoices;
create trigger trg_capture_invoice_version_on_update
after update on public.invoices
for each row
when (
  old.status is distinct from new.status
  or old.attachment_path is distinct from new.attachment_path
  or old.collection_stage is distinct from new.collection_stage
  or old.collection_note is distinct from new.collection_note
  or old.reminder_1_sent_at is distinct from new.reminder_1_sent_at
  or old.reminder_2_sent_at is distinct from new.reminder_2_sent_at
  or old.inkasso_sent_at is distinct from new.inkasso_sent_at
  or old.supply_date is distinct from new.supply_date
  or old.due_date is distinct from new.due_date
  or old.payment_terms_text is distinct from new.payment_terms_text
  or old.buyer_reference is distinct from new.buyer_reference
)
execute function public.capture_invoice_version_on_change();
