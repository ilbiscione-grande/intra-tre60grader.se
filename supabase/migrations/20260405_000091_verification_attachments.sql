create table if not exists public.verification_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  verification_id uuid not null references public.verifications(id) on delete cascade,
  path text not null,
  file_name text null,
  mime_type text null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

create index if not exists verification_attachments_verification_idx
  on public.verification_attachments(verification_id, created_at desc);

create unique index if not exists verification_attachments_verification_path_uidx
  on public.verification_attachments(verification_id, path);

alter table public.verification_attachments enable row level security;

drop policy if exists verification_attachments_select_finance on public.verification_attachments;
create policy verification_attachments_select_finance on public.verification_attachments
for select
using (public.has_finance_access(company_id));

drop policy if exists verification_attachments_insert_finance on public.verification_attachments;
create policy verification_attachments_insert_finance on public.verification_attachments
for insert
with check (public.has_finance_write_access(company_id));

drop policy if exists verification_attachments_delete_finance on public.verification_attachments;
create policy verification_attachments_delete_finance on public.verification_attachments
for delete
using (public.has_finance_write_access(company_id));

insert into public.verification_attachments (
  company_id,
  verification_id,
  path,
  file_name,
  mime_type,
  created_at,
  created_by
)
select
  v.company_id,
  v.id,
  v.attachment_path,
  nullif(regexp_replace(v.attachment_path, '^.*/', ''), ''),
  null,
  v.created_at,
  v.created_by
from public.verifications v
where v.attachment_path is not null
  and not exists (
    select 1
    from public.verification_attachments va
    where va.verification_id = v.id
      and va.path = v.attachment_path
  );
