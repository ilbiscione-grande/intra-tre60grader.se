alter table public.project_automation_settings
  add column if not exists notify_assigned_on_deadline_overdue boolean not null default true;

alter table public.project_automation_settings
  add column if not exists notify_assigned_on_milestone_overdue boolean not null default true;

alter table public.project_automation_settings
  add column if not exists notify_assigned_on_watched_status boolean not null default false;
