create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_company_project_idx
  on public.project_members (company_id, project_id, created_at);

create index if not exists project_members_company_user_idx
  on public.project_members (company_id, user_id);

alter table public.project_members enable row level security;

drop policy if exists project_members_select_member on public.project_members;
create policy project_members_select_member on public.project_members
for select
using (public.is_company_member(company_id));

drop policy if exists project_members_insert_editor on public.project_members;
create policy project_members_insert_editor on public.project_members
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = project_members.company_id
      and cm.user_id = project_members.user_id
  )
);

drop policy if exists project_members_delete_editor on public.project_members;
create policy project_members_delete_editor on public.project_members
for delete
using (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
);

grant select, insert, delete on public.project_members to authenticated;

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

drop policy if exists profile_avatars_read on storage.objects;
create policy profile_avatars_read on storage.objects
for select
using (
  bucket_id = 'profile-avatars'
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists profile_avatars_insert on storage.objects;
create policy profile_avatars_insert on storage.objects
for insert
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = auth.uid()
  )
);

drop policy if exists profile_avatars_update on storage.objects;
create policy profile_avatars_update on storage.objects
for update
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists profile_avatars_delete on storage.objects;
create policy profile_avatars_delete on storage.objects
for delete
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[2] = auth.uid()::text
);
