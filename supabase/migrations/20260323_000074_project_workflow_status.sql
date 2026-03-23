alter table public.projects
  add column if not exists workflow_status text;

update public.projects
set workflow_status = status
where workflow_status is null;

alter table public.projects
  alter column workflow_status set not null;

create or replace function public.trg_set_project_workflow_status_default()
returns trigger
language plpgsql
as $$
begin
  if new.workflow_status is null or btrim(new.workflow_status) = '' then
    new.workflow_status := new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_workflow_status_default on public.projects;
create trigger trg_projects_workflow_status_default
before insert on public.projects
for each row
execute function public.trg_set_project_workflow_status_default();
