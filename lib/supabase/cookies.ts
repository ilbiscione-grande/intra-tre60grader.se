import type { CookieOptions } from '@supabase/ssr';

function getCookieDomain() {
  const value = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();
  return value ? value : undefined;
}

export function getSupabaseCookieOptions(overrides: CookieOptions = {}): CookieOptions {
  const domain = getCookieDomain();

  return {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    ...overrides,
    ...(domain ? { domain } : {})
  };
}
