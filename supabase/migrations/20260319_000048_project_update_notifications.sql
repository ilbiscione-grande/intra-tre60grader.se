create table if not exists public.project_update_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_update_id uuid not null references public.project_updates(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  kind text not null check (kind in ('mention', 'reply')),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  unique (project_update_id, recipient_user_id, kind)
);

create index if not exists project_update_notifications_recipient_idx
  on public.project_update_notifications(recipient_user_id, created_at desc);

alter table public.project_update_notifications enable row level security;

drop policy if exists project_update_notifications_select_recipient on public.project_update_notifications;
create policy project_update_notifications_select_recipient on public.project_update_notifications
for select
using (recipient_user_id = auth.uid());

drop policy if exists project_update_notifications_insert_member on public.project_update_notifications;
create policy project_update_notifications_insert_member on public.project_update_notifications
for insert
with check (
  public.is_company_member(company_id)
  and actor_user_id = auth.uid()
);

drop policy if exists project_update_notifications_update_recipient on public.project_update_notifications;
create policy project_update_notifications_update_recipient on public.project_update_notifications
for update
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists project_update_notifications_delete_recipient on public.project_update_notifications;
create policy project_update_notifications_delete_recipient on public.project_update_notifications
for delete
using (recipient_user_id = auth.uid());
