-- Initial schema for Projectify + Bookie
-- Run this on a new Supabase project before later migrations.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'finance', 'admin')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists company_members_user_idx on public.company_members(user_id);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists customers_company_archived_idx on public.customers(company_id, archived_at);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  position integer not null default 0,
  customer_id uuid references public.customers(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists projects_company_status_position_idx on public.projects(company_id, status, position);
create index if not exists projects_company_updated_idx on public.projects(company_id, updated_at);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  status text not null default 'draft',
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists orders_company_idx on public.orders(company_id);

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists order_lines_order_idx on public.order_lines(order_id);

create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  description text not null,
  total numeric(12,2) not null default 0,
  attachment_path text,
  created_at timestamptz not null default now()
);
create index if not exists verifications_company_date_idx on public.verifications(company_id, date);

create table if not exists public.verification_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  verification_id uuid not null references public.verifications(id) on delete cascade,
  account_no text not null,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  vat_code text,
  created_at timestamptz not null default now()
);
create index if not exists verification_lines_verification_idx on public.verification_lines(verification_id);
create index if not exists verification_lines_company_vat_idx on public.verification_lines(company_id, vat_code);

create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row
execute function public.set_projects_updated_at();

create or replace function public.app_user_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cm.role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.has_finance_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_role(p_company_id) in ('finance', 'admin');
$$;

grant execute on function public.app_user_role(uuid) to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_finance_access(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.verifications enable row level security;
alter table public.verification_lines enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select
using (public.is_company_member(id));

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
for select
using (
  user_id = auth.uid()
  or public.app_user_role(company_id) = 'admin'
);

drop policy if exists company_members_insert_admin on public.company_members;
create policy company_members_insert_admin on public.company_members
for insert
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists company_members_update_admin on public.company_members;
create policy company_members_update_admin on public.company_members
for update
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists company_members_delete_admin on public.company_members;
create policy company_members_delete_admin on public.company_members
for delete
using (public.app_user_role(company_id) = 'admin');

drop policy if exists customers_select_member on public.customers;
create policy customers_select_member on public.customers
for select
using (public.is_company_member(company_id));

drop policy if exists customers_insert_member on public.customers;
create policy customers_insert_member on public.customers
for insert
with check (public.is_company_member(company_id));

drop policy if exists customers_update_member on public.customers;
create policy customers_update_member on public.customers
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
for select
using (public.is_company_member(company_id));

drop policy if exists projects_insert_member on public.projects;
create policy projects_insert_member on public.projects
for insert
with check (public.is_company_member(company_id));

drop policy if exists projects_update_member on public.projects;
create policy projects_update_member on public.projects
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists projects_delete_member on public.projects;
create policy projects_delete_member on public.projects
for delete
using (public.app_user_role(company_id) = 'admin');

drop policy if exists orders_select_member on public.orders;
create policy orders_select_member on public.orders
for select
using (public.is_company_member(company_id));

drop policy if exists orders_insert_member on public.orders;
create policy orders_insert_member on public.orders
for insert
with check (public.is_company_member(company_id));

drop policy if exists orders_update_member on public.orders;
create policy orders_update_member on public.orders
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

drop policy if exists order_lines_select_member on public.order_lines;
create policy order_lines_select_member on public.order_lines
for select
using (public.is_company_member(company_id));

drop policy if exists order_lines_insert_member on public.order_lines;
create policy order_lines_insert_member on public.order_lines
for insert
with check (public.is_company_member(company_id));

drop policy if exists order_lines_update_member on public.order_lines;
create policy order_lines_update_member on public.order_lines
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

-- Finance reads allowed to finance/admin only. Writes are intended via RPC.
drop policy if exists verifications_select_finance on public.verifications;
create policy verifications_select_finance on public.verifications
for select
using (public.has_finance_access(company_id));

drop policy if exists verification_lines_select_finance on public.verification_lines;
create policy verification_lines_select_finance on public.verification_lines
for select
using (public.has_finance_access(company_id));

create or replace function public.move_project(project_id uuid, to_status text, to_position integer)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  if to_status not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid status %', to_status;
  end if;

  select * into p from public.projects where id = project_id;
  if p.id is null then
    raise exception 'Project not found';
  end if;

  if not public.is_company_member(p.company_id) then
    raise exception 'Not allowed';
  end if;

  update public.projects
  set status = to_status,
      position = to_position
  where id = project_id
  returning * into p;

  return p;
end;
$$;

create or replace function public.set_project_status(project_id uuid, to_status text)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.projects;
begin
  if to_status not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'Invalid status %', to_status;
  end if;

  select * into p from public.projects where id = project_id;
  if p.id is null then
    raise exception 'Project not found';
  end if;

  if not public.is_company_member(p.company_id) then
    raise exception 'Not allowed';
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
  v_status text := coalesce(payload->>'status', 'todo');
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

  if v_status not in ('todo', 'in_progress', 'review', 'done') then
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

create or replace function public.create_verification_from_wizard(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (payload->>'company_id')::uuid;
  v_verification_id uuid;
  line_item jsonb;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  insert into public.verifications (company_id, date, description, total, attachment_path)
  values (
    v_company_id,
    (payload->>'date')::date,
    coalesce(payload->>'description', ''),
    coalesce((payload->>'total')::numeric, 0),
    nullif(payload->>'attachment_path', '')
  )
  returning id into v_verification_id;

  for line_item in
    select value from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb))
  loop
    insert into public.verification_lines (
      company_id,
      verification_id,
      account_no,
      debit,
      credit,
      vat_code
    )
    values (
      v_company_id,
      v_verification_id,
      coalesce(line_item->>'account_no', '0000'),
      coalesce((line_item->>'debit')::numeric, 0),
      coalesce((line_item->>'credit')::numeric, 0),
      nullif(line_item->>'vat_code', '')
    );
  end loop;

  return jsonb_build_object('verification_id', v_verification_id);
end;
$$;

create or replace function public.create_invoice_from_order(order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select o.company_id into v_company_id
  from public.orders o
  where o.id = order_id;

  if v_company_id is null then
    raise exception 'Order not found';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  update public.orders
  set status = 'invoiced'
  where id = order_id;

  return jsonb_build_object('order_id', order_id, 'status', 'invoiced');
end;
$$;

create or replace function public.vat_report(company_id uuid, period_start date, period_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_finance_access(company_id) then
    raise exception 'Not allowed';
  end if;

  select jsonb_build_object(
    'company_id', company_id,
    'period_start', period_start,
    'period_end', period_end,
    'line_count', count(vl.id),
    'total_debit', coalesce(sum(vl.debit), 0),
    'total_credit', coalesce(sum(vl.credit), 0),
    'vat_lines', coalesce(count(*) filter (where vl.vat_code is not null), 0)
  )
  into v_result
  from public.verification_lines vl
  join public.verifications v on v.id = vl.verification_id
  where v.company_id = company_id
    and v.date between period_start and period_end;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function public.move_project(uuid, text, integer) to authenticated;
grant execute on function public.set_project_status(uuid, text) to authenticated;
grant execute on function public.create_project_with_order(jsonb) to authenticated;
grant execute on function public.create_verification_from_wizard(jsonb) to authenticated;
grant execute on function public.create_invoice_from_order(uuid) to authenticated;
grant execute on function public.vat_report(uuid, date, date) to authenticated;