-- B3: Automatisk bankavstämning (import + matchning)

create table if not exists public.bank_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null default 'csv',
  file_name text,
  rows_total integer not null default 0,
  rows_inserted integer not null default 0,
  rows_duplicates integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now()
);

create index if not exists bank_import_batches_company_imported_idx
  on public.bank_import_batches(company_id, imported_at desc);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  batch_id uuid references public.bank_import_batches(id) on delete set null,
  booking_date date not null,
  value_date date,
  amount numeric(12,2) not null,
  currency text not null default 'SEK',
  description text not null default '',
  counterparty text,
  reference text,
  external_id text,
  status text not null default 'new' check (status in ('new', 'suggested', 'matched', 'ignored')),
  created_at timestamptz not null default now()
);

create unique index if not exists bank_transactions_company_external_unique
  on public.bank_transactions(company_id, external_id);

create index if not exists bank_transactions_company_booking_idx
  on public.bank_transactions(company_id, booking_date desc, created_at desc);

create index if not exists bank_transactions_company_status_idx
  on public.bank_transactions(company_id, status, booking_date desc);

create table if not exists public.bank_transaction_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,
  match_type text not null check (match_type in ('invoice_payment')),
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_payment_id uuid references public.invoice_payments(id) on delete set null,
  confidence numeric(5,2) not null default 0,
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index if not exists bank_tx_match_active_unique
  on public.bank_transaction_matches(bank_transaction_id)
  where status in ('suggested', 'confirmed');

create index if not exists bank_tx_matches_company_status_idx
  on public.bank_transaction_matches(company_id, status, created_at desc);

alter table public.bank_import_batches enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_transaction_matches enable row level security;

drop policy if exists bank_import_batches_select_finance on public.bank_import_batches;
create policy bank_import_batches_select_finance on public.bank_import_batches
for select
using (public.has_finance_access(company_id));

drop policy if exists bank_import_batches_insert_finance on public.bank_import_batches;
create policy bank_import_batches_insert_finance on public.bank_import_batches
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists bank_transactions_select_finance on public.bank_transactions;
create policy bank_transactions_select_finance on public.bank_transactions
for select
using (public.has_finance_access(company_id));

drop policy if exists bank_transactions_insert_finance on public.bank_transactions;
create policy bank_transactions_insert_finance on public.bank_transactions
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists bank_transactions_update_finance on public.bank_transactions;
create policy bank_transactions_update_finance on public.bank_transactions
for update
using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

drop policy if exists bank_tx_matches_select_finance on public.bank_transaction_matches;
create policy bank_tx_matches_select_finance on public.bank_transaction_matches
for select
using (public.has_finance_access(company_id));

drop policy if exists bank_tx_matches_insert_finance on public.bank_transaction_matches;
create policy bank_tx_matches_insert_finance on public.bank_transaction_matches
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists bank_tx_matches_update_finance on public.bank_transaction_matches;
create policy bank_tx_matches_update_finance on public.bank_transaction_matches
for update
using (public.has_finance_write_access(company_id))
with check (public.has_finance_write_access(company_id));

grant select, insert, update on public.bank_import_batches to authenticated;
grant select, insert, update on public.bank_transactions to authenticated;
grant select, insert, update on public.bank_transaction_matches to authenticated;

