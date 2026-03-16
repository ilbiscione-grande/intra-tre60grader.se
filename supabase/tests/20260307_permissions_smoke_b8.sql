-- B8: Permission matrix smoke test for action-based authorization.
-- Verifies admin vs finance behavior for governance actions.
-- Safe to run: transaction rolls back.

begin;

do $$
declare
  v_company_id uuid;
  v_admin_user_id uuid;
  v_finance_user_id uuid;
  v_snapshot_id uuid;
  v_res jsonb;
begin
  select cm.company_id, cm.user_id
  into v_company_id, v_admin_user_id
  from public.company_members cm
  where cm.role = 'admin'
  order by cm.created_at asc
  limit 1;

  if v_company_id is null or v_admin_user_id is null then
    raise exception 'No admin membership found. Cannot run permission smoke.';
  end if;

  select cm.user_id
  into v_finance_user_id
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.role = 'finance'
  order by cm.created_at asc
  limit 1;

  -- Admin should pass governance checks.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_admin_user_id::text, true);

  if public.can_company_perform_action(v_company_id, 'finance.read') is distinct from true then
    raise exception 'Admin should have finance.read';
  end if;

  if public.can_company_perform_action(v_company_id, 'finance.write') is distinct from true then
    raise exception 'Admin should have finance.write';
  end if;

  if public.can_company_perform_action(v_company_id, 'finance.governance') is distinct from true then
    raise exception 'Admin should have finance.governance';
  end if;

  select t.snapshot_id
  into v_snapshot_id
  from public.create_company_backup_snapshot(
    v_company_id,
    'B8 permission smoke',
    null,
    null
  ) as t;

  if v_snapshot_id is null then
    raise exception 'Admin snapshot creation failed';
  end if;

  v_res := public.run_company_backup_restore_test(v_snapshot_id);
  if coalesce((v_res->>'ok')::boolean, false) is distinct from true then
    raise exception 'Admin restore-test failed';
  end if;

  perform public.set_period_lock(v_company_id, current_date);
  perform public.set_period_lock(v_company_id, null);

  -- Finance checks (if role exists in same company).
  if v_finance_user_id is not null then
    perform set_config('request.jwt.claim.sub', v_finance_user_id::text, true);

    if public.can_company_perform_action(v_company_id, 'finance.read') is distinct from true then
      raise exception 'Finance should have finance.read';
    end if;

    if public.can_company_perform_action(v_company_id, 'finance.write') is distinct from true then
      raise exception 'Finance should have finance.write';
    end if;

    if public.can_company_perform_action(v_company_id, 'finance.governance') is distinct from false then
      raise exception 'Finance must NOT have finance.governance';
    end if;

    begin
      perform public.create_company_backup_snapshot(v_company_id, 'B8 blocked finance', null, null);
      raise exception 'Expected Admin required for finance backup create';
    exception
      when others then
        if position('Admin required' in sqlerrm) = 0 then
          raise;
        end if;
    end;

    begin
      perform public.run_company_backup_restore_test(v_snapshot_id);
      raise exception 'Expected Admin required for finance restore test';
    exception
      when others then
        if position('Admin required' in sqlerrm) = 0 then
          raise;
        end if;
    end;

    begin
      perform public.set_period_lock(v_company_id, current_date);
      raise exception 'Expected Admin required for finance period lock';
    exception
      when others then
        if position('Admin required' in sqlerrm) = 0 then
          raise;
        end if;
    end;
  else
    raise notice 'No finance user in same company; finance-negative checks skipped.';
  end if;

  raise notice 'B8 PERMISSION SMOKE PASSED for company_id=%', v_company_id;
end
$$;

rollback;

