create or replace function public.create_credit_invoice_from_lines(
  p_original_invoice_id uuid,
  p_line_ids text[],
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_line_ids text[];
  v_requested_count integer;
  v_found_count integer;
  v_original public.invoices;
  v_invoice_id uuid;
  v_invoice_no text;
  v_issue_date date := current_date;
  v_due_date date := current_date;
  v_lines_snapshot jsonb;
  v_result jsonb;
  v_booking jsonb;
  v_subtotal numeric(12,2) := 0;
  v_vat_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_original_line_count integer := 0;
  v_total_credited_line_count integer := 0;
begin
  select coalesce(array_agg(distinct line_id), '{}'::text[])
  into v_requested_line_ids
  from unnest(coalesce(p_line_ids, '{}'::text[])) as line_id;

  v_requested_count := coalesce(array_length(v_requested_line_ids, 1), 0);

  if v_requested_count = 0 then
    raise exception 'At least one invoice line is required';
  end if;

  select * into v_original
  from public.invoices
  where id = p_original_invoice_id
  for update;

  if v_original.id is null then
    raise exception 'Original invoice not found';
  end if;

  if not public.has_finance_write_access(v_original.company_id) then
    raise exception 'Not allowed';
  end if;

  if v_original.kind = 'credit_note' then
    raise exception 'Cannot credit a credit note';
  end if;

  perform public.assert_finance_period_open(v_original.company_id, v_issue_date);

  create temporary table if not exists tmp_credit_invoice_lines (
    seq integer not null,
    line_id text not null,
    title text not null,
    qty numeric(12,2) not null,
    unit_price numeric(12,2) not null,
    vat_rate numeric(12,2) not null,
    line_total numeric(12,2) not null,
    order_id uuid null,
    project_id uuid null
  ) on commit drop;

  truncate table tmp_credit_invoice_lines;

  insert into tmp_credit_invoice_lines (
    seq,
    line_id,
    title,
    qty,
    unit_price,
    vat_rate,
    line_total,
    order_id,
    project_id
  )
  select
    snapshot.ord::integer as seq,
    snapshot.item->>'id' as line_id,
    coalesce(snapshot.item->>'title', '') as title,
    coalesce((snapshot.item->>'qty')::numeric, 0)::numeric(12,2) as qty,
    coalesce((snapshot.item->>'unit_price')::numeric, 0)::numeric(12,2) as unit_price,
    coalesce((snapshot.item->>'vat_rate')::numeric, 0)::numeric(12,2) as vat_rate,
    coalesce((snapshot.item->>'total')::numeric, 0)::numeric(12,2) as line_total,
    nullif(snapshot.item->>'order_id', '')::uuid as order_id,
    nullif(snapshot.item->>'project_id', '')::uuid as project_id
  from jsonb_array_elements(coalesce(v_original.lines_snapshot, '[]'::jsonb)) with ordinality as snapshot(item, ord)
  where coalesce(snapshot.item->>'id', '') = any(v_requested_line_ids);

  select count(*)
  into v_found_count
  from tmp_credit_invoice_lines;

  if v_found_count <> v_requested_count then
    raise exception 'One or more selected invoice lines were not found';
  end if;

  if exists (
    select 1
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.lines_snapshot, '[]'::jsonb)) as row_item
    where i.credit_for_invoice_id = v_original.id
      and i.kind = 'credit_note'
      and i.status <> 'void'
      and coalesce(row_item->>'id', '') = any(v_requested_line_ids)
  ) then
    raise exception 'One or more selected invoice lines are already credited';
  end if;

  select
    round(coalesce(sum(t.line_total), 0)::numeric, 2) * -1,
    round(coalesce(sum(t.line_total * t.vat_rate / 100.0), 0)::numeric, 2) * -1
  into v_subtotal, v_vat_total
  from tmp_credit_invoice_lines t;

  v_total := round((v_subtotal + v_vat_total)::numeric, 2);

  if v_total >= 0 then
    raise exception 'Credit note total must be negative';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.line_id,
        'order_id', t.order_id,
        'project_id', t.project_id,
        'title', t.title,
        'qty', t.qty * -1,
        'unit_price', t.unit_price,
        'vat_rate', t.vat_rate,
        'total', t.line_total * -1
      )
      order by t.seq asc
    ),
    '[]'::jsonb
  ) into v_lines_snapshot
  from tmp_credit_invoice_lines t;

  v_invoice_no := public.next_invoice_number(v_original.company_id);

  v_result := jsonb_build_object(
    'invoice_no', v_invoice_no,
    'status', 'issued',
    'kind', 'credit_note',
    'credit_for_invoice_id', v_original.id,
    'issue_date', v_issue_date,
    'supply_date', v_issue_date,
    'due_date', v_due_date,
    'payment_terms_text', coalesce(v_original.payment_terms_text, 'Kontant'),
    'seller_vat_no', v_original.seller_vat_no,
    'subtotal', v_subtotal,
    'vat_total', v_vat_total,
    'total', v_total,
    'reason', p_reason,
    'selection_mode', 'lines',
    'credit_line_ids', to_jsonb(v_requested_line_ids)
  );

  insert into public.invoices (
    company_id,
    project_id,
    order_id,
    invoice_no,
    kind,
    credit_for_invoice_id,
    status,
    currency,
    issue_date,
    supply_date,
    due_date,
    payment_terms_text,
    seller_vat_no,
    buyer_reference,
    subtotal,
    vat_total,
    total,
    company_snapshot,
    customer_snapshot,
    lines_snapshot,
    rpc_result,
    created_by
  )
  values (
    v_original.company_id,
    v_original.project_id,
    null,
    v_invoice_no,
    'credit_note',
    v_original.id,
    'issued',
    v_original.currency,
    v_issue_date,
    v_issue_date,
    v_due_date,
    coalesce(v_original.payment_terms_text, 'Kontant'),
    v_original.seller_vat_no,
    v_original.buyer_reference,
    v_subtotal,
    v_vat_total,
    v_total,
    v_original.company_snapshot,
    v_original.customer_snapshot,
    coalesce(v_lines_snapshot, '[]'::jsonb),
    v_result,
    auth.uid()
  )
  returning id into v_invoice_id;

  select count(*)
  into v_original_line_count
  from jsonb_array_elements(coalesce(v_original.lines_snapshot, '[]'::jsonb)) as original_item;

  select count(distinct row_item->>'id')
  into v_total_credited_line_count
  from public.invoices i
  cross join lateral jsonb_array_elements(coalesce(i.lines_snapshot, '[]'::jsonb)) as row_item
  where i.credit_for_invoice_id = v_original.id
    and i.kind = 'credit_note'
    and i.status <> 'void';

  if v_original_line_count > 0 and v_total_credited_line_count >= v_original_line_count then
    update public.invoices
    set credited_at = now(),
        credited_by = auth.uid()
    where id = v_original.id;
  end if;

  perform public.log_finance_action(
    v_original.company_id,
    'credit_invoice_lines_created',
    'invoice',
    v_invoice_id,
    jsonb_build_object(
      'credit_invoice_no', v_invoice_no,
      'original_invoice_id', v_original.id,
      'reason', p_reason,
      'credit_line_ids', v_requested_line_ids
    )
  );

  v_booking := public.book_invoice_issue(v_invoice_id);

  return v_result || jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_exists', false,
    'booking', v_booking
  );
end;
$$;

grant execute on function public.create_credit_invoice_from_lines(uuid, text[], text) to authenticated;
