create table if not exists public.project_active_timers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_title text not null,
  task_id uuid null references public.project_tasks(id) on delete set null,
  task_title text null,
  note text null,
  started_at timestamptz not null default now(),
  accumulated_ms bigint not null default 0 check (accumulated_ms >= 0),
  paused_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_active_timers_company_user_unique unique (company_id, user_id)
);

create index if not exists project_active_timers_company_user_idx
  on public.project_active_timers(company_id, user_id);

create or replace function public.set_project_active_timers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_active_timers_updated_at on public.project_active_timers;
create trigger trg_project_active_timers_updated_at
before update on public.project_active_timers
for each row
execute function public.set_project_active_timers_updated_at();

alter table public.project_active_timers enable row level security;

drop policy if exists project_active_timers_select on public.project_active_timers;
create policy project_active_timers_select
on public.project_active_timers
for select
to authenticated
using (
  public.is_company_member(company_id)
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or user_id = auth.uid()
  )
);

drop policy if exists project_active_timers_insert on public.project_active_timers;
create policy project_active_timers_insert
on public.project_active_timers
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

drop policy if exists project_active_timers_update on public.project_active_timers;
create policy project_active_timers_update
on public.project_active_timers
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

drop policy if exists project_active_timers_delete on public.project_active_timers;
create policy project_active_timers_delete
on public.project_active_timers
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

grant select, insert, update, delete on public.project_active_timers to authenticated;
