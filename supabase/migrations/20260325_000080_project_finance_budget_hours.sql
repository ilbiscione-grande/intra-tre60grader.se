alter table if exists public.project_finance_plans
add column if not exists budget_hours numeric(10,2) not null default 0;
