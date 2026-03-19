alter table public.project_updates
  add column if not exists updated_at timestamptz not null default now();

update public.project_updates
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.set_project_updates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_updates_updated_at on public.project_updates;
create trigger trg_project_updates_updated_at
before update on public.project_updates
for each row
execute function public.set_project_updates_updated_at();
