alter table public.project_automation_settings
  add column if not exists notify_assigned_on_deadline_overdue boolean not null default true;

alter table public.project_automation_settings
  add column if not exists notify_assigned_on_milestone_overdue boolean not null default true;

alter table public.project_automation_settings
  add column if not exists notify_assigned_on_watched_status boolean not null default false;

alter table public.project_automation_settings
  add column if not exists create_task_on_watched_status boolean not null default false;

alter table public.project_automation_settings
  add column if not exists watched_status_task_title text not null default 'Folj upp projekt i bevakad kolumn';

alter table public.project_automation_settings
  add column if not exists create_update_on_workflow_status_change boolean not null default true;

alter table public.project_automation_settings
  add column if not exists status_move_rules jsonb not null default '[]'::jsonb;
