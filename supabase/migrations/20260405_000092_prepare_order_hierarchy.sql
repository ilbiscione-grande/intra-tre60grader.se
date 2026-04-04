alter table public.orders
  add column if not exists order_kind text not null default 'primary',
  add column if not exists parent_order_id uuid null references public.orders(id) on delete set null,
  add column if not exists sort_index integer not null default 0;

update public.orders
set
  order_kind = 'primary',
  parent_order_id = null,
  sort_index = 0
where order_kind is null
   or btrim(order_kind) = ''
   or sort_index is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'orders_project_id_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      drop constraint orders_project_id_key;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_kind_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_order_kind_check
      check (order_kind in ('primary', 'change', 'supplement'));
  end if;
end
$$;

create index if not exists orders_parent_order_idx
  on public.orders(parent_order_id, created_at desc);

create unique index if not exists orders_one_primary_per_project_uidx
  on public.orders(project_id)
  where order_kind = 'primary';

create or replace function public.guard_order_hierarchy_integrity()
returns trigger
language plpgsql
as $$
declare
  v_parent public.orders;
begin
  if new.parent_order_id is null then
    return new;
  end if;

  select *
  into v_parent
  from public.orders
  where id = new.parent_order_id;

  if v_parent.id is null then
    raise exception 'Parent order not found';
  end if;

  if v_parent.company_id is distinct from new.company_id then
    raise exception 'Parent order must belong to the same company';
  end if;

  if v_parent.project_id is distinct from new.project_id then
    raise exception 'Parent order must belong to the same project';
  end if;

  if new.parent_order_id = new.id then
    raise exception 'Order cannot be its own parent';
  end if;

  if new.order_kind = 'primary' then
    raise exception 'Primary order cannot have a parent order';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_order_hierarchy_integrity on public.orders;
create trigger trg_guard_order_hierarchy_integrity
before insert or update on public.orders
for each row
execute function public.guard_order_hierarchy_integrity();
