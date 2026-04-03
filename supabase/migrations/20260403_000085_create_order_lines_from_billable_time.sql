drop function if exists public.create_order_lines_from_billable_time(uuid, text);

create function public.create_order_lines_from_billable_time(
  p_project_id uuid,
  p_grouping_mode text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_order public.orders;
  v_plan public.project_finance_plans;
  v_grouping_mode text := lower(coalesce(nullif(trim(p_grouping_mode), ''), 'all'));
  v_unit_price numeric(12,2) := 0;
  v_total_hours numeric(12,2) := 0;
  v_group_count integer := 0;
  v_order_total numeric(12,2) := 0;
begin
  if v_grouping_mode not in ('all', 'person', 'task') then
    raise exception 'Unsupported grouping mode: %', v_grouping_mode;
  end if;

  select *
  into v_project
  from public.projects
  where id = p_project_id
  for update;

  if v_project.id is null then
    raise exception 'Project not found';
  end if;

  if not public.has_finance_write_access(v_project.company_id) then
    raise exception 'Not allowed';
  end if;

  if public.is_project_finance_locked(v_project.company_id, v_project.id) then
    raise exception 'Project finance is locked after invoice issuance';
  end if;

  select *
  into v_order
  from public.orders
  where company_id = v_project.company_id
    and project_id = v_project.id
  order by created_at desc
  limit 1
  for update;

  if v_order.id is null then
    insert into public.orders (
      company_id,
      project_id,
      status,
      total,
      invoice_readiness_status
    )
    values (
      v_project.company_id,
      v_project.id,
      'draft',
      0,
      'ready_for_invoicing'
    )
    returning *
    into v_order;
  end if;

  select *
  into v_plan
  from public.project_finance_plans
  where company_id = v_project.company_id
    and project_id = v_project.id;

  if coalesce(v_plan.budget_hours, 0) > 0 and coalesce(v_plan.budget_revenue, 0) > 0 then
    v_unit_price := round((v_plan.budget_revenue / v_plan.budget_hours)::numeric, 2);
  end if;

  create temp table if not exists pg_temp.tmp_billable_time_rows (
    id uuid,
    hours numeric(12,2),
    user_id uuid,
    task_id uuid
  ) on commit drop;

  truncate pg_temp.tmp_billable_time_rows;

  insert into pg_temp.tmp_billable_time_rows (id, hours, user_id, task_id)
  select
    t.id,
    round(coalesce(t.hours, 0)::numeric, 2),
    t.user_id,
    t.task_id
  from public.project_time_entries t
  where t.company_id = v_project.company_id
    and t.project_id = v_project.id
    and t.is_billable = true
    and t.order_id is null
  for update;

  select round(coalesce(sum(hours), 0)::numeric, 2)
  into v_total_hours
  from pg_temp.tmp_billable_time_rows;

  if coalesce(v_total_hours, 0) <= 0 then
    raise exception 'Ingen okopplad fakturerbar tid att lägga på order';
  end if;

  if v_grouping_mode = 'all' then
    insert into public.order_lines (
      company_id,
      order_id,
      title,
      qty,
      unit_price,
      vat_rate,
      total
    )
    values (
      v_project.company_id,
      v_order.id,
      format('Fakturerbar tid %s h', to_char(v_total_hours, 'FM999999990.00')),
      v_total_hours,
      v_unit_price,
      25,
      round((v_total_hours * v_unit_price)::numeric, 2)
    );

    v_group_count := 1;
  elsif v_grouping_mode = 'person' then
    insert into public.order_lines (
      company_id,
      order_id,
      title,
      qty,
      unit_price,
      vat_rate,
      total
    )
    select
      v_project.company_id,
      v_order.id,
      format(
        'Fakturerbar tid - %s %s h',
        coalesce(member.label, 'Okänd medlem'),
        to_char(round(sum(t.hours)::numeric, 2), 'FM999999990.00')
      ),
      round(sum(t.hours)::numeric, 2),
      v_unit_price,
      25,
      round((sum(t.hours) * v_unit_price)::numeric, 2)
    from pg_temp.tmp_billable_time_rows t
    left join lateral (
      select coalesce(nullif(trim(m.display_name), ''), split_part(coalesce(m.email, t.user_id::text), '@', 1), t.user_id::text) as label
      from public.list_company_member_options(v_project.company_id) m
      where m.user_id = t.user_id
      limit 1
    ) member on true
    group by t.user_id, member.label;

    get diagnostics v_group_count = row_count;
  else
    insert into public.order_lines (
      company_id,
      order_id,
      title,
      qty,
      unit_price,
      vat_rate,
      total
    )
    select
      v_project.company_id,
      v_order.id,
      format(
        'Fakturerbar tid - %s %s h',
        coalesce(task.title, 'Tid utan uppgift'),
        to_char(round(sum(t.hours)::numeric, 2), 'FM999999990.00')
      ),
      round(sum(t.hours)::numeric, 2),
      v_unit_price,
      25,
      round((sum(t.hours) * v_unit_price)::numeric, 2)
    from pg_temp.tmp_billable_time_rows t
    left join public.project_tasks task on task.id = t.task_id
    group by t.task_id, task.title;

    get diagnostics v_group_count = row_count;
  end if;

  update public.project_time_entries
  set order_id = v_order.id
  where id in (select id from pg_temp.tmp_billable_time_rows);

  select round(coalesce(sum(total), 0)::numeric, 2)
  into v_order_total
  from public.order_lines
  where company_id = v_project.company_id
    and order_id = v_order.id;

  update public.orders
  set
    total = v_order_total,
    invoice_readiness_status = case
      when invoice_readiness_status = 'approved_for_invoicing' then invoice_readiness_status
      else 'ready_for_invoicing'
    end
  where id = v_order.id;

  update public.projects
  set
    invoice_readiness_status = case
      when invoice_readiness_status = 'approved_for_invoicing' then invoice_readiness_status
      else 'ready_for_invoicing'
    end
  where id = v_project.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'total_hours', v_total_hours,
    'group_count', v_group_count,
    'unit_price', v_unit_price,
    'order_total', v_order_total
  );
end;
$$;

grant execute on function public.create_order_lines_from_billable_time(uuid, text) to authenticated;
