-- Rework move_project to keep contiguous positions and stable cross-column ordering.

create or replace function public.normalize_project_positions(p_company_id uuid, p_status text)
returns void
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      id,
      row_number() over (order by position, created_at, id) as new_position
    from public.projects
    where company_id = p_company_id
      and status = p_status
  )
  update public.projects p
  set position = ranked.new_position
  from ranked
  where p.id = ranked.id
    and p.position is distinct from ranked.new_position;
$$;

create or replace function public.move_project(project_id uuid, to_status text, to_position integer)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.projects;
  v_from_status text;
  v_target_count integer;
  v_to_position integer;
begin
  if to_status not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid status %', to_status;
  end if;

  select * into p
  from public.projects
  where id = project_id
  for update;

  if p.id is null then
    raise exception 'Project not found';
  end if;

  if not public.is_company_member(p.company_id) then
    raise exception 'Not allowed';
  end if;

  v_from_status := p.status;
  v_to_position := greatest(1, coalesce(to_position, 1));

  perform public.normalize_project_positions(p.company_id, v_from_status);
  if v_from_status <> to_status then
    perform public.normalize_project_positions(p.company_id, to_status);
  end if;

  select * into p
  from public.projects
  where id = project_id;

  if v_from_status = to_status then
    select count(*) into v_target_count
    from public.projects
    where company_id = p.company_id
      and status = to_status;

    v_to_position := least(v_to_position, greatest(v_target_count, 1));

    if v_to_position < p.position then
      update public.projects
      set position = position + 1
      where company_id = p.company_id
        and status = to_status
        and id <> project_id
        and position >= v_to_position
        and position < p.position;
    elsif v_to_position > p.position then
      update public.projects
      set position = position - 1
      where company_id = p.company_id
        and status = to_status
        and id <> project_id
        and position <= v_to_position
        and position > p.position;
    end if;

    update public.projects
    set status = to_status,
        position = v_to_position
    where id = project_id
    returning * into p;

    perform public.normalize_project_positions(p.company_id, to_status);
    select * into p from public.projects where id = project_id;
    return p;
  end if;

  select count(*) into v_target_count
  from public.projects
  where company_id = p.company_id
    and status = to_status;

  v_to_position := least(v_to_position, v_target_count + 1);

  update public.projects
  set position = position - 1
  where company_id = p.company_id
    and status = v_from_status
    and id <> project_id
    and position > p.position;

  update public.projects
  set position = position + 1
  where company_id = p.company_id
    and status = to_status
    and position >= v_to_position;

  update public.projects
  set status = to_status,
      position = v_to_position
  where id = project_id
  returning * into p;

  perform public.normalize_project_positions(p.company_id, v_from_status);
  perform public.normalize_project_positions(p.company_id, to_status);

  select * into p from public.projects where id = project_id;
  return p;
end;
$$;

grant execute on function public.move_project(uuid, text, integer) to authenticated;
