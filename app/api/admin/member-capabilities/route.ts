import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission, requireElevatedAdminSession, requireRecentSignIn } from '@/lib/auth/companyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getRequestIp, safeLogSecurityEvent } from '@/lib/security/server';
import type { Capability } from '@/lib/types';

const allowedCapabilities: Capability[] = ['finance', 'project_lead', 'reporting', 'team_admin'];

function isAllowedCapability(value: unknown): value is Capability {
  return typeof value === 'string' && allowedCapabilities.includes(value as Capability);
}

function getNeedsMfa(stepUp: { ok: false; needsMfa?: boolean }) {
  return stepUp.needsMfa ?? false;
}

async function requireCapabilityManager(companyId: string) {
  const permission = await requireCompanyPermission(companyId, 'members.manage');
  if (!permission.ok) {
    return {
      ok: false as const,
      status: permission.status,
      message: permission.error,
      userId: null,
      role: null
    };
  }

  return {
    ok: true as const,
    status: 200,
    message: 'ok',
    userId: permission.userId,
    role: permission.role
  };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireCapabilityManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('company_member_capabilities')
    .select('id,company_id,user_id,capability,created_at,created_by')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ capabilities: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = body?.companyId as string | undefined;
  const userId = body?.userId as string | undefined;
  const capability = body?.capability;

  if (!companyId || !userId || !isAllowedCapability(capability)) {
    return NextResponse.json({ error: 'companyId, userId and valid capability are required' }, { status: 400 });
  }

  const auth = await requireCapabilityManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stepUp = auth.role === 'admin' ? await requireElevatedAdminSession() : await requireRecentSignIn();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.member_capabilities',
      eventType: 'admin.member_capability.step_up_blocked',
      severity: 'warning',
      ip: getRequestIp(request),
      userAgent: request.headers.get('user-agent'),
      payload: {
        reason: stepUp.error,
        last_sign_in_at: stepUp.lastSignInAt,
        needs_mfa: getNeedsMfa(stepUp)
      }
    });

    return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });
  }

  const supabase = createClient();
  const { error } = await supabase.from('company_member_capabilities').upsert(
    {
      company_id: companyId,
      user_id: userId,
      capability
    },
    { onConflict: 'company_id,user_id,capability' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.member_capabilities',
    eventType: 'admin.member_capability.added',
    severity: 'info',
    identifier: userId,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      target_user_id: userId,
      capability
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const userId = request.nextUrl.searchParams.get('userId');
  const capability = request.nextUrl.searchParams.get('capability');

  if (!companyId || !userId || !isAllowedCapability(capability)) {
    return NextResponse.json({ error: 'companyId, userId and valid capability are required' }, { status: 400 });
  }

  const auth = await requireCapabilityManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stepUp = auth.role === 'admin' ? await requireElevatedAdminSession() : await requireRecentSignIn();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.member_capabilities',
      eventType: 'admin.member_capability.step_up_blocked',
      severity: 'warning',
      ip: getRequestIp(request),
      userAgent: request.headers.get('user-agent'),
      payload: {
        reason: stepUp.error,
        last_sign_in_at: stepUp.lastSignInAt,
        needs_mfa: getNeedsMfa(stepUp)
      }
    });

    return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('company_member_capabilities')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('capability', capability);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.member_capabilities',
    eventType: 'admin.member_capability.removed',
    severity: 'warning',
    identifier: userId,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      target_user_id: userId,
      capability
    }
  });

  return NextResponse.json({ ok: true });
}
