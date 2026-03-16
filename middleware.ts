import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext, getLoginRedirectUrl, isStaff } from '@/lib/auth/authContext';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

const ACTIVE_COMPANY_COOKIE = 'active_company_id';

export async function middleware(request: NextRequest) {
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

  await supabase.auth.getUser();

  const authContext = await getAuthContext(supabase);

  if (requiresAuth && !isStaff(authContext)) {
    const redirectUrl = getLoginRedirectUrl(authContext, returnTo);
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

