-- Human-friendly order numbering per company.

create table if not exists public.order_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.order_counters enable row level security;

alter table public.orders
  add column if not exists order_no text;

create or replace function public.guard_locked_project_finance_orders()
returns trigger
language plpgsql
as $$
begin
  if not public.is_project_finance_locked(new.company_id, new.project_id) then
    return new;
  end if;

  -- Allow internal transition to invoiced in create_invoice_from_order.
  if tg_op = 'UPDATE'
     and old.status is distinct from 'invoiced'
     and new.status = 'invoiced'
     and new.id = old.id
     and new.company_id = old.company_id
     and new.project_id = old.project_id
     and new.created_at = old.created_at
     and coalesce(new.order_no, '') = coalesce(old.order_no, '') then
    return new;
  end if;

  -- Allow assigning/backfilling human-friendly order numbers on locked projects.
  if tg_op = 'UPDATE'
     and new.id = old.id
     and new.company_id = old.company_id
     and new.project_id = old.project_id
     and new.status = old.status
     and new.total = old.total
     and new.created_at = old.created_at
     and coalesce(new.order_no, '') is distinct from coalesce(old.order_no, '') then
    return new;
  end if;

  raise exception 'Project finance is locked after invoice issuance';
end;
$$;

create or replace function public.next_order_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  insert into public.order_counters(company_id, last_number)
  values (p_company_id, 0)
  on conflict (company_id) do nothing;

  update public.order_counters
  set last_number = last_number + 1,
      updated_at = now()
  where company_id = p_company_id
  returning last_number into v_next;

  return 'ORD-' || lpad(v_next::text, 6, '0');
end;
$$;

create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_no is null or btrim(new.order_no) = '' then
    new.order_no := public.next_order_number(new.company_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_order_number on public.orders;
create trigger trg_assign_order_number
before insert on public.orders
for each row
execute function public.assign_order_number();

with ranked as (
  select
    id,
    company_id,
    row_number() over (partition by company_id order by created_at asc, id asc) as seq
  from public.orders
),
backfilled as (
  update public.orders o
  set order_no = 'ORD-' || lpad(r.seq::text, 6, '0')
  from ranked r
  where o.id = r.id
    and (o.order_no is null or btrim(o.order_no) = '')
  returning o.company_id, o.order_no
),
max_numbers as (
  select company_id, max(right(order_no, 6)::integer) as max_no
  from public.orders
  where order_no ~ '^ORD-[0-9]{6}$'
  group by company_id
)
insert into public.order_counters(company_id, last_number, updated_at)
select company_id, max_no, now()
from max_numbers
on conflict (company_id) do update
set last_number = greatest(public.order_counters.last_number, excluded.last_number),
    updated_at = now();

create unique index if not exists orders_company_order_no_uidx
  on public.orders(company_id, order_no)
  where order_no is not null;

grant execute on function public.next_order_number(uuid) to authenticated;
