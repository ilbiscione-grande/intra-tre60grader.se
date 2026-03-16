-- Security Advisor hotfix: enable RLS on exposed accounting tables.

alter table public.chart_of_accounts enable row level security;
alter table public.verification_number_counters enable row level security;

drop policy if exists chart_of_accounts_select_finance on public.chart_of_accounts;
create policy chart_of_accounts_select_finance on public.chart_of_accounts
for select
using (public.has_finance_access(company_id));

drop policy if exists chart_of_accounts_mutate_admin on public.chart_of_accounts;
create policy chart_of_accounts_mutate_admin on public.chart_of_accounts
for all
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

drop policy if exists verification_number_counters_select_finance on public.verification_number_counters;
create policy verification_number_counters_select_finance on public.verification_number_counters
for select
using (public.has_finance_access(company_id));

drop policy if exists verification_number_counters_mutate_admin on public.verification_number_counters;
create policy verification_number_counters_mutate_admin on public.verification_number_counters
for all
using (public.app_user_role(company_id) = 'admin')
with check (public.app_user_role(company_id) = 'admin');

grant select on public.chart_of_accounts to authenticated;
