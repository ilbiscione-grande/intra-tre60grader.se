-- A2: VAT logic v2 (25/12/6), improved invoice VAT booking and non-MVP VAT report.

insert into public.chart_of_accounts (company_id, account_no, name, account_type)
select c.id, a.account_no, a.name, 'liability'
from public.companies c
cross join (
  values
    ('2621', 'Utgående moms 12%'),
    ('2631', 'Utgående moms 6%')
) as a(account_no, name)
on conflict (company_id, account_no) do nothing;

create or replace function public.book_invoice_issue(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_verification_result jsonb;
  v_verification_id uuid;
  v_subtotal numeric(12,2);
  v_vat_total numeric(12,2);
  v_total numeric(12,2);
  v_description text;
  v_line jsonb;
  v_rate numeric(5,2);
  v_base numeric(12,2);
  v_base_25 numeric(12,2) := 0;
  v_base_12 numeric(12,2) := 0;
  v_base_6 numeric(12,2) := 0;
  v_vat_25 numeric(12,2) := 0;
  v_vat_12 numeric(12,2) := 0;
  v_vat_6 numeric(12,2) := 0;
  v_vat_diff numeric(12,2) := 0;
  v_output_lines jsonb := '[]'::jsonb;
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

  if coalesce((v_invoice.rpc_result->>'booking_verification_id')::uuid, null) is not null then
    return jsonb_build_object(
      'invoice_id', v_invoice.id,
      'booking_verification_id', (v_invoice.rpc_result->>'booking_verification_id')::uuid,
      'already_booked', true
    );
  end if;

  perform public.assert_finance_period_open(v_invoice.company_id, v_invoice.issue_date);

  v_subtotal := abs(coalesce(v_invoice.subtotal, 0));
  v_vat_total := abs(coalesce(v_invoice.vat_total, 0));
  v_total := abs(coalesce(v_invoice.total, 0));

  if v_total <= 0 then
    raise exception 'Invoice total must be greater than 0 for booking';
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(v_invoice.lines_snapshot, '[]'::jsonb))
  loop
    v_rate := coalesce((v_line->>'vat_rate')::numeric, 0);
    v_base := abs(coalesce((v_line->>'total')::numeric, 0));

    if v_rate >= 24.5 and v_rate <= 25.5 then
      v_base_25 := v_base_25 + v_base;
    elsif v_rate >= 11.5 and v_rate <= 12.5 then
      v_base_12 := v_base_12 + v_base;
    elsif v_rate >= 5.5 and v_rate <= 6.5 then
      v_base_6 := v_base_6 + v_base;
    end if;
  end loop;

  v_vat_25 := round(v_base_25 * 0.25, 2);
  v_vat_12 := round(v_base_12 * 0.12, 2);
  v_vat_6 := round(v_base_6 * 0.06, 2);

  v_vat_diff := round(v_vat_total - (v_vat_25 + v_vat_12 + v_vat_6), 2);
  if v_vat_diff <> 0 then
    if v_base_25 > 0 then
      v_vat_25 := round(v_vat_25 + v_vat_diff, 2);
    elsif v_base_12 > 0 then
      v_vat_12 := round(v_vat_12 + v_vat_diff, 2);
    elsif v_base_6 > 0 then
      v_vat_6 := round(v_vat_6 + v_vat_diff, 2);
    end if;
  end if;

  if v_vat_25 > 0 then
    v_output_lines := v_output_lines || jsonb_build_array(jsonb_build_object('account_no', '2611', 'amount', v_vat_25, 'vat_code', '25'));
  end if;
  if v_vat_12 > 0 then
    v_output_lines := v_output_lines || jsonb_build_array(jsonb_build_object('account_no', '2621', 'amount', v_vat_12, 'vat_code', '12'));
  end if;
  if v_vat_6 > 0 then
    v_output_lines := v_output_lines || jsonb_build_array(jsonb_build_object('account_no', '2631', 'amount', v_vat_6, 'vat_code', '6'));
  end if;

  if v_invoice.kind = 'credit_note' then
    v_description := format('Kreditfaktura %s', v_invoice.invoice_no);

    v_verification_result := public.create_verification_from_wizard(
      jsonb_build_object(
        'company_id', v_invoice.company_id,
        'date', v_invoice.issue_date,
        'description', v_description,
        'total', v_total,
        'source', 'desktop',
        'client_request_id', format('invoice-credit:%s', v_invoice.id),
        'lines', (
          select jsonb_agg(item)
          from (
            select jsonb_build_object('account_no', '3001', 'debit', v_subtotal, 'credit', 0) as item
            union all
            select jsonb_build_object('account_no', vat_line->>'account_no', 'debit', (vat_line->>'amount')::numeric, 'credit', 0, 'vat_code', vat_line->>'vat_code')
            from jsonb_array_elements(v_output_lines) vat_line
            union all
            select jsonb_build_object('account_no', '1510', 'debit', 0, 'credit', v_total)
          ) q
        )
      )
    );
  else
    v_description := format('Faktura %s', v_invoice.invoice_no);

    v_verification_result := public.create_verification_from_wizard(
      jsonb_build_object(
        'company_id', v_invoice.company_id,
        'date', v_invoice.issue_date,
        'description', v_description,
        'total', v_total,
        'source', 'desktop',
        'client_request_id', format('invoice:%s', v_invoice.id),
        'lines', (
          select jsonb_agg(item)
          from (
            select jsonb_build_object('account_no', '1510', 'debit', v_total, 'credit', 0) as item
            union all
            select jsonb_build_object('account_no', '3001', 'debit', 0, 'credit', v_subtotal)
            union all
            select jsonb_build_object('account_no', vat_line->>'account_no', 'debit', 0, 'credit', (vat_line->>'amount')::numeric, 'vat_code', vat_line->>'vat_code')
            from jsonb_array_elements(v_output_lines) vat_line
          ) q
        )
      )
    );
  end if;

  v_verification_id := (v_verification_result->>'verification_id')::uuid;

  update public.invoices
  set rpc_result = coalesce(rpc_result, '{}'::jsonb)
      || jsonb_build_object(
        'booking_verification_id', v_verification_id,
        'booking_result', v_verification_result,
        'vat_breakdown', jsonb_build_object(
          'base_25', v_base_25,
          'base_12', v_base_12,
          'base_6', v_base_6,
          'vat_25', v_vat_25,
          'vat_12', v_vat_12,
          'vat_6', v_vat_6
        )
      )
  where id = v_invoice.id;

  perform public.log_finance_action(
    v_invoice.company_id,
    'invoice_booked',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'kind', v_invoice.kind,
      'verification_id', v_verification_id,
      'vat_breakdown', jsonb_build_object('vat_25', v_vat_25, 'vat_12', v_vat_12, 'vat_6', v_vat_6)
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'booking_verification_id', v_verification_id,
    'already_booked', false,
    'vat_breakdown', jsonb_build_object('vat_25', v_vat_25, 'vat_12', v_vat_12, 'vat_6', v_vat_6)
  );
