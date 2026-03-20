create table if not exists public.project_automation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  watched_statuses text[] not null default '{}',
  remind_days_before_end integer not null default 3 check (remind_days_before_end >= 0 and remind_days_before_end <= 60),
  stale_days_without_update integer not null default 7 check (stale_days_without_update >= 1 and stale_days_without_update <= 90),
  remind_done_without_invoice boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_project_automation_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_automation_settings_updated_at on public.project_automation_settings;
create trigger trg_project_automation_settings_updated_at
before update on public.project_automation_settings
for each row
execute function public.set_project_automation_settings_updated_at();

alter table public.project_automation_settings enable row level security;

drop policy if exists project_automation_settings_select_member on public.project_automation_settings;
create policy project_automation_settings_select_member on public.project_automation_settings
for select
using (public.is_company_member(company_id));

drop policy if exists project_automation_settings_insert_admin on public.project_automation_settings;
create policy project_automation_settings_insert_admin on public.project_automation_settings
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
);

drop policy if exists project_automation_settings_update_admin on public.project_automation_settings;
create policy project_automation_settings_update_admin on public.project_automation_settings
for update
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
)
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
);

grant select, insert, update on public.project_automation_settings to authenticated;
