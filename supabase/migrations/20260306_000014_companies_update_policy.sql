-- Allow admin to update own company profile from Settings page.

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin on public.companies
for update
using (public.app_user_role(id) = 'admin')
with check (public.app_user_role(id) = 'admin');

grant update on public.companies to authenticated;