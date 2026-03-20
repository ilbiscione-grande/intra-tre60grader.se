create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date null,
  assignee_user_id uuid null references auth.users(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_tasks_company_project_idx
  on public.project_tasks(company_id, project_id, status, due_date, created_at desc);

create index if not exists project_tasks_company_assignee_idx
  on public.project_tasks(company_id, assignee_user_id, status, due_date);

create or replace function public.set_project_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_tasks_updated_at on public.project_tasks;
create trigger trg_project_tasks_updated_at
before update on public.project_tasks
for each row
execute function public.set_project_tasks_updated_at();

alter table public.project_tasks enable row level security;

drop policy if exists project_tasks_select_member on public.project_tasks;
create policy project_tasks_select_member on public.project_tasks
for select
using (public.is_company_member(company_id));

drop policy if exists project_tasks_insert_member on public.project_tasks;
create policy project_tasks_insert_member on public.project_tasks
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and created_by = auth.uid()
);

drop policy if exists project_tasks_update_member on public.project_tasks;
create policy project_tasks_update_member on public.project_tasks
for update
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
)
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
);

drop policy if exists project_tasks_delete_member on public.project_tasks;
create policy project_tasks_delete_member on public.project_tasks
for delete
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
);

grant select, insert, update, delete on public.project_tasks to authenticated;
