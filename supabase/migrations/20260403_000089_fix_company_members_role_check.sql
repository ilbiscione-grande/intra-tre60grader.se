do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'company_members_role_check'
      and conrelid = 'public.company_members'::regclass
  ) then
    alter table public.company_members
      drop constraint company_members_role_check;
  end if;

  update public.company_members
  set role = case
    when role = 'employee' then 'member'
    when role in ('member', 'finance', 'admin', 'auditor') then role
    else 'member'
  end
  where role is distinct from case
    when role = 'employee' then 'member'
    when role in ('member', 'finance', 'admin', 'auditor') then role
    else 'member'
  end;

  alter table public.company_members
    add constraint company_members_role_check
    check (role in ('member', 'finance', 'admin', 'auditor'));
end
$$;
