import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { consumeLoginHandoff } from '@/lib/auth/handoff';
import { getLoginRedirectUrl } from '@/lib/auth/authContext';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
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

  try {
    if (handoff) {
      const sessionPayload = await consumeLoginHandoff(handoff);

      await supabase.auth.setSession({
        access_token: sessionPayload.access_token,
        refresh_token: sessionPayload.refresh_token
      });
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    } else if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
    } else if (tokenHash && type) {
      await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    }
  } catch (error) {
    console.error('Failed to establish intra session from auth callback', error);
    return NextResponse.redirect(getLoginRedirectUrl(null, safeNext));
  }

  return response;
}
