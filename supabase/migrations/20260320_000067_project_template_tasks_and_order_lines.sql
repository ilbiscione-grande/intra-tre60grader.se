alter table public.project_templates
  add column if not exists task_templates jsonb not null default '[]'::jsonb,
  add column if not exists order_line_templates jsonb not null default '[]'::jsonb;

alter table public.project_templates
  drop constraint if exists project_templates_task_templates_is_array;

alter table public.project_templates
  add constraint project_templates_task_templates_is_array
  check (jsonb_typeof(task_templates) = 'array');

alter table public.project_templates
  drop constraint if exists project_templates_order_line_templates_is_array;

alter table public.project_templates
  add constraint project_templates_order_line_templates_is_array
  check (jsonb_typeof(order_line_templates) = 'array');

comment on column public.project_templates.task_templates is 'Standarduppgifter som skapas när projekt startas från mallen.';
comment on column public.project_templates.order_line_templates is 'Standardorderrader som läggs på projektets order när projekt startas från mallen.';
