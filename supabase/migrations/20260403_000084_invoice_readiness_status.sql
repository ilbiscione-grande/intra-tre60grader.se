alter table if exists public.projects
  add column if not exists invoice_readiness_status text not null default 'not_ready';

alter table if exists public.orders
  add column if not exists invoice_readiness_status text not null default 'not_ready';

update public.orders
set invoice_readiness_status = case
  when status in ('invoiced', 'paid') then 'approved_for_invoicing'
  when status = 'sent' then 'under_review'
  else 'not_ready'
end
where (
    invoice_readiness_status is null
    or btrim(invoice_readiness_status) = ''
    or invoice_readiness_status = 'not_ready'
  )
  and not public.is_project_finance_locked(company_id, project_id);

update public.projects p
set invoice_readiness_status = case
  when exists (
    select 1
    from public.orders o
    where o.project_id = p.id
      and o.company_id = p.company_id
      and o.status in ('invoiced', 'paid')
  ) then 'approved_for_invoicing'
  when exists (
    select 1
    from public.orders o
    where o.project_id = p.id
      and o.company_id = p.company_id
      and o.status = 'sent'
  ) then 'under_review'
  else 'not_ready'
end
where invoice_readiness_status is null
   or btrim(invoice_readiness_status) = ''
   or invoice_readiness_status = 'not_ready';

create or replace function public.trg_set_project_invoice_readiness_default()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_readiness_status is null or btrim(new.invoice_readiness_status) = '' then
    new.invoice_readiness_status := 'not_ready';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_invoice_readiness_default on public.projects;
create trigger trg_projects_invoice_readiness_default
before insert or update on public.projects
for each row
execute function public.trg_set_project_invoice_readiness_default();

create or replace function public.trg_set_order_invoice_readiness_default()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_readiness_status is null or btrim(new.invoice_readiness_status) = '' then
    new.invoice_readiness_status := 'not_ready';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_invoice_readiness_default on public.orders;
create trigger trg_orders_invoice_readiness_default
before insert or update on public.orders
for each row
execute function public.trg_set_order_invoice_readiness_default();
