-- A3: Hardening period lock + accounting integrity in finance write flows.

create or replace function public.assert_invoice_date_integrity(
  p_issue_date date,
  p_due_date date,
  p_supply_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_issue_date is null then
    raise exception 'issue_date is required';
  end if;

  if p_due_date is null then
    raise exception 'due_date is required';
  end if;

  if p_supply_date is null then
    p_supply_date := p_issue_date;
  end if;

  if p_due_date < p_issue_date then
    raise exception 'due_date cannot be earlier than issue_date';
  end if;

  if p_supply_date > p_due_date then
    raise exception 'supply_date cannot be later than due_date';
  end if;
end;
$$;

grant execute on function public.assert_invoice_date_integrity(date, date, date) to authenticated;

create or replace function public.guard_invoice_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.assert_invoice_date_integrity(new.issue_date, new.due_date, new.supply_date);

    if new.status not in ('issued', 'sent', 'paid', 'void') then
      raise exception 'Invalid invoice status';
    end if;

    if coalesce(new.total, 0) < 0 and coalesce(new.kind, 'invoice') = 'invoice' then
      raise exception 'Regular invoice cannot have negative total';
    end if;

    if coalesce(new.total, 0) > 0 and coalesce(new.kind, 'invoice') = 'credit_note' then
      raise exception 'Credit invoice cannot have positive total';
    end if;

    perform public.assert_finance_period_open(new.company_id, coalesce(new.issue_date, current_date));
  elsif tg_op = 'UPDATE' then
    perform public.assert_invoice_date_integrity(new.issue_date, new.due_date, new.supply_date);

    if old.status = 'void' and new.status is distinct from 'void' then
      raise exception 'Void invoice cannot be reopened';
    end if;

    if old.kind = 'credit_note' and new.kind is distinct from old.kind then
      raise exception 'Invoice kind is immutable';
    end if;

    if (old.issue_date is distinct from new.issue_date)
       or (old.total is distinct from new.total)
       or (old.subtotal is distinct from new.subtotal)
       or (old.vat_total is distinct from new.vat_total)
    then
      perform public.assert_finance_period_open(new.company_id, coalesce(new.issue_date, current_date));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_integrity on public.invoices;
create trigger trg_guard_invoice_integrity
before insert or update on public.invoices
for each row
execute function public.guard_invoice_integrity();

create or replace function public.guard_invoice_payments_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.company_id is distinct from new.company_id
      or old.invoice_id is distinct from new.invoice_id
      or old.amount is distinct from new.amount
      or old.payment_date is distinct from new.payment_date
      or old.method is distinct from new.method
      or old.reference is distinct from new.reference
      or old.note is distinct from new.note
      or old.direction is distinct from new.direction
      or old.attachment_path is distinct from new.attachment_path
      or old.overpayment_amount is distinct from new.overpayment_amount
    then
      raise exception 'Invoice payment core fields are immutable. Create reversal/refund instead.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Invoice payments are immutable. Use reverse flow instead.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_payments_immutability on public.invoice_payments;
create trigger trg_guard_invoice_payments_immutability
before update or delete on public.invoice_payments
for each row
execute function public.guard_invoice_payments_immutability();

create or replace function public.guard_invoice_payment_insert_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_finance_period_open(new.company_id, new.payment_date);
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_payment_insert_period_lock on public.invoice_payments;
create trigger trg_guard_invoice_payment_insert_period_lock
before insert on public.invoice_payments
for each row
execute function public.guard_invoice_payment_insert_period_lock();

create or replace function public.guard_invoice_reminder_insert_period_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_finance_period_open(new.company_id, new.sent_at::date);
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_reminder_insert_period_lock on public.invoice_reminders;
create trigger trg_guard_invoice_reminder_insert_period_lock
before insert on public.invoice_reminders
for each row
execute function public.guard_invoice_reminder_insert_period_lock();

create or replace function public.mark_invoice_collection_stage(
  p_invoice_id uuid,
  p_stage text,
  p_fee numeric default 0,
  p_note text default null,
  p_sent_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_stage text := coalesce(nullif(trim(p_stage), ''), 'none');
  v_reminder_id uuid;
  v_sent_at timestamptz := coalesce(p_sent_at, now());
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

  if v_stage not in ('none', 'reminder_1', 'reminder_2', 'inkasso', 'dispute', 'closed') then
    raise exception 'Invalid collection stage';
  end if;

  if v_stage in ('reminder_1', 'reminder_2', 'inkasso') then
    perform public.assert_finance_period_open(v_invoice.company_id, v_sent_at::date);
  end if;

  update public.invoices
  set collection_stage = v_stage,
      collection_note = case when p_note is null then collection_note else nullif(trim(p_note), '') end,
      reminder_1_sent_at = case when v_stage = 'reminder_1' then v_sent_at else reminder_1_sent_at end,
      reminder_2_sent_at = case when v_stage = 'reminder_2' then v_sent_at else reminder_2_sent_at end,
      inkasso_sent_at = case when v_stage = 'inkasso' then v_sent_at else inkasso_sent_at end
  where id = v_invoice.id;

  if v_stage in ('reminder_1', 'reminder_2', 'inkasso') then
    insert into public.invoice_reminders (
      company_id,
      invoice_id,
      stage,
      sent_at,
      fee,
      note,
      created_by
    )
    values (
      v_invoice.company_id,
      v_invoice.id,
      v_stage,
      v_sent_at,
      greatest(coalesce(p_fee, 0), 0),
      nullif(trim(p_note), ''),
      auth.uid()
    )
    returning id into v_reminder_id;
  end if;

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_collection_stage_changed',
    'invoice',
    v_invoice.id,
    jsonb_build_object('stage', v_stage, 'fee', p_fee, 'note', p_note, 'reminder_id', v_reminder_id)
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'collection_stage', v_stage,
    'reminder_id', v_reminder_id
  );
end;
$$;

grant execute on function public.mark_invoice_collection_stage(uuid, text, numeric, text, timestamptz) to authenticated;
