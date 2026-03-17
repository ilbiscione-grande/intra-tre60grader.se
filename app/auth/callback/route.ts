import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isAuthDebugEnabled } from '@/lib/auth/debug';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const debug = isAuthDebugEnabled(requestUrl);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = requestUrl.searchParams.get('next') || '/projects';
  const safeNext = next.startsWith('/') ? next : '/projects';
  const response = NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  const supabase = createMiddlewareSupabaseClient(request, response);
  let mode: 'exchangeCodeForSession' | 'setSession' | 'verifyOtp' | 'noop' = 'noop';

  if (code) {
    mode = 'exchangeCodeForSession';
    await supabase.auth.exchangeCodeForSession(code);
  } else if (accessToken && refreshToken) {
    mode = 'setSession';
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
  } else if (tokenHash && type) {
    mode = 'verifyOtp';
    await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  }

  if (debug) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    const { data: authContext, error: authContextError } = user
      ? await supabase.rpc('tre60_auth_context')
      : { data: null, error: null };

    return NextResponse.json({
      stage: 'auth_callback',
      mode,
      next: safeNext,
      has_access_token: Boolean(accessToken),
      has_refresh_token: Boolean(refreshToken),
      user_id: user?.id ?? null,
      user_error: userError?.message ?? null,
      auth_context: authContext ?? null,
      auth_context_error: authContextError?.message ?? null,
      response_cookies: response.cookies.getAll().map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain ?? null,
        path: cookie.path ?? null,
        sameSite: cookie.sameSite ?? null,
        secure: cookie.secure ?? null
      }))
    });
  }

  return response;
}
