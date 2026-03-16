-- B3 hotfix: säkerställ aktiva konton för bankmatch-betalningar.
-- register_invoice_payment bokar mot 1930 (bank) och 1510 (kundfordringar).

insert into public.chart_of_accounts (company_id, account_no, name, account_type, active)
select c.id, x.account_no, x.name, x.account_type, true
from public.companies c
cross join (
  values
    ('1930', 'Företagskonto', 'asset'),
    ('1510', 'Kundfordringar', 'asset')
) as x(account_no, name, account_type)
on conflict (company_id, account_no)
do update set
  active = true,
  name = excluded.name,
  account_type = excluded.account_type;
