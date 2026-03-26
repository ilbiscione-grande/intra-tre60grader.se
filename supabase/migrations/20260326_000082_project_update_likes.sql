create table if not exists public.project_update_likes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_update_id uuid not null references public.project_updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_update_id, user_id)
);

create index if not exists project_update_likes_update_idx
  on public.project_update_likes(project_update_id, created_at desc);

create index if not exists project_update_likes_user_idx
  on public.project_update_likes(user_id, created_at desc);

alter table public.project_update_likes enable row level security;

drop policy if exists project_update_likes_select_member on public.project_update_likes;
create policy project_update_likes_select_member on public.project_update_likes
for select
using (public.is_company_member(company_id));

drop policy if exists project_update_likes_insert_member on public.project_update_likes;
create policy project_update_likes_insert_member on public.project_update_likes
for insert
with check (
  public.is_company_member(company_id)
  and user_id = auth.uid()
);

drop policy if exists project_update_likes_delete_owner on public.project_update_likes;
create policy project_update_likes_delete_owner on public.project_update_likes
for delete
using (user_id = auth.uid());

grant select, insert, delete on public.project_update_likes to authenticated;
