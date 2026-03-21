create or replace function public.set_project_tasks_actor_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_project_tasks_actor_defaults on public.project_tasks;
create trigger trg_project_tasks_actor_defaults
before insert on public.project_tasks
for each row
execute function public.set_project_tasks_actor_defaults();

drop policy if exists project_tasks_insert_member on public.project_tasks;
create policy project_tasks_insert_member on public.project_tasks
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
);

