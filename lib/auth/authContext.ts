import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type AuthRole = 'admin' | 'employee' | 'member' | 'customer';
export type AuthStatus = 'active' | 'invited' | 'disabled';

export type AuthContext = {
  user_id: string | null;
  role: AuthRole | null;
  status: AuthStatus | null;
  default_company_id: string | null;
  customer_id: string | null;
  redirect_url: string | null;
};

export type StaffAuthContext = AuthContext & {
  user_id: string;
  role: 'admin' | 'employee' | 'member';
  status: 'active';
};

type ServerSupabaseClient = SupabaseClient<Database>;
type AuthContextResult = AuthContext | AuthContext[] | null;

function getLoginAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_LOGIN_APP_URL || 'https://login.tre60grader.se').replace(/\/+$/, '');
}

function appendRedirectParam(url: URL, returnTo: string) {
  if (returnTo && !url.searchParams.has('redirect')) {
    url.searchParams.set('redirect', returnTo);
  }

  return url;
}

function resolveLoginUrl(pathOrUrl: string, returnTo?: string) {
  const baseUrl = getLoginAppBaseUrl();
  const url = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, `${baseUrl}/`);

  if (url.origin === new URL(baseUrl).origin && url.pathname === '/login') {
    appendRedirectParam(url, returnTo ?? '/');
  }

  return url.toString();
}

export async function getAuthContext(supabase: ServerSupabaseClient = createServerSupabaseClient()): Promise<AuthContext | null> {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase.rpc('tre60_auth_context');

  if (error) {
    console.error('Failed to fetch tre60_auth_context()', error);
    return null;
  }

  if (!data) {
    return null;
  }

  const normalized = Array.isArray(data) ? data[0] ?? null : data;
  return (normalized as AuthContextResult) as AuthContext | null;
}

export function isStaff(authContext: AuthContext | null): authContext is StaffAuthContext {
  return (
    authContext !== null &&
    authContext.user_id !== null &&
    (authContext.role === 'admin' || authContext.role === 'employee' || authContext.role === 'member') &&
    authContext.status === 'active'
  );
}

export function getLoginRedirectUrl(authContext: AuthContext | null, returnTo = '/') {
  if (!authContext) {
    return resolveLoginUrl('/login', returnTo);
  }

  if (authContext.redirect_url) {
    return resolveLoginUrl(authContext.redirect_url, returnTo);
  }

  if (authContext.status === 'disabled') {
    return resolveLoginUrl('/blocked');
  }

  if (authContext.status === 'invited') {
    return resolveLoginUrl('/setup-account');
  }

  return resolveLoginUrl('/login', returnTo);
}

export async function requireStaff(returnTo = '/') {
  const authContext = await getAuthContext();

  if (!isStaff(authContext)) {
    redirect(getLoginRedirectUrl(authContext, returnTo));
  }

  return authContext;
}
