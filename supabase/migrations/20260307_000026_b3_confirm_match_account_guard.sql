-- B3 hotfix: gör confirm-bankmatch robust genom att alltid säkerställa aktiva betalningskonton.

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

  -- Säkerställ att konton som register_invoice_payment använder finns och är aktiva.
  insert into public.chart_of_accounts (company_id, account_no, name, account_type, active)
  values
    (v_match.company_id, '1930', 'Företagskonto', 'asset', true),
    (v_match.company_id, '1510', 'Kundfordringar', 'asset', true)
  on conflict (company_id, account_no)
  do update set
    active = true,
    name = excluded.name,
    account_type = excluded.account_type;

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

grant execute on function public.confirm_bank_transaction_match(uuid, text) to authenticated;
