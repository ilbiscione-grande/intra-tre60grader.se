alter table public.company_backup_snapshots
  add column if not exists payload_bytes bigint;

update public.company_backup_snapshots
set payload_bytes = pg_column_size(payload)
where payload is not null
  and (payload_bytes is null or payload_bytes = 0);

create or replace function public.set_company_backup_payload_bytes()
returns trigger
language plpgsql
as $$
begin
  new.payload_bytes := pg_column_size(new.payload);
  return new;
end;
$$;

drop trigger if exists trg_set_company_backup_payload_bytes on public.company_backup_snapshots;
create trigger trg_set_company_backup_payload_bytes
before insert or update of payload on public.company_backup_snapshots
for each row execute function public.set_company_backup_payload_bytes();