-- Persist user-specific UI preferences per company
create table if not exists public.user_company_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, preference_key)
);

create index if not exists idx_user_company_preferences_lookup
  on public.user_company_preferences (company_id, user_id, preference_key);

create or replace function public.touch_user_company_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_user_company_preferences_updated_at on public.user_company_preferences;
create trigger trg_touch_user_company_preferences_updated_at
before update on public.user_company_preferences
for each row
execute function public.touch_user_company_preferences_updated_at();

alter table public.user_company_preferences enable row level security;

drop policy if exists ucp_select_own on public.user_company_preferences;
create policy ucp_select_own on public.user_company_preferences
for select
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = user_company_preferences.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists ucp_insert_own on public.user_company_preferences;
create policy ucp_insert_own on public.user_company_preferences
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = user_company_preferences.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists ucp_update_own on public.user_company_preferences;
create policy ucp_update_own on public.user_company_preferences
for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = user_company_preferences.company_id
      and cm.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = user_company_preferences.company_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists ucp_delete_own on public.user_company_preferences;
create policy ucp_delete_own on public.user_company_preferences
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.company_members cm
    where cm.company_id = user_company_preferences.company_id
      and cm.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.user_company_preferences to authenticated;

