import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext, getLoginRedirectUrl, isStaff } from '@/lib/auth/authContext';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

const ACTIVE_COMPANY_COOKIE = 'active_company_id';

function hasSupabaseAuthCallbackParams(request: NextRequest) {
  return (
    request.nextUrl.searchParams.has('code') ||
    request.nextUrl.searchParams.has('token_hash') ||
    request.nextUrl.searchParams.has('access_token') ||
    request.nextUrl.searchParams.has('refresh_token')
  );
}

function buildAuthCallbackUrl(request: NextRequest) {
  const callbackUrl = new URL('/auth/callback', request.url);
  const nextUrl = new URL(request.url);

  request.nextUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });

  nextUrl.searchParams.delete('code');
  nextUrl.searchParams.delete('token_hash');
  nextUrl.searchParams.delete('type');
  nextUrl.searchParams.delete('access_token');
  nextUrl.searchParams.delete('refresh_token');

  const nextPath = `${nextUrl.pathname}${nextUrl.search}`;
  callbackUrl.searchParams.set('next', nextPath || '/projects');

  return callbackUrl;
}

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/auth') && hasSupabaseAuthCallbackParams(request)) {
    return NextResponse.redirect(buildAuthCallbackUrl(request));
  }

  const response = NextResponse.next({
    request
  });
  const supabase = createMiddlewareSupabaseClient(request, response);

  const path = request.nextUrl.pathname;
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const requiresAuth =
    !path.startsWith('/login') &&
    !path.startsWith('/auth') &&
    !path.startsWith('/_next') &&
    !path.startsWith('/offline') &&
    !path.startsWith('/api/auth'); // Allow auth API routes

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const authContext = await getAuthContext(supabase);
  const redirectUrl = requiresAuth && !isStaff(authContext)
    ? getLoginRedirectUrl(authContext, returnTo)
    : null;

  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl);
  }

  if (isStaff(authContext) && authContext.default_company_id) {
    const currentCompanyId = request.cookies.get(ACTIVE_COMPANY_COOKIE)?.value;
    if (!currentCompanyId) {
      response.cookies.set(ACTIVE_COMPANY_COOKIE, authContext.default_company_id, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production'
      });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)']
};
