import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isAuthDebugEnabled } from '@/lib/auth/debug';
import { consumeLoginHandoff } from '@/lib/auth/handoff';
import { getLoginRedirectUrl } from '@/lib/auth/authContext';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

function getAuthErrorUrl(requestUrl: URL, reason: string, next: string) {
  const url = new URL('/auth/error', requestUrl.origin);
  url.searchParams.set('reason', reason);
  url.searchParams.set('next', next);
  return url;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const debug = isAuthDebugEnabled(requestUrl);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const handoff = requestUrl.searchParams.get('handoff');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = requestUrl.searchParams.get('next') || '/projects';
  const safeNext = next.startsWith('/') ? next : '/projects';
  const response = NextResponse.redirect(new URL(safeNext, requestUrl.origin));
  const supabase = createMiddlewareSupabaseClient(request, response);
  let mode: 'handoff' | 'exchangeCodeForSession' | 'setSession' | 'verifyOtp' | 'noop' = 'noop';
  let handoffConsumeStatus: number | null = null;

  try {
    if (handoff) {
      mode = 'handoff';
      const sessionPayload = await consumeLoginHandoff(handoff);
      handoffConsumeStatus = 200;

      await supabase.auth.setSession({
        access_token: sessionPayload.access_token,
        refresh_token: sessionPayload.refresh_token
      });
    } else if (code) {
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
  } catch (error) {
    console.error('Failed to establish intra session from auth callback', error);
    const reason =
      error instanceof Error && error.message === 'Missing AUTH_HANDOFF_SHARED_SECRET'
        ? 'missing_handoff_secret'
        : handoff
          ? 'handoff_consume_failed'
          : 'callback_failed';

    if (debug) {
      return NextResponse.json({
        stage: 'auth_callback',
        mode,
        next: safeNext,
        handoff_present: Boolean(handoff),
        handoff_consume_status: handoffConsumeStatus,
        error: error instanceof Error ? error.message : 'Unknown callback error',
        redirect_to: getAuthErrorUrl(requestUrl, reason, safeNext).toString()
      }, { status: 500 });
    }

    return NextResponse.redirect(getAuthErrorUrl(requestUrl, reason, safeNext));
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  const { data: authContext, error: authContextError } = user
    ? await supabase.rpc('tre60_auth_context')
    : { data: null, error: null };
  const responseCookies = response.cookies.getAll().map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain ?? null,
    path: cookie.path ?? null,
    sameSite: cookie.sameSite ?? null,
    secure: cookie.secure ?? null
  }));

  if (debug) {
    return NextResponse.json({
      stage: 'auth_callback',
      mode,
      next: safeNext,
      handoff_present: Boolean(handoff),
      handoff_consume_status: handoffConsumeStatus,
      user_id: user?.id ?? null,
      user_error: userError?.message ?? null,
      auth_context: authContext ?? null,
      auth_context_error: authContextError?.message ?? null,
      response_cookies: responseCookies,
      redirect_to: !user
        ? getAuthErrorUrl(requestUrl, 'session_not_established', safeNext).toString()
        : !authContext
          ? getAuthErrorUrl(requestUrl, 'auth_context_missing', safeNext).toString()
          : new URL(safeNext, requestUrl.origin).toString()
    });
  }

  if (!user) {
    return NextResponse.redirect(getAuthErrorUrl(requestUrl, 'session_not_established', safeNext));
  }

  if (!authContext || authContextError) {
    return NextResponse.redirect(getAuthErrorUrl(requestUrl, 'auth_context_missing', safeNext));
  }

  return response;
}
