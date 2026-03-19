-- Self-heal order numbering when order_counters lags behind existing order_no values.

create or replace function public.next_order_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last integer;
  v_existing_max integer;
  v_next integer;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  insert into public.order_counters(company_id, last_number)
  values (p_company_id, 0)
  on conflict (company_id) do nothing;

  select last_number
  into v_last
  from public.order_counters
  where company_id = p_company_id
  for update;

  select coalesce(max(right(order_no, 6)::integer), 0)
  into v_existing_max
  from public.orders
  where company_id = p_company_id
    and order_no ~ '^ORD-[0-9]{6}$';

  v_next := greatest(coalesce(v_last, 0), coalesce(v_existing_max, 0)) + 1;

  update public.order_counters
  set last_number = v_next,
      updated_at = now()
  where company_id = p_company_id;

  return 'ORD-' || lpad(v_next::text, 6, '0');
end;
$$;

grant execute on function public.next_order_number(uuid) to authenticated;
