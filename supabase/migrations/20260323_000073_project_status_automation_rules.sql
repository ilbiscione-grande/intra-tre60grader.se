alter table public.project_automation_settings
  add column if not exists status_move_rules jsonb not null default '[]'::jsonb;
