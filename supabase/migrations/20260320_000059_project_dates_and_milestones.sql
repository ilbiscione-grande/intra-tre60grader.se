alter table public.projects
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists milestones jsonb not null default '[]'::jsonb;

alter table public.projects
  drop constraint if exists projects_milestones_is_array;

alter table public.projects
  add constraint projects_milestones_is_array
  check (jsonb_typeof(milestones) = 'array');

create or replace function public.create_project_with_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (payload->>'company_id')::uuid;
  v_title text := coalesce(payload->>'title', 'Untitled project');
  v_status text := nullif(payload->>'status', '');
  v_customer_id uuid := nullif(payload->>'customer_id', '')::uuid;
  v_order_total numeric(12,2) := coalesce((payload->>'order_total')::numeric, 0);
  v_start_date date := nullif(payload->>'start_date', '')::date;
  v_end_date date := nullif(payload->>'end_date', '')::date;
  v_milestones jsonb := case
    when jsonb_typeof(payload->'milestones') = 'array' then payload->'milestones'
    else '[]'::jsonb
  end;
  v_pos integer;
  v_project_id uuid;
  v_order_id uuid;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if not public.is_company_member(v_company_id) then
    raise exception 'Not allowed';
  end if;

  if v_status is null then
    select pc.key into v_status
    from public.project_columns pc
    where pc.company_id = v_company_id
    order by pc.position
    limit 1;
  end if;

  if v_status is null then
    raise exception 'No project columns configured for company';
  end if;

  if not exists (
    select 1
    from public.project_columns pc
    where pc.company_id = v_company_id
      and pc.key = v_status
  ) then
    raise exception 'Invalid status %', v_status;
  end if;

  if v_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = v_customer_id
      and c.company_id = v_company_id
      and c.archived_at is null
  ) then
    raise exception 'customer_id is invalid for this company';
  end if;

  if v_start_date is not null and v_end_date is not null and v_end_date < v_start_date then
    raise exception 'end_date cannot be earlier than start_date';
  end if;

  select coalesce(max(position), 0) + 1 into v_pos
  from public.projects
  where company_id = v_company_id
    and status = v_status;

  insert into public.projects (
    company_id,
    title,
    status,
    position,
    customer_id,
    start_date,
    end_date,
    milestones
  )
  values (
    v_company_id,
    v_title,
    v_status,
    v_pos,
    v_customer_id,
    v_start_date,
    v_end_date,
    v_milestones
  )
  returning id into v_project_id;

  insert into public.orders (company_id, project_id, status, total)
  values (v_company_id, v_project_id, 'draft', v_order_total)
  returning id into v_order_id;

  return jsonb_build_object(
    'project_id', v_project_id,
    'order_id', v_order_id
  );
end;
$$;
