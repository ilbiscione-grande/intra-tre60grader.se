create table if not exists public.project_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  verification_id uuid not null references public.verifications(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, verification_id)
);

create index if not exists project_verifications_company_project_idx
  on public.project_verifications (company_id, project_id, created_at desc);

create index if not exists project_verifications_company_verification_idx
  on public.project_verifications (company_id, verification_id);

alter table public.project_verifications enable row level security;

drop policy if exists project_verifications_select_member on public.project_verifications;
create policy project_verifications_select_member on public.project_verifications
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = project_verifications.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists project_verifications_mutate_finance on public.project_verifications;
create policy project_verifications_mutate_finance on public.project_verifications
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = project_verifications.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('finance', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = project_verifications.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('finance', 'admin')
  )
);
