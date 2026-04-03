alter table if exists public.company_members
  add column if not exists default_hourly_rate numeric(12,2) not null default 0;

alter table if exists public.project_tasks
  add column if not exists hourly_rate numeric(12,2) not null default 0;
