create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid null references public.project_updates(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  content text null,
  attachment_path text null,
  attachment_name text null,
  attachment_type text null,
  attachment_size integer null,
  created_at timestamptz not null default now(),
  constraint project_updates_content_or_attachment_chk
    check (
      nullif(trim(coalesce(content, '')), '') is not null
      or nullif(trim(coalesce(attachment_path, '')), '') is not null
    )
);

create index if not exists project_updates_project_created_idx
  on public.project_updates(project_id, created_at);

create index if not exists project_updates_parent_idx
  on public.project_updates(parent_id);

alter table public.project_updates enable row level security;

drop policy if exists project_updates_select_member on public.project_updates;
create policy project_updates_select_member on public.project_updates
for select
using (public.is_company_member(company_id));

drop policy if exists project_updates_insert_member on public.project_updates;
create policy project_updates_insert_member on public.project_updates
for insert
with check (
  public.is_company_member(company_id)
  and created_by = auth.uid()
);

drop policy if exists project_updates_update_owner_or_admin on public.project_updates;
create policy project_updates_update_owner_or_admin on public.project_updates
for update
using (
  created_by = auth.uid()
  or public.app_user_role(company_id) = 'admin'
)
with check (
  public.is_company_member(company_id)
  and (
    created_by = auth.uid()
    or public.app_user_role(company_id) = 'admin'
  )
);

drop policy if exists project_updates_delete_owner_or_admin on public.project_updates;
create policy project_updates_delete_owner_or_admin on public.project_updates
for delete
using (
  created_by = auth.uid()
  or public.app_user_role(company_id) = 'admin'
);

insert into storage.buckets (id, name, public)
values ('project-update-attachments', 'project-update-attachments', false)
on conflict (id) do nothing;

drop policy if exists project_update_attachments_read on storage.objects;
create policy project_update_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'project-update-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);

drop policy if exists project_update_attachments_insert on storage.objects;
create policy project_update_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-update-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);

drop policy if exists project_update_attachments_update on storage.objects;
create policy project_update_attachments_update on storage.objects
for update to authenticated
using (
  bucket_id = 'project-update-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
)
with check (
  bucket_id = 'project-update-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);

drop policy if exists project_update_attachments_delete on storage.objects;
create policy project_update_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-update-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.is_company_member((split_part(name, '/', 1))::uuid)
);
