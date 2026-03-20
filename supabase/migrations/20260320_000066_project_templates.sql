create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text null,
  start_status text not null,
  member_user_ids uuid[] not null default '{}',
  milestones jsonb not null default '[]'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_templates_company_idx
  on public.project_templates (company_id, name);

create unique index if not exists project_templates_company_name_uidx
  on public.project_templates (company_id, lower(name));

create or replace function public.set_project_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_templates_updated_at on public.project_templates;
create trigger trg_project_templates_updated_at
before update on public.project_templates
for each row
execute function public.set_project_templates_updated_at();

alter table public.project_templates enable row level security;

drop policy if exists project_templates_select_member on public.project_templates;
create policy project_templates_select_member on public.project_templates
for select
using (public.is_company_member(company_id));

drop policy if exists project_templates_insert_admin on public.project_templates;
create policy project_templates_insert_admin on public.project_templates
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
  and (created_by is null or created_by = auth.uid())
  and not exists (
    select 1
    from unnest(member_user_ids) as selected_user_id
    where not exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_templates.company_id
        and cm.user_id = selected_user_id
    )
  )
);

drop policy if exists project_templates_update_admin on public.project_templates;
create policy project_templates_update_admin on public.project_templates
for update
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
)
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
  and not exists (
    select 1
    from unnest(member_user_ids) as selected_user_id
    where not exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_templates.company_id
        and cm.user_id = selected_user_id
    )
  )
);

drop policy if exists project_templates_delete_admin on public.project_templates;
create policy project_templates_delete_admin on public.project_templates
for delete
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) = 'admin'
);

grant select, insert, update, delete on public.project_templates to authenticated;
