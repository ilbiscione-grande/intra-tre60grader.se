drop policy if exists verifications_update_finance on public.verifications;
create policy verifications_update_finance on public.verifications
for update
using (public.has_finance_access(company_id))
with check (public.has_finance_access(company_id));

create or replace function public.guard_verification_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (
      new.company_id is distinct from old.company_id
      or new.date is distinct from old.date
      or new.description is distinct from old.description
      or new.total is distinct from old.total
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
      or new.source is distinct from old.source
      or new.client_request_id is distinct from old.client_request_id
      or new.fiscal_year is distinct from old.fiscal_year
      or new.verification_no is distinct from old.verification_no
    ) then
      raise exception 'Verification core fields are immutable. Create a reversal instead.';
    end if;

    if old.status = 'voided' and new.status is distinct from 'voided' then
      raise exception 'Voided verification cannot be reopened.';
    end if;
  end if;

  return new;
end;
$$;
