-- Hotfix: rebuild_finance_audit_chain must reset chain columns first
-- to avoid transient unique collisions on (company_id, event_no).

create or replace function public.rebuild_finance_audit_chain(p_company_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_current_company uuid;
  v_prev_hash text := 'GENESIS';
  v_event_no bigint := 0;
  v_event_hash text;
  v_processed integer := 0;
begin
  perform set_config('app.audit_rebuild', 'on', true);

  update public.finance_audit_log fal
  set
    event_no = null,
    prev_hash = null,
    event_hash = null,
    chain_version = 1
  where p_company_id is null or fal.company_id = p_company_id;

  for v_row in
    select id, company_id, actor_user_id, action, entity, entity_id, payload
    from public.finance_audit_log
    where p_company_id is null or company_id = p_company_id
    order by company_id, created_at, id
  loop
    if v_current_company is distinct from v_row.company_id then
      v_current_company := v_row.company_id;
      v_prev_hash := 'GENESIS';
      v_event_no := 0;
    end if;

    v_event_no := v_event_no + 1;
    v_event_hash := public.finance_audit_event_hash(
      v_row.company_id,
      v_event_no,
      v_row.actor_user_id,
      v_row.action,
      v_row.entity,
      v_row.entity_id,
      coalesce(v_row.payload, '{}'::jsonb),
      v_prev_hash
    );

    update public.finance_audit_log fal
    set
      event_no = v_event_no,
      prev_hash = v_prev_hash,
      event_hash = v_event_hash,
      chain_version = 1
    where fal.id = v_row.id;

    v_prev_hash := v_event_hash;
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('processed_rows', v_processed, 'company_id', p_company_id);
end;
$$;

grant execute on function public.rebuild_finance_audit_chain(uuid) to authenticated;
