alter table public.project_tasks
  add column if not exists milestone_id text null,
  add column if not exists subtasks jsonb not null default '[]'::jsonb;

comment on column public.project_tasks.milestone_id is 'Koppling till projektets milestone-id i projects.milestones JSON.';
comment on column public.project_tasks.subtasks is 'Enkel checklista för uppgiften som JSON-array.';
