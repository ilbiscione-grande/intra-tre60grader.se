alter table public.companies
  add column if not exists invoice_priority_threshold numeric(12,2) not null default 10000;

update public.companies
set invoice_priority_threshold = 10000
where invoice_priority_threshold is null
   or invoice_priority_threshold < 0;