create or replace function public.import_bank_transactions(
  p_company_id uuid,
  p_rows jsonb,
  p_source text default 'csv',
  p_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_row jsonb;
  v_booking_date date;
  v_value_date date;
  v_amount numeric(12,2);
  v_currency text;
  v_description text;
  v_counterparty text;
  v_reference text;
  v_external_id text;
  v_total integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_row_count integer := 0;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_write_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  insert into public.bank_import_batches (
    company_id, source, file_name, imported_by
  ) values (
    p_company_id, coalesce(nullif(trim(p_source), ''), 'csv'), nullif(trim(coalesce(p_file_name, '')), ''), auth.uid()
  ) returning id into v_batch_id;

  for v_row in
    select value
    from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;

    begin
      v_booking_date := coalesce(
        nullif(v_row->>'booking_date', '')::date,
        nullif(v_row->>'date', '')::date
      );

      v_value_date := nullif(v_row->>'value_date', '')::date;
      v_amount := round((v_row->>'amount')::numeric, 2);
      v_currency := upper(coalesce(nullif(trim(v_row->>'currency'), ''), 'SEK'));
      v_description := coalesce(nullif(trim(v_row->>'description'), ''), nullif(trim(v_row->>'text'), ''), 'Banktransaktion');
      v_counterparty := nullif(trim(v_row->>'counterparty'), '');
      v_reference := nullif(trim(v_row->>'reference'), '');
      v_external_id := nullif(trim(v_row->>'external_id'), '');

      if v_booking_date is null then
        raise exception 'booking_date missing';
      end if;

      insert into public.bank_transactions (
        company_id,
        batch_id,
        booking_date,
        value_date,
        amount,
        currency,
        description,
        counterparty,
        reference,
        external_id,
        status
      ) values (
        p_company_id,
        v_batch_id,
        v_booking_date,
        v_value_date,
        v_amount,
        v_currency,
        v_description,
        v_counterparty,
        v_reference,
        v_external_id,
        'new'
      )
      on conflict (company_id, external_id)
      do nothing;

      get diagnostics v_row_count = row_count;
      if v_row_count = 1 then
        v_inserted := v_inserted + 1;
      else
        v_duplicates := v_duplicates + 1;
      end if;
    exception
      when others then
        v_duplicates := v_duplicates + 1;
    end;
  end loop;

  update public.bank_import_batches
  set rows_total = v_total,
      rows_inserted = v_inserted,
      rows_duplicates = v_duplicates,
      meta = jsonb_build_object('processed_at', now())
  where id = v_batch_id;

  perform public.log_finance_action(
    p_company_id,
    'bank.import',
    'bank_import_batch',
    v_batch_id,
    jsonb_build_object(
      'rows_total', v_total,
      'rows_inserted', v_inserted,
      'rows_duplicates', v_duplicates,
      'source', p_source,
      'file_name', p_file_name
    )
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'rows_total', v_total,
    'rows_inserted', v_inserted,
    'rows_duplicates', v_duplicates
  );
end;
$$;

create or replace function public.auto_match_bank_transactions(
  p_company_id uuid,
  p_days_tolerance integer default 5,
  p_amount_tolerance numeric default 1.00
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.bank_transactions;
  v_invoice public.invoices;
  v_suggested integer := 0;
  v_checked integer := 0;
  v_amount_diff numeric(12,2);
  v_day_diff integer;
  v_confidence numeric(5,2);
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if not public.has_finance_write_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  for v_tx in
    select *
    from public.bank_transactions bt
    where bt.company_id = p_company_id
      and bt.status in ('new', 'suggested')
      and bt.amount > 0
      and not exists (
        select 1
        from public.bank_transaction_matches m
        where m.bank_transaction_id = bt.id
          and m.status = 'confirmed'
      )
    order by bt.booking_date asc, bt.created_at asc
    limit 500
  loop
    v_checked := v_checked + 1;

    delete from public.bank_transaction_matches
    where bank_transaction_id = v_tx.id
      and status = 'suggested';

    select i.*
    into v_invoice
    from public.invoices i
    where i.company_id = p_company_id
      and i.status in ('issued', 'sent')
      and abs(i.total - v_tx.amount) <= p_amount_tolerance
      and abs((coalesce(i.due_date, i.issue_date) - v_tx.booking_date)) <= p_days_tolerance
    order by
      abs(i.total - v_tx.amount) asc,
      abs((coalesce(i.due_date, i.issue_date) - v_tx.booking_date)) asc,
      i.issue_date desc
    limit 1;

    if v_invoice.id is null then
      update public.bank_transactions
      set status = 'new'
      where id = v_tx.id;
      continue;
    end if;

    v_amount_diff := abs(v_invoice.total - v_tx.amount);
    v_day_diff := abs((coalesce(v_invoice.due_date, v_invoice.issue_date) - v_tx.booking_date));

    v_confidence := round(
      greatest(
        1,
        100
        - least(70, (v_amount_diff / greatest(p_amount_tolerance, 0.01)) * 70)
        - least(30, (v_day_diff::numeric / greatest(p_days_tolerance, 1)) * 30)
      )::numeric,
      2
    );

    insert into public.bank_transaction_matches (
      company_id,
      bank_transaction_id,
      match_type,
      invoice_id,
      confidence,
      status,
      reason,
      created_by
    ) values (
      p_company_id,
      v_tx.id,
      'invoice_payment',
      v_invoice.id,
      v_confidence,
      'suggested',
      'Belopp och datum matchar inom tolerans',
      auth.uid()
    );

    update public.bank_transactions
    set status = 'suggested'
    where id = v_tx.id;

    v_suggested := v_suggested + 1;
  end loop;

  perform public.log_finance_action(
    p_company_id,
    'bank.auto_match',
    'bank_transactions',
    null,
    jsonb_build_object(
      'checked', v_checked,
      'suggested', v_suggested,
      'days_tolerance', p_days_tolerance,
      'amount_tolerance', p_amount_tolerance
    )
  );

  return jsonb_build_object('checked', v_checked, 'suggested', v_suggested);
end;
$$;

create or replace function public.confirm_bank_transaction_match(
  p_match_id uuid,
  p_payment_method text default 'bank'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.bank_transaction_matches;
  v_tx public.bank_transactions;
  v_result jsonb;
  v_payment_id uuid;
begin
  if p_match_id is null then
    raise exception 'match_id is required';
  end if;

  select * into v_match
  from public.bank_transaction_matches m
  where m.id = p_match_id
  for update;

  if v_match.id is null then
    raise exception 'Match not found';
  end if;

  if not public.has_finance_write_access(v_match.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_match.status <> 'suggested' then
    raise exception 'Only suggested matches can be confirmed';
  end if;

  if v_match.invoice_id is null then
    raise exception 'No invoice linked to this match';
  end if;

  select * into v_tx
  from public.bank_transactions bt
  where bt.id = v_match.bank_transaction_id
  for update;

  if v_tx.id is null then
    raise exception 'Bank transaction not found';
  end if;

  v_result := public.register_invoice_payment(
    v_match.invoice_id,
    v_tx.amount,
    v_tx.booking_date,
    coalesce(nullif(trim(p_payment_method), ''), 'bank'),
    v_tx.reference,
    format('Bankmatch %s', v_tx.id),
    false,
    null
  );

  v_payment_id := nullif(v_result->>'payment_id', '')::uuid;

  update public.bank_transaction_matches
  set status = 'confirmed',
      invoice_payment_id = v_payment_id,
      confirmed_at = now()
  where id = v_match.id;

  update public.bank_transactions
  set status = 'matched'
  where id = v_tx.id;

  perform public.log_finance_action(
    v_match.company_id,
    'bank.match_confirmed',
    'bank_transaction_match',
    v_match.id,
    jsonb_build_object(
      'bank_transaction_id', v_tx.id,
      'invoice_id', v_match.invoice_id,
      'invoice_payment_id', v_payment_id
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'bank_transaction_id', v_tx.id,
    'invoice_id', v_match.invoice_id,
    'invoice_payment_id', v_payment_id,
    'payment_result', v_result
  );
end;
$$;

create or replace function public.reject_bank_transaction_match(
  p_match_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.bank_transaction_matches;
begin
  if p_match_id is null then
    raise exception 'match_id is required';
  end if;

  select * into v_match
  from public.bank_transaction_matches m
  where m.id = p_match_id
  for update;

  if v_match.id is null then
    raise exception 'Match not found';
  end if;

  if not public.has_finance_write_access(v_match.company_id) then
    raise exception 'Not allowed';
  end if;

  update public.bank_transaction_matches
  set status = 'rejected',
      reason = coalesce(nullif(trim(p_reason), ''), reason)
  where id = v_match.id;

  update public.bank_transactions
  set status = 'new'
  where id = v_match.bank_transaction_id
    and status <> 'matched';

  perform public.log_finance_action(
    v_match.company_id,
    'bank.match_rejected',
    'bank_transaction_match',
    v_match.id,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('match_id', v_match.id, 'status', 'rejected');
end;
$$;

grant execute on function public.import_bank_transactions(uuid, jsonb, text, text) to authenticated;
grant execute on function public.auto_match_bank_transactions(uuid, integer, numeric) to authenticated;
grant execute on function public.confirm_bank_transaction_match(uuid, text) to authenticated;
grant execute on function public.reject_bank_transaction_match(uuid, text) to authenticated;
