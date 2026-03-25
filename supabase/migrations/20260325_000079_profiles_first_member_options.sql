create or replace function public.list_company_member_options(p_company_id uuid)
returns table (
  id uuid,
  company_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  email text,
  handle text,
  display_name text,
  color text,
  avatar_path text,
  emoji text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    cm.id,
    cm.company_id,
    cm.user_id,
    case when cm.role = 'employee' then 'member' else cm.role end as role,
    cm.created_at,
    coalesce(nullif(trim(both from p.email), ''), au.email)::text as email,
    lower(split_part(coalesce(nullif(trim(both from p.email), ''), au.email, ''), '@', 1))::text as handle,
    coalesce(
      nullif(trim(both from p.full_name), ''),
      nullif(trim(both from (ucp.preference_value ->> 'display_name')), ''),
      nullif(trim(both from coalesce(au.raw_user_meta_data ->> 'display_name', au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name')), ''),
      nullif(trim(both from coalesce(p.email, au.email, '')), ''),
      cm.user_id::text
    )::text as display_name,
    coalesce(nullif(trim(both from (ucp.preference_value ->> 'color')), ''), '#3b82f6')::text as color,
    nullif(trim(both from (ucp.preference_value ->> 'avatar_path')), '')::text as avatar_path,
    nullif(trim(both from (ucp.preference_value ->> 'emoji')), '')::text as emoji
  from public.company_members cm
  left join auth.users au
    on au.id = cm.user_id
  left join public.profiles p
    on p.id = cm.user_id
  left join public.user_company_preferences ucp
    on ucp.company_id = cm.company_id
   and ucp.user_id = cm.user_id
   and ucp.preference_key = 'profile_badge'
  where cm.company_id = p_company_id
  order by cm.created_at asc;
end;
$$;

grant execute on function public.list_company_member_options(uuid) to authenticated;
