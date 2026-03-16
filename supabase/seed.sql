-- Demo seed data for Projectify + Bookie
-- Safe to re-run. Intended for development/demo only.

-- Deterministic company ids for stable references.
insert into public.companies (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Northwind Demo AB'),
  ('22222222-2222-2222-2222-222222222222', 'Acme Services AB')
on conflict (id) do update set name = excluded.name;

-- Give all existing users access to both demo companies.
insert into public.company_members (company_id, user_id, role)
select '11111111-1111-1111-1111-111111111111'::uuid, u.id, 'admin'
from auth.users u
on conflict (company_id, user_id) do nothing;

insert into public.company_members (company_id, user_id, role)
select '22222222-2222-2222-2222-222222222222'::uuid, u.id, 'finance'
from auth.users u
on conflict (company_id, user_id) do nothing;

-- Customers
insert into public.customers (id, company_id, name, archived_at)
values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Nordic Retail', null),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Svenska Logistik', null),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Old Customer Archive', now()),
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Acme Industrial', null),
  ('b2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Beta Consulting', null)
on conflict (id) do update set
  name = excluded.name,
  archived_at = excluded.archived_at;

-- Projects
insert into public.projects (id, company_id, title, status, position, customer_id)
values
  ('c1110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Website Relaunch', 'todo', 1, 'a1000000-0000-0000-0000-000000000001'),
  ('c1110000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'CRM Integration', 'in_progress', 1, 'a1000000-0000-0000-0000-000000000002'),
  ('c1110000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Mobile App Pilot', 'review', 1, 'a1000000-0000-0000-0000-000000000001'),
  ('c1110000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Data Migration', 'done', 1, 'a1000000-0000-0000-0000-000000000002'),
  ('c2220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Field Service Setup', 'todo', 1, 'b2000000-0000-0000-0000-000000000001'),
  ('c2220000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Invoice Automation', 'in_progress', 1, 'b2000000-0000-0000-0000-000000000002')
on conflict (id) do update set
  title = excluded.title,
  status = excluded.status,
  position = excluded.position,
  customer_id = excluded.customer_id;

-- Orders (1:1 with projects)
insert into public.orders (id, company_id, project_id, status, total)
values
  ('d1110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c1110000-0000-0000-0000-000000000001', 'draft', 12500),
  ('d1110000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c1110000-0000-0000-0000-000000000002', 'sent', 24000),
  ('d2220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'c2220000-0000-0000-0000-000000000001', 'draft', 9800),
  ('d2220000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'c2220000-0000-0000-0000-000000000002', 'draft', 18000)
on conflict (id) do update set
  status = excluded.status,
  total = excluded.total;

-- Order lines
insert into public.order_lines (id, company_id, order_id, title, qty, unit_price, vat_rate, total)
values
  ('e1110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'd1110000-0000-0000-0000-000000000001', 'Discovery Workshop', 1, 5000, 25, 5000),
  ('e1110000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'd1110000-0000-0000-0000-000000000001', 'Implementation Sprint', 1, 7500, 25, 7500),
  ('e1110000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'd1110000-0000-0000-0000-000000000002', 'Integration Package', 1, 24000, 25, 24000),
  ('e2220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'd2220000-0000-0000-0000-000000000001', 'Setup Fee', 1, 9800, 25, 9800),
  ('e2220000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'd2220000-0000-0000-0000-000000000002', 'Automation Build', 1, 18000, 25, 18000)
on conflict (id) do update set
  title = excluded.title,
  qty = excluded.qty,
  unit_price = excluded.unit_price,
  vat_rate = excluded.vat_rate,
  total = excluded.total;

-- Verifications
insert into public.verifications (id, company_id, date, description, total)
values
  ('f1110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', current_date - interval '10 days', 'Office rent', 15000),
  ('f1110000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', current_date - interval '5 days', 'Software subscription', 3200),
  ('f2220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', current_date - interval '7 days', 'Travel expense', 4100)
on conflict (id) do update set
  date = excluded.date,
  description = excluded.description,
  total = excluded.total;

-- Verification lines
insert into public.verification_lines (id, company_id, verification_id, account_no, debit, credit, vat_code)
values
  ('aa110000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'f1110000-0000-0000-0000-000000000001', '5010', 15000, 0, null),
  ('aa110000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'f1110000-0000-0000-0000-000000000001', '1930', 0, 15000, null),
  ('aa110000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'f1110000-0000-0000-0000-000000000002', '6540', 3200, 0, '25'),
  ('aa110000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'f1110000-0000-0000-0000-000000000002', '1930', 0, 3200, null),
  ('bb220000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'f2220000-0000-0000-0000-000000000001', '5800', 4100, 0, '12'),
  ('bb220000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'f2220000-0000-0000-0000-000000000001', '1930', 0, 4100, null)
on conflict (id) do update set
  account_no = excluded.account_no,
  debit = excluded.debit,
  credit = excluded.credit,
  vat_code = excluded.vat_code;