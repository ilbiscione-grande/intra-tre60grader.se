-- C4: security operations baseline (auth rate limit + security monitoring feed)

create table if not exists public.security_rate_limits (
  scope text not null,
  identifier_hash text not null,
  bucket_start timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash, bucket_start)
);

create index if not exists security_rate_limits_updated_idx
  on public.security_rate_limits(updated_at desc);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  scope text not null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  identifier_hash text,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_company_created_idx
  on public.security_events(company_id, created_at desc);

create index if not exists security_events_scope_created_idx
  on public.security_events(scope, created_at desc);

alter table public.security_rate_limits enable row level security;
alter table public.security_events enable row level security;

create or replace function public.consume_security_rate_limit(
  p_scope text,
  p_identifier text,
  p_window_seconds integer,
  p_max_attempts integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket_start timestamptz;
  v_identifier_hash text;
  v_attempt_count integer;
  v_allowed boolean;
  v_remaining integer;
  v_reset_at timestamptz;
begin
  if coalesce(length(trim(p_scope)), 0) = 0 then
    raise exception 'scope is required';
  end if;

  if coalesce(length(trim(p_identifier)), 0) = 0 then
    raise exception 'identifier is required';
  end if;

  if coalesce(p_window_seconds, 0) <= 0 then
    raise exception 'window_seconds must be > 0';
  end if;

  if coalesce(p_max_attempts, 0) <= 0 then
    raise exception 'max_attempts must be > 0';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_identifier_hash := encode(public.digest(lower(trim(p_identifier)), 'sha256'), 'hex');
  v_reset_at := v_bucket_start + make_interval(secs => p_window_seconds);

  insert into public.security_rate_limits as srl (
    scope,
    identifier_hash,
    bucket_start,
    attempt_count,
    updated_at
  ) values (
    trim(p_scope),
    v_identifier_hash,
    v_bucket_start,
    1,
    now()
  )
  on conflict (scope, identifier_hash, bucket_start)
  do update
    set attempt_count = srl.attempt_count + 1,
        updated_at = now()
  returning attempt_count into v_attempt_count;

  v_allowed := v_attempt_count <= p_max_attempts;
  v_remaining := greatest(p_max_attempts - v_attempt_count, 0);

  delete from public.security_rate_limits
  where updated_at < now() - interval '7 days';

  return jsonb_build_object(
    'allowed', v_allowed,
    'attempt_count', v_attempt_count,
    'remaining', v_remaining,
    'reset_at', v_reset_at
  );
end;
$$;

create or replace function public.log_security_event(
  p_company_id uuid default null,
  p_actor_user_id uuid default null,
  p_scope text default null,
  p_event_type text default null,
  p_severity text default 'info',
  p_identifier_hash text default null,
  p_ip text default null,
  p_user_agent text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(length(trim(p_scope)), 0) = 0 then
    raise exception 'scope is required';
  end if;

  if coalesce(length(trim(p_event_type)), 0) = 0 then
    raise exception 'event_type is required';
  end if;

  if coalesce(trim(p_severity), 'info') not in ('info', 'warning', 'critical') then
    raise exception 'invalid severity';
  end if;

  insert into public.security_events (
    company_id,
    actor_user_id,
    scope,
    event_type,
    severity,
    identifier_hash,
    ip,
    user_agent,
    payload
  )
  values (
    p_company_id,
    p_actor_user_id,
    trim(p_scope),
    trim(p_event_type),
    coalesce(trim(p_severity), 'info'),
    nullif(trim(coalesce(p_identifier_hash, '')), ''),
    nullif(trim(coalesce(p_ip, '')), ''),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  delete from public.security_events
  where created_at < now() - interval '90 days';

  return v_id;
end;
$$;

create or replace function public.security_events_report(
  p_company_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  company_id uuid,
  actor_user_id uuid,
  scope text,
  event_type text,
  severity text,
  ip text,
  user_agent text,
  payload jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    se.id,
    se.company_id,
    se.actor_user_id,
    se.scope,
    se.event_type,
    se.severity,
    se.ip,
    se.user_agent,
    se.payload,
    se.created_at
  from public.security_events se
  where se.company_id = p_company_id
    and public.can_company_perform_action(p_company_id, 'finance.governance')
  order by se.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.consume_security_rate_limit(text, text, integer, integer) to authenticated;
grant execute on function public.log_security_event(uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.security_events_report(uuid, integer) to authenticated;
