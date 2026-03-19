-- Make project finance summary work with combined invoices by deriving
-- project revenue from invoice line snapshots instead of invoice.project_id.

create or replace function public.project_finance_summary(
  p_company_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.project_finance_plans;
  v_actual_revenue numeric(12,2) := 0;
  v_actual_cost numeric(12,2) := 0;
  v_budget_revenue numeric(12,2) := 0;
  v_budget_cost numeric(12,2) := 0;
  v_actual_margin numeric(12,2) := 0;
  v_budget_margin numeric(12,2) := 0;
  v_margin_pct numeric(8,2) := 0;
begin
  if p_company_id is null or p_project_id is null then
    raise exception 'company_id and project_id are required';
  end if;

  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  select * into v_plan
  from public.project_finance_plans p
  where p.company_id = p_company_id
    and p.project_id = p_project_id;

  v_budget_revenue := round(coalesce(v_plan.budget_revenue, 0), 2);
  v_budget_cost := round(coalesce(v_plan.budget_cost, 0), 2);

  with invoice_line_revenue as (
    select
      i.id as invoice_id,
      case
        when i.kind = 'credit_note' then -1
        else 1
      end as sign_multiplier,
      round(
        coalesce(
          sum(
            case
              when jsonb_typeof(line.value) = 'object'
                and (
                  (line.value ? 'project_id' and (line.value->>'project_id')::uuid = p_project_id)
                  or (
                    not (line.value ? 'project_id')
                    and i.project_id = p_project_id
                  )
                )
              then
                coalesce((line.value->>'total')::numeric, 0)
                + (
                  coalesce((line.value->>'total')::numeric, 0)
                  * coalesce((line.value->>'vat_rate')::numeric, 0)
                  / 100.0
                )
              else 0
            end
          ),
          0
        ),
        2
      ) as project_total
    from public.invoices i
    left join lateral jsonb_array_elements(coalesce(i.lines_snapshot, '[]'::jsonb)) as line(value) on true
    where i.company_id = p_company_id
      and i.status <> 'void'
      and (
        i.project_id = p_project_id
        or exists (
          select 1
          from public.invoice_sources s
          where s.company_id = i.company_id
            and s.invoice_id = i.id
            and s.project_id = p_project_id
        )
      )
    group by i.id, i.kind, i.project_id
  )
  select round(coalesce(sum(project_total * sign_multiplier), 0), 2)
  into v_actual_revenue
  from invoice_line_revenue;

  select round(coalesce(sum(c.amount), 0), 2)
  into v_actual_cost
  from public.project_cost_entries c
  where c.company_id = p_company_id
    and c.project_id = p_project_id;

  v_actual_margin := round(v_actual_revenue - v_actual_cost, 2);
  v_budget_margin := round(v_budget_revenue - v_budget_cost, 2);

  if v_actual_revenue <> 0 then
    v_margin_pct := round((v_actual_margin / v_actual_revenue) * 100, 2);
  else
    v_margin_pct := 0;
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'project_id', p_project_id,
    'cost_center', coalesce(v_plan.cost_center, null),
    'budget', jsonb_build_object(
      'revenue', v_budget_revenue,
      'cost', v_budget_cost,
      'margin', v_budget_margin
    ),
    'actual', jsonb_build_object(
      'revenue', v_actual_revenue,
      'cost', v_actual_cost,
      'margin', v_actual_margin,
      'margin_pct', v_margin_pct
    )
  );
end;
$$;

grant execute on function public.project_finance_summary(uuid, uuid) to authenticated;
