-- A5 hotfix 3: compatibility shim for audit logging function name.
-- Existing schema uses public.log_finance_action(...), while A5 called public.log_finance_event(...).

create or replace function public.log_finance_event(
  p_company_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_finance_action(
    p_company_id,
    p_action,
    p_entity,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.log_finance_event(uuid, text, text, uuid, jsonb) to authenticated;
