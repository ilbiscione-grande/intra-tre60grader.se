-- Hotfix: make audit hash chain null-safe and deterministic.

create or replace function public.finance_audit_event_hash(
  p_company_id uuid,
  p_event_no bigint,
  p_actor_user_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_payload jsonb,
  p_prev_hash text
)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    public.digest(
      concat_ws(
        '|',
        coalesce(p_company_id::text, ''),
        coalesce(p_event_no::text, ''),
        coalesce(p_actor_user_id::text, ''),
        coalesce(p_action, ''),
        coalesce(p_entity, ''),
        coalesce(p_entity_id::text, ''),
        coalesce(p_payload, '{}'::jsonb)::text,
        coalesce(p_prev_hash, 'GENESIS')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

grant execute on function public.finance_audit_event_hash(uuid, bigint, uuid, text, text, uuid, jsonb, text) to authenticated;

create or replace function public.finance_audit_chain_verify(
  p_company_id uuid,
  p_from_event_no bigint default null,
  p_to_event_no bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_prev_hash text := 'GENESIS';
  v_expected_hash text;
  v_checked integer := 0;
  v_broken integer := 0;
  v_first_event_no bigint;
  v_breaks jsonb := '[]'::jsonb;
begin
  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  if p_from_event_no is not null then
    select event_hash into v_prev_hash
    from public.finance_audit_log
    where company_id = p_company_id
      and event_no < p_from_event_no
    order by event_no desc
    limit 1;

    v_prev_hash := coalesce(v_prev_hash, 'GENESIS');
  end if;

  for v_row in
    select
      id,
      event_no,
      prev_hash,
      event_hash,
      company_id,
      actor_user_id,
      action,
      entity,
      entity_id,
      payload
    from public.finance_audit_log
    where company_id = p_company_id
      and event_no is not null
      and (p_from_event_no is null or event_no >= p_from_event_no)
      and (p_to_event_no is null or event_no <= p_to_event_no)
    order by event_no asc
  loop
    if v_first_event_no is null then
      v_first_event_no := v_row.event_no;
    end if;

    v_expected_hash := public.finance_audit_event_hash(
      v_row.company_id,
      v_row.event_no,
      v_row.actor_user_id,
      v_row.action,
      v_row.entity,
      v_row.entity_id,
      coalesce(v_row.payload, '{}'::jsonb),
      v_prev_hash
    );

    if coalesce(v_row.prev_hash, 'GENESIS') is distinct from coalesce(v_prev_hash, 'GENESIS')
       or v_row.event_hash is distinct from v_expected_hash then
      v_broken := v_broken + 1;
      if jsonb_array_length(v_breaks) < 50 then
        v_breaks := v_breaks || jsonb_build_array(
          jsonb_build_object(
            'event_no', v_row.event_no,
            'id', v_row.id,
            'expected_prev_hash', v_prev_hash,
            'actual_prev_hash', v_row.prev_hash,
            'expected_event_hash', v_expected_hash,
            'actual_event_hash', v_row.event_hash
          )
        );
      end if;
    end if;

    v_prev_hash := coalesce(v_row.event_hash, 'GENESIS');
    v_checked := v_checked + 1;
  end loop;

  return jsonb_build_object(
    'company_id', p_company_id,
    'first_event_no', v_first_event_no,
    'checked_events', v_checked,
    'broken_events', v_broken,
    'chain_ok', v_broken = 0,
    'breaks', v_breaks
  );
end;
$$;

grant execute on function public.finance_audit_chain_verify(uuid, bigint, bigint) to authenticated;
