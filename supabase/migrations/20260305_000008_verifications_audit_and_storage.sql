alter table public.verifications
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists source text;

update public.verifications
set source = coalesce(source, 'desktop')
where source is null;

alter table public.verifications
  alter column source set default 'desktop';

alter table public.verifications
  add constraint verifications_source_check
  check (source in ('mobile', 'desktop', 'offline'));

create or replace function public.create_verification_from_wizard(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (payload->>'company_id')::uuid;
  v_verification_id uuid;
  v_source text := coalesce(nullif(payload->>'source', ''), 'desktop');
  line_item jsonb;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_line_count integer := 0;
begin
  if v_company_id is null then
    raise exception 'payload.company_id is required';
  end if;

  if not public.has_finance_access(v_company_id) then
    raise exception 'Not allowed';
  end if;

  if v_source not in ('mobile', 'desktop', 'offline') then
    raise exception 'Invalid source %', v_source;
  end if;

  if coalesce(payload->>'description', '') = '' then
    raise exception 'payload.description is required';
  end if;

  if coalesce((payload->>'total')::numeric, 0) <= 0 then
    raise exception 'payload.total must be greater than 0';
  end if;

  for line_item in
    select value from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb))
  loop
    v_line_count := v_line_count + 1;
    v_total_debit := v_total_debit + coalesce((line_item->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((line_item->>'credit')::numeric, 0);
  end loop;

  if v_line_count < 2 then
    raise exception 'At least two verification lines are required';
  end if;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Debet and kredit must balance';
  end if;

  insert into public.verifications (company_id, date, description, total, attachment_path, created_by, source)
  values (
    v_company_id,
    (payload->>'date')::date,
    coalesce(payload->>'description', ''),
    coalesce((payload->>'total')::numeric, 0),
    nullif(payload->>'attachment_path', ''),
    auth.uid(),
    v_source
  )
  returning id into v_verification_id;

  for line_item in
    select value from jsonb_array_elements(coalesce(payload->'lines', '[]'::jsonb))
  loop
    insert into public.verification_lines (
      company_id,
      verification_id,
      account_no,
      debit,
      credit,
      vat_code
    )
    values (
      v_company_id,
      v_verification_id,
      coalesce(line_item->>'account_no', '0000'),
      coalesce((line_item->>'debit')::numeric, 0),
      coalesce((line_item->>'credit')::numeric, 0),
      nullif(line_item->>'vat_code', '')
    );
  end loop;

  return jsonb_build_object('verification_id', v_verification_id);
end;
$$;

grant execute on function public.create_verification_from_wizard(jsonb) to authenticated;

insert into storage.buckets (id, name, public)
values ('verification-attachments', 'verification-attachments', false)
on conflict (id) do nothing;

drop policy if exists verification_attachments_read on storage.objects;
create policy verification_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'verification-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists verification_attachments_insert on storage.objects;
create policy verification_attachments_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'verification-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists verification_attachments_update on storage.objects;
create policy verification_attachments_update on storage.objects
for update to authenticated
using (
  bucket_id = 'verification-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
)
with check (
  bucket_id = 'verification-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists verification_attachments_delete on storage.objects;
create policy verification_attachments_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'verification-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-fA-F-]{36}$'
  and public.has_finance_access((split_part(name, '/', 1))::uuid)
);
