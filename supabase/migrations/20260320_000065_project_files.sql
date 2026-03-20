create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null default 'other' check (category in ('brief', 'agreement', 'delivery', 'source', 'planning', 'other')),
  title text null,
  path text not null,
  file_name text not null,
  file_type text null,
  file_size integer null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  replaces_file_id uuid null references public.project_files(id) on delete set null,
  version_group_id uuid not null default gen_random_uuid(),
  version_no integer not null default 1 check (version_no > 0)
);

create unique index if not exists project_files_path_uidx
  on public.project_files(path);

create index if not exists project_files_company_project_idx
  on public.project_files(company_id, project_id, category, created_at desc);

create index if not exists project_files_project_created_by_idx
  on public.project_files(company_id, project_id, created_by, created_at desc);

create index if not exists project_files_version_group_idx
  on public.project_files(version_group_id, version_no desc, created_at desc);

create or replace function public.set_project_files_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_files_updated_at on public.project_files;
create trigger trg_project_files_updated_at
before update on public.project_files
for each row
execute function public.set_project_files_updated_at();

alter table public.project_files enable row level security;

drop policy if exists project_files_select_member on public.project_files;
create policy project_files_select_member on public.project_files
for select
using (public.is_company_member(company_id));

drop policy if exists project_files_insert_member on public.project_files;
create policy project_files_insert_member on public.project_files
for insert
with check (
  public.is_company_member(company_id)
  and public.app_user_role(company_id) in ('admin', 'member', 'finance')
  and created_by = auth.uid()
);

drop policy if exists project_files_update_owner_or_admin on public.project_files;
create policy project_files_update_owner_or_admin on public.project_files
for update
using (
  public.is_company_member(company_id)
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or created_by = auth.uid()
  )
)
with check (
  public.is_company_member(company_id)
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or created_by = auth.uid()
  )
);

drop policy if exists project_files_delete_owner_or_admin on public.project_files;
create policy project_files_delete_owner_or_admin on public.project_files
for delete
using (
  public.is_company_member(company_id)
  and (
    public.app_user_role(company_id) in ('admin', 'finance')
    or created_by = auth.uid()
  )
);

grant select, insert, update, delete on public.project_files to authenticated;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists project_files_storage_read on storage.objects;
create policy project_files_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);

drop policy if exists project_files_storage_insert on storage.objects;
create policy project_files_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.app_user_role((split_part(name, '/', 1))::uuid) in ('admin', 'member', 'finance')
);

drop policy if exists project_files_storage_update on storage.objects;
create policy project_files_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.app_user_role((split_part(name, '/', 1))::uuid) in ('admin', 'member', 'finance')
)
with check (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.app_user_role((split_part(name, '/', 1))::uuid) in ('admin', 'member', 'finance')
);

drop policy if exists project_files_storage_delete on storage.objects;
create policy project_files_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.app_user_role((split_part(name, '/', 1))::uuid) in ('admin', 'member', 'finance')
);
