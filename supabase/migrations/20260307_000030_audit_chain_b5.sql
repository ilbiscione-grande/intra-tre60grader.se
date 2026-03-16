-- B5: Harden finance audit trail with append-only guarantees and exportable hash chain.

alter table public.finance_audit_log
  add column if not exists event_no bigint,
  add column if not exists prev_hash text,
  add column if not exists event_hash text,
  add column if not exists chain_version integer not null default 1;

create unique index if not exists finance_audit_log_company_event_no_uidx
  on public.finance_audit_log(company_id, event_no)
  where event_no is not null;

create unique index if not exists finance_audit_log_company_event_hash_uidx
  on public.finance_audit_log(company_id, event_hash)
  where event_hash is not null;

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
strict
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
        coalesce(p_prev_hash, '')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

grant execute on function public.finance_audit_event_hash(uuid, bigint, uuid, text, text, uuid, jsonb, text) to authenticated;

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

create or replace function public.finance_audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.audit_rebuild', true) = 'on' then
    return new;
  end if;

  raise exception 'finance_audit_log is append-only';
end;
$$;

drop trigger if exists finance_audit_log_block_update on public.finance_audit_log;
create trigger finance_audit_log_block_update
before update on public.finance_audit_log
for each row
execute function public.finance_audit_log_block_mutation();

drop trigger if exists finance_audit_log_block_delete on public.finance_audit_log;
create trigger finance_audit_log_block_delete
before delete on public.finance_audit_log
for each row
execute function public.finance_audit_log_block_mutation();

create or replace function public.log_finance_action(
  p_company_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_last_event_no bigint;
  v_prev_hash text;
  v_event_no bigint;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_event_hash text;
begin
  if p_company_id is null then
    raise exception 'Company is required';
  end if;

  if trim(coalesce(p_action, '')) = '' then
    raise exception 'Action is required';
  end if;

  if trim(coalesce(p_entity, '')) = '' then
    raise exception 'Entity is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  select event_no, event_hash
  into v_last_event_no, v_prev_hash
  from public.finance_audit_log
  where company_id = p_company_id
  order by event_no desc nulls last, created_at desc, id desc
  limit 1;

  if v_last_event_no is null then
    v_last_event_no := 0;
    v_prev_hash := 'GENESIS';
  end if;

  v_event_no := v_last_event_no + 1;
  v_event_hash := public.finance_audit_event_hash(
    p_company_id,
    v_event_no,
    v_actor_user_id,
    p_action,
    p_entity,
    p_entity_id,
    v_payload,
    v_prev_hash
  );

  insert into public.finance_audit_log (
    company_id,
    actor_user_id,
    action,
    entity,
    entity_id,
    payload,
    event_no,
    prev_hash,
    event_hash,
    chain_version
  )
  values (
    p_company_id,
    v_actor_user_id,
    p_action,
    p_entity,
    p_entity_id,
    v_payload,
    v_event_no,
    v_prev_hash,
    v_event_hash,
    1
  );
end;
$$;

grant execute on function public.log_finance_action(uuid, text, text, uuid, jsonb) to authenticated;

create or replace function public.finance_audit_log_report(
  p_company_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(t) order by t.event_no desc),
    '[]'::jsonb
  )
  from (
    select
      id,
      company_id,
      actor_user_id,
      action,
      entity,
      entity_id,
      payload,
      created_at,
      event_no,
      prev_hash,
      event_hash,
      chain_version
    from public.finance_audit_log
    where company_id = p_company_id
    order by event_no desc
    limit greatest(1, least(coalesce(p_limit, 100), 5000))
  ) t;
$$;

grant execute on function public.finance_audit_log_report(uuid, integer) to authenticated;

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
      coalesce(v_row.prev_hash, '')
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

    v_prev_hash := v_row.event_hash;
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

create or replace function public.finance_audit_chain_export(
  p_company_id uuid,
  p_after_event_no bigint default null,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_event_no bigint;
  v_prev_hash text;
  v_rows jsonb;
  v_start_no bigint;
  v_end_no bigint;
  v_chain_head text;
begin
  if not public.has_finance_access(p_company_id) then
    raise exception 'Not allowed';
  end if;

  v_from_event_no := coalesce(p_after_event_no, 0);

  with rows as (
    select
      id,
      company_id,
      actor_user_id,
      action,
      entity,
      entity_id,
      payload,
      created_at,
      event_no,
      prev_hash,
      event_hash,
      chain_version
    from public.finance_audit_log
    where company_id = p_company_id
      and event_no > v_from_event_no
    order by event_no asc
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  )
  select
    coalesce(jsonb_agg(to_jsonb(rows) order by rows.event_no), '[]'::jsonb),
    min(rows.event_no),
    max(rows.event_no)
  into v_rows, v_start_no, v_end_no
  from rows;

  if v_start_no is not null then
    select event_hash into v_prev_hash
    from public.finance_audit_log
    where company_id = p_company_id
      and event_no = v_start_no - 1;
  end if;

  select event_hash into v_chain_head
  from public.finance_audit_log
  where company_id = p_company_id
  order by event_no desc
  limit 1;

  return jsonb_build_object(
    'company_id', p_company_id,
    'exported_at', now(),
    'after_event_no', v_from_event_no,
    'range_start_event_no', v_start_no,
    'range_end_event_no', v_end_no,
    'previous_hash', coalesce(v_prev_hash, 'GENESIS'),
    'chain_head', v_chain_head,
    'events', v_rows
  );
end;
$$;

grant execute on function public.finance_audit_chain_export(uuid, bigint, integer) to authenticated;

do $$
begin
  perform public.rebuild_finance_audit_chain(null);
end;
$$;
