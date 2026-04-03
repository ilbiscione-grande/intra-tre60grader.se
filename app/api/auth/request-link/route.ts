import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { consumeSecurityRateLimit, getRequestIp, normalizeEmail, safeLogSecurityEvent } from '@/lib/security/server';
import { getIntraAuthCallbackUrl } from '@/lib/url/appUrl';

const LOGIN_IP_WINDOW_SECONDS = 15 * 60;
const LOGIN_IP_MAX_ATTEMPTS = 8;
const LOGIN_EMAIL_WINDOW_SECONDS = 15 * 60;
const LOGIN_EMAIL_MAX_ATTEMPTS = 4;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Ange en giltig e-postadress.' }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const userAgent = request.headers.get('user-agent');

  const [ipLimit, emailLimit] = await Promise.all([
    consumeSecurityRateLimit({
      scope: 'auth.magic_link.ip',
      identifier: ip,
      windowSeconds: LOGIN_IP_WINDOW_SECONDS,
      maxAttempts: LOGIN_IP_MAX_ATTEMPTS
    }),
    consumeSecurityRateLimit({
      scope: 'auth.magic_link.email',
      identifier: email,
      windowSeconds: LOGIN_EMAIL_WINDOW_SECONDS,
      maxAttempts: LOGIN_EMAIL_MAX_ATTEMPTS
    })
  ]);

  if (!ipLimit.allowed || !emailLimit.allowed) {
    await safeLogSecurityEvent({
      scope: 'auth',
      eventType: 'auth.magic_link.rate_limited',
      severity: 'warning',
      identifier: email,
      ip,
      userAgent,
      payload: {
        ip_remaining: ipLimit.remaining,
        email_remaining: emailLimit.remaining,
        ip_reset_at: ipLimit.resetAt,
        email_reset_at: emailLimit.resetAt
      }
    });

    return NextResponse.json(
      { error: 'För många inloggningsförsök. Vänta en stund och försök igen.' },
      { status: 429 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase-konfiguration saknas.' }, { status: 500 });
  }

  const supabase = createSupabaseClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getIntraAuthCallbackUrl()
    }
  });

  console.log('[auth/request-link] signInWithOtp result', {
    email,
    hasError: Boolean(error),
    errorMessage: error?.message ?? null
  });

  if (error) {
    await safeLogSecurityEvent({
      scope: 'auth',
      eventType: 'auth.magic_link.failed',
      severity: 'warning',
      identifier: email,
      ip,
      userAgent,
      payload: {
        message: error.message
      }
    });

    return NextResponse.json(
      {
        error: error.message || 'Kunde inte skicka inloggningslänk.'
      },
      { status: 500 }
    );
  }

  await safeLogSecurityEvent({
    scope: 'auth',
    eventType: 'auth.magic_link.requested',
    severity: 'info',
    identifier: email,
    ip,
    userAgent
  });

  return NextResponse.json({ ok: true, message: 'Magisk länk skickad. Kontrollera din e-post.' });
}
