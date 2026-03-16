-- A5 hotfix: expose digest() in public schema for security definer functions using search_path=public.
-- Supabase installs pgcrypto in schema `extensions`, so calls to plain digest(...) fail inside these functions.

create or replace function public.digest(data text, type text)
returns bytea
language sql
immutable
strict
as $$
  select extensions.digest(data, type);
$$;

grant execute on function public.digest(text, text) to authenticated;