end;
$$;

create or replace function public.vat_report(company_id uuid, period_start date, period_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_base_25 numeric(12,2) := 0;
  v_sales_base_12 numeric(12,2) := 0;
  v_sales_base_6 numeric(12,2) := 0;
  v_purchase_base_25 numeric(12,2) := 0;
  v_purchase_base_12 numeric(12,2) := 0;
  v_purchase_base_6 numeric(12,2) := 0;
  v_output_25 numeric(12,2) := 0;
  v_output_12 numeric(12,2) := 0;
  v_output_6 numeric(12,2) := 0;
  v_input_vat numeric(12,2) := 0;
  v_unknown_vat_lines integer := 0;
  v_result jsonb;
begin
  if not public.has_finance_access(company_id) then
    raise exception 'Not allowed';
  end if;

  select
    coalesce(sum(case when vl.vat_code = '25' and vl.account_no like '3%' then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '12' and vl.account_no like '3%' then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '6' and vl.account_no like '3%' then vl.credit - vl.debit else 0 end), 0),

    coalesce(sum(case when vl.vat_code = '25' and (vl.account_no like '4%' or vl.account_no like '5%' or vl.account_no like '6%' or vl.account_no like '7%') then vl.debit - vl.credit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '12' and (vl.account_no like '4%' or vl.account_no like '5%' or vl.account_no like '6%' or vl.account_no like '7%') then vl.debit - vl.credit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '6' and (vl.account_no like '4%' or vl.account_no like '5%' or vl.account_no like '6%' or vl.account_no like '7%') then vl.debit - vl.credit else 0 end), 0),

    coalesce(sum(case when vl.vat_code = '25' and vl.account_no = '2611' then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '12' and vl.account_no = '2621' then vl.credit - vl.debit else 0 end), 0),
    coalesce(sum(case when vl.vat_code = '6' and vl.account_no = '2631' then vl.credit - vl.debit else 0 end), 0),

    coalesce(sum(case when vl.account_no like '264%' then vl.debit - vl.credit else 0 end), 0),

    coalesce(count(*) filter (where vl.vat_code is not null and vl.vat_code not in ('0', '6', '12', '25')), 0)
  into
    v_sales_base_25, v_sales_base_12, v_sales_base_6,
    v_purchase_base_25, v_purchase_base_12, v_purchase_base_6,
    v_output_25, v_output_12, v_output_6,
    v_input_vat,
    v_unknown_vat_lines
  from public.verification_lines vl
  join public.verifications v on v.id = vl.verification_id
  where v.company_id = company_id
    and v.status = 'booked'
    and v.date between period_start and period_end;

  v_result := jsonb_build_object(
    'company_id', company_id,
    'period_start', period_start,
    'period_end', period_end,
    'boxes', jsonb_build_object(
      '05', round(v_sales_base_25, 2),
      '06', round(v_sales_base_12, 2),
      '07', round(v_sales_base_6, 2),
      '10', round(v_output_25, 2),
      '11', round(v_output_12, 2),
      '12', round(v_output_6, 2),
      '20', round(v_purchase_base_25, 2),
      '21', round(v_purchase_base_12, 2),
      '22', round(v_purchase_base_6, 2),
      '30', round(v_output_25 + v_output_12 + v_output_6, 2),
      '48', round(v_input_vat, 2),
      '49', round((v_output_25 + v_output_12 + v_output_6) - v_input_vat, 2)
    ),
    'totals', jsonb_build_object(
      'utgaende_moms_25', round(v_output_25, 2),
      'utgaende_moms_12', round(v_output_12, 2),
      'utgaende_moms_6', round(v_output_6, 2),
      'utgaende_moms_total', round(v_output_25 + v_output_12 + v_output_6, 2),
      'ingaende_moms', round(v_input_vat, 2),
      'moms_att_betala_eller_fa_tillbaka', round((v_output_25 + v_output_12 + v_output_6) - v_input_vat, 2)
    ),
    'quality', jsonb_build_object(
      'unknown_vat_lines', v_unknown_vat_lines,
      'ok', v_unknown_vat_lines = 0
    )
  );

  return v_result;
end;
$$;

grant execute on function public.book_invoice_issue(uuid) to authenticated;
grant execute on function public.vat_report(uuid, date, date) to authenticated;
