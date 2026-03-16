import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';
import { getSupabaseCookieOptions } from '@/lib/supabase/cookies';

export function createMiddlewareSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const cookieOptions = getSupabaseCookieOptions(options);
          request.cookies.set({ name, value, ...cookieOptions });
          response.cookies.set({ name, value, ...cookieOptions });
        },
        remove(name: string, options: CookieOptions) {
          const cookieOptions = getSupabaseCookieOptions(options);
          request.cookies.set({ name, value: '', ...cookieOptions });
          response.cookies.set({ name, value: '', ...cookieOptions });
        }
      }
    }
  );
}
