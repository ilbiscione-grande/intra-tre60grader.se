create table if not exists public.project_time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid null references public.project_tasks(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  hours numeric(6,2) not null check (hours > 0 and hours <= 24),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_time_entries_company_project_idx
  on public.project_time_entries(company_id, project_id, entry_date desc, created_at desc);

create index if not exists project_time_entries_company_user_idx
  on public.project_time_entries(company_id, user_id, entry_date desc);

create or replace function public.set_project_time_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_time_entries_updated_at on public.project_time_entries;
create trigger trg_project_time_entries_updated_at
before update on public.project_time_entries
for each row
execute function public.set_project_time_entries_updated_at();

alter table public.project_time_entries enable row level security;

drop policy if exists project_time_entries_select on public.project_time_entries;
create policy project_time_entries_select
on public.project_time_entries
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists project_time_entries_insert on public.project_time_entries;
create policy project_time_entries_insert
on public.project_time_entries
for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or user_id = auth.uid()
  )
);

drop policy if exists project_time_entries_update on public.project_time_entries;
create policy project_time_entries_update
on public.project_time_entries
for update
to authenticated
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or user_id = auth.uid()
  )
)
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or user_id = auth.uid()
  )
);

drop policy if exists project_time_entries_delete on public.project_time_entries;
create policy project_time_entries_delete
on public.project_time_entries
for delete
to authenticated
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.project_time_entries to authenticated;
