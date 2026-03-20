create table if not exists public.company_member_capabilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('finance', 'project_lead', 'reporting', 'team_admin')),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id, capability)
);

create index if not exists company_member_capabilities_company_user_idx
  on public.company_member_capabilities (company_id, user_id, created_at desc);

create index if not exists company_member_capabilities_company_capability_idx
  on public.company_member_capabilities (company_id, capability, created_at desc);

alter table public.company_member_capabilities enable row level security;

drop policy if exists company_member_capabilities_select on public.company_member_capabilities;
create policy company_member_capabilities_select on public.company_member_capabilities
for select
using (public.is_company_member(company_id));

drop policy if exists company_member_capabilities_insert_admin on public.company_member_capabilities;
create policy company_member_capabilities_insert_admin on public.company_member_capabilities
for insert
with check (
  public.app_user_role(company_id) = 'admin'
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = company_member_capabilities.company_id
      and cm.user_id = company_member_capabilities.user_id
  )
);

drop policy if exists company_member_capabilities_update_admin on public.company_member_capabilities;
create policy company_member_capabilities_update_admin on public.company_member_capabilities
for update
using (public.app_user_role(company_id) = 'admin')
with check (
  public.app_user_role(company_id) = 'admin'
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = company_member_capabilities.company_id
      and cm.user_id = company_member_capabilities.user_id
  )
);

drop policy if exists company_member_capabilities_delete_admin on public.company_member_capabilities;
create policy company_member_capabilities_delete_admin on public.company_member_capabilities
for delete
using (public.app_user_role(company_id) = 'admin');

grant select, insert, update, delete on public.company_member_capabilities to authenticated;
