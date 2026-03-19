-- Make project finance lock aware of combined invoices via invoice_sources.

create or replace function public.is_project_finance_locked(p_company_id uuid, p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.invoices i
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
  );
$$;

grant execute on function public.is_project_finance_locked(uuid, uuid) to authenticated;
