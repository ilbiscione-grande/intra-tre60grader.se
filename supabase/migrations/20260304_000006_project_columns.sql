-- Dynamic project columns per company.

create table if not exists public.project_columns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  title text not null,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  unique (company_id, key)
);

create unique index if not exists project_columns_company_position_uidx
  on public.project_columns(company_id, position);

create index if not exists project_columns_company_idx
  on public.project_columns(company_id, position);

alter table public.project_columns enable row level security;

drop policy if exists project_columns_select_member on public.project_columns;
create policy project_columns_select_member on public.project_columns
for select
using (public.is_company_member(company_id));

drop policy if exists project_columns_insert_member on public.project_columns;
create policy project_columns_insert_member on public.project_columns
for insert
with check (public.is_company_member(company_id));

drop policy if exists project_columns_update_member on public.project_columns;
create policy project_columns_update_member on public.project_columns
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists project_columns_delete_member on public.project_columns;
create policy project_columns_delete_member on public.project_columns
for delete
using (public.is_company_member(company_id));

grant select, insert, update, delete on public.project_columns to authenticated;

-- Drop old fixed-status check constraint on projects.status.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and pg_get_constraintdef(oid) ilike '%todo%'
  loop
    execute format('alter table public.projects drop constraint %I', c.conname);
  end loop;
end
$$;

-- Seed default columns for existing companies.
insert into public.project_columns (company_id, key, title, position)
select c.id, x.key, x.title, x.position
from public.companies c
cross join (
  values
    ('todo', 'Att göra', 1),
    ('in_progress', 'Pågående', 2),
    ('review', 'Granskning', 3),
    ('done', 'Klar', 4)
) as x(key, title, position)
where not exists (
  select 1 from public.project_columns pc where pc.company_id = c.id
)
on conflict (company_id, key) do nothing;

create or replace function public.seed_default_project_columns(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_columns (company_id, key, title, position)
  values
    (p_company_id, 'todo', 'Att göra', 1),
    (p_company_id, 'in_progress', 'Pågående', 2),
    (p_company_id, 'review', 'Granskning', 3),
    (p_company_id, 'done', 'Klar', 4)
  on conflict (company_id, key) do nothing;
end;
$$;

create or replace function public.trg_seed_default_project_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_project_columns(new.id);
  return new;
end;
$$;

drop trigger if exists trg_companies_seed_project_columns on public.companies;
create trigger trg_companies_seed_project_columns
after insert on public.companies
for each row
execute function public.trg_seed_default_project_columns();

-- Update RPC validation to use project_columns instead of fixed enum.
create or replace function public.set_project_status(project_id uuid, to_status text)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  select * into p from public.projects where id = project_id;
  if p.id is null then
    raise exception 'Project not found';
  end if;

  if not public.is_company_member(p.company_id) then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1
    from public.project_columns pc
    where pc.company_id = p.company_id
      and pc.key = to_status
  ) then
    raise exception 'Invalid status %', to_status;
  end if;

  update public.projects
  set status = to_status
  where id = project_id
  returning * into p;

  return p;
end;
$$;

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

  select coalesce(max(position), 0) + 1 into v_pos
  from public.projects
  where company_id = v_company_id
    and status = v_status;

  insert into public.projects (company_id, title, status, position, customer_id)
  values (v_company_id, v_title, v_status, v_pos, v_customer_id)
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

  if not exists (
    select 1
    from public.project_columns pc
    where pc.company_id = p.company_id
      and pc.key = to_status
  ) then
    raise exception 'Invalid status %', to_status;
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

grant execute on function public.seed_default_project_columns(uuid) to authenticated;
grant execute on function public.set_project_status(uuid, text) to authenticated;
grant execute on function public.create_project_with_order(jsonb) to authenticated;
grant execute on function public.move_project(uuid, text, integer) to authenticated;
