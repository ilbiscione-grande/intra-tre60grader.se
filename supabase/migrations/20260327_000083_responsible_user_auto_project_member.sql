create or replace function public.ensure_project_responsible_is_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_user_id is null then
    return new;
  end if;

  insert into public.project_members (
    company_id,
    project_id,
    user_id,
    created_by
  )
  values (
    new.company_id,
    new.id,
    new.responsible_user_id,
    auth.uid()
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_project_responsible_is_member_on_projects on public.projects;

create trigger ensure_project_responsible_is_member_on_projects
after insert or update of responsible_user_id on public.projects
for each row
execute function public.ensure_project_responsible_is_member();

insert into public.project_members (
  company_id,
  project_id,
  user_id,
  created_by
)
select
  p.company_id,
  p.id,
  p.responsible_user_id,
  null
from public.projects p
where p.responsible_user_id is not null
on conflict do nothing;
