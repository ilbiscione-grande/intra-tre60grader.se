create table if not exists public.project_task_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_task_members_task_user_unique unique (task_id, user_id)
);

create index if not exists project_task_members_company_project_idx
  on public.project_task_members(company_id, project_id, created_at desc);

create index if not exists project_task_members_company_task_idx
  on public.project_task_members(company_id, task_id, created_at desc);

create index if not exists project_task_members_company_user_idx
  on public.project_task_members(company_id, user_id, created_at desc);

alter table public.project_task_members enable row level security;

drop policy if exists project_task_members_select_member on public.project_task_members;
create policy project_task_members_select_member on public.project_task_members
  for select
  using (public.is_company_member(company_id));

drop policy if exists project_task_members_insert_member on public.project_task_members;
create policy project_task_members_insert_member on public.project_task_members
  for insert
  with check (
    public.is_company_member(company_id)
    and public.app_user_role(company_id) in ('admin', 'member', 'finance')
    and exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_task_members.company_id
        and cm.user_id = project_task_members.user_id
    )
  );

drop policy if exists project_task_members_delete_member on public.project_task_members;
create policy project_task_members_delete_member on public.project_task_members
  for delete
  using (
    public.is_company_member(company_id)
    and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  );

grant select, insert, delete on public.project_task_members to authenticated;
