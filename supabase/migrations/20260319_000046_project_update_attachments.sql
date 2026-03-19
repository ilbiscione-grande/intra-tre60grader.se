create table if not exists public.project_update_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_update_id uuid not null references public.project_updates(id) on delete cascade,
  path text not null,
  file_name text null,
  file_type text null,
  file_size integer null,
  created_at timestamptz not null default now()
);

create index if not exists project_update_attachments_update_idx
  on public.project_update_attachments(project_update_id, created_at);

alter table public.project_update_attachments enable row level security;

drop policy if exists project_update_attachments_select_member on public.project_update_attachments;
create policy project_update_attachments_select_member on public.project_update_attachments
for select
using (public.is_company_member(company_id));

drop policy if exists project_update_attachments_insert_member on public.project_update_attachments;
create policy project_update_attachments_insert_member on public.project_update_attachments
for insert
with check (public.is_company_member(company_id));

drop policy if exists project_update_attachments_update_owner_or_admin on public.project_update_attachments;
create policy project_update_attachments_update_owner_or_admin on public.project_update_attachments
for update
using (
  exists (
    select 1
    from public.project_updates pu
    where pu.id = project_update_id
      and (
        pu.created_by = auth.uid()
        or public.app_user_role(company_id) = 'admin'
      )
  )
)
with check (public.is_company_member(company_id));

drop policy if exists project_update_attachments_delete_owner_or_admin on public.project_update_attachments;
create policy project_update_attachments_delete_owner_or_admin on public.project_update_attachments
for delete
using (
  exists (
    select 1
    from public.project_updates pu
    where pu.id = project_update_id
      and (
        pu.created_by = auth.uid()
        or public.app_user_role(company_id) = 'admin'
      )
  )
);

insert into public.project_update_attachments (company_id, project_id, project_update_id, path, file_name, file_type, file_size, created_at)
select
  company_id,
  project_id,
  id,
  attachment_path,
  attachment_name,
  attachment_type,
  attachment_size,
  created_at
from public.project_updates
where attachment_path is not null
  and not exists (
    select 1
    from public.project_update_attachments pua
    where pua.project_update_id = public.project_updates.id
      and pua.path = public.project_updates.attachment_path
  );
