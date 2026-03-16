import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission, requireElevatedAdminSession } from '@/lib/auth/companyPermissions';
import { getRequestIp, safeLogSecurityEvent } from '@/lib/security/server';

type SupabaseUntyped = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; lockedUntil?: string | null } | null;
  const companyId = body?.companyId;

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireCompanyPermission(companyId, 'finance.governance');
  if (!auth.ok || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stepUp = await requireElevatedAdminSession();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.period_lock',
      eventType: 'period_lock.step_up_blocked',
      severity: 'warning',
      ip: getRequestIp(request),
      userAgent: request.headers.get('user-agent'),
      payload: {
        reason: stepUp.error,
        last_sign_in_at: stepUp.lastSignInAt,
        needs_mfa: stepUp.needsMfa
      }
    });

    return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });
  }

  const lockedUntil = parseDate(body?.lockedUntil ?? null);
  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { data, error } = await supabase.rpc('set_period_lock', {
    p_company_id: companyId,
    p_locked_until: lockedUntil
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.period_lock',
    eventType: lockedUntil ? 'period_lock.updated' : 'period_lock.cleared',
    severity: 'info',
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      locked_until: lockedUntil
    }
  });

  return NextResponse.json({ result: data ?? null });
}
