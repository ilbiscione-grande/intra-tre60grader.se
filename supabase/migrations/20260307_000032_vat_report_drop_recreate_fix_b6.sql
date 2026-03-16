-- Hotfix: vat_report with unchanged parameter names (company_id, period_start, period_end)
-- but fully qualified parameter references to avoid ambiguity.

drop function if exists public.vat_report(uuid, date, date);

create or replace function public.vat_report(
  company_id uuid,
  period_start date,
  period_end date
)
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
  if not public.has_finance_access(vat_report.company_id) then
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
  where v.company_id = vat_report.company_id
    and v.status = 'booked'
    and v.date between vat_report.period_start and vat_report.period_end;

  v_result := jsonb_build_object(
    'company_id', vat_report.company_id,
    'period_start', vat_report.period_start,
    'period_end', vat_report.period_end,
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

grant execute on function public.vat_report(uuid, date, date) to authenticated;
