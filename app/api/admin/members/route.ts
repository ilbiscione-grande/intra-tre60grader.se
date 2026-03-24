import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission, requireElevatedAdminSession, requireRecentSignIn } from '@/lib/auth/companyPermissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRequestIp, safeLogSecurityEvent } from '@/lib/security/server';
import type { Database } from '@/lib/supabase/database.types';
import type { Role } from '@/lib/types';
import { PROFILE_BADGE_PREFERENCE_KEY } from '@/features/profile/profileBadge';
import { resolveUserDisplayName } from '@/lib/users/displayName';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type UserPreferenceRow = Database['public']['Tables']['user_company_preferences']['Row'];

const allowedRoles: Role[] = ['member', 'finance', 'admin', 'auditor'];

function normalizeMemberRole(role: unknown): Role {
  if (role === 'employee') return 'member';
  if (role === 'finance' || role === 'admin' || role === 'auditor' || role === 'member') return role;
  return 'member';
}

function isAllowedRole(value: unknown): value is Role {
  return typeof value === 'string' && allowedRoles.includes(value as Role);
}

async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users ?? [];
    const found = users.find((u) => (u.email ?? '').toLowerCase() === normalized);
    if (found) return found;

    if (users.length < perPage) return null;
    page += 1;
  }
}

async function requireTeamManager(companyId: string) {
  const permission = await requireCompanyPermission(companyId, 'members.manage');
  if (!permission.ok) {
    return {
      ok: false as const,
      status: permission.status,
      message: permission.error,
      userId: null,
      role: null as Role | null
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

function getNeedsMfa(stepUp: { ok: false; needsMfa?: boolean }) {
  return stepUp.needsMfa ?? false;
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireTeamManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const admin = createAdminClient();
  const [{ data: members, error }, { data: preferences, error: preferencesError }] = await Promise.all([
    admin
      .from('company_members')
      .select('id,company_id,user_id,role,created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .returns<Array<Pick<CompanyMemberRow, 'id' | 'company_id' | 'user_id' | 'role' | 'created_at'>>>(),
    admin
      .from('user_company_preferences')
      .select('user_id,preference_value')
      .eq('company_id', companyId)
      .eq('preference_key', PROFILE_BADGE_PREFERENCE_KEY)
      .returns<Array<Pick<UserPreferenceRow, 'user_id' | 'preference_value'>>>()
  ]);

  if (error || preferencesError) {
    return NextResponse.json({ error: error?.message ?? preferencesError?.message ?? 'Kunde inte läsa medlemmar' }, { status: 500 });
  }

  const displayNameByUserId = new Map(
    (preferences ?? []).map((preference) => {
      const value = preference.preference_value;
      const displayName =
        value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).display_name === 'string'
          ? (((value as Record<string, unknown>).display_name as string).trim() || null)
          : null;
      return [preference.user_id, displayName] as const;
    })
  );

  const enriched = await Promise.all(
    (members ?? []).map(async (member) => {
      let userData: Awaited<ReturnType<typeof admin.auth.admin.getUserById>>['data'] | null = null;
      try {
        const result = await admin.auth.admin.getUserById(member.user_id);
        userData = result.data;
      } catch {
        userData = null;
      }
      const email = userData?.user?.email ?? null;
      return {
        ...member,
        role: normalizeMemberRole(member.role),
        email,
        display_name: resolveUserDisplayName({
          displayName: displayNameByUserId.get(member.user_id) ?? null,
          metadata: userData?.user?.user_metadata,
          email,
          handle: email?.split('@')[0]?.toLowerCase() ?? null,
          userId: member.user_id
        })
      };
    })
  );

  return NextResponse.json({ members: enriched });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = body?.companyId as string | undefined;
  const email = body?.email as string | undefined;
  const role = body?.role;

  if (!companyId || !email || !isAllowedRole(role)) {
    return NextResponse.json({ error: 'companyId, email and valid role are required' }, { status: 400 });
  }

  const auth = await requireTeamManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stepUp = auth.role === 'admin' ? await requireElevatedAdminSession() : await requireRecentSignIn();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.members',
      eventType: 'admin.member.step_up_blocked',
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

  const normalizedEmail = email.trim().toLowerCase();
  let user = await findUserByEmail(normalizedEmail);
  let invited = false;

  if (!user) {
    const admin = createAdminClient();
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${request.nextUrl.origin}/auth/callback`
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    user = inviteData.user ?? null;
    invited = true;
  }

  if (!user) {
    return NextResponse.json({ error: 'Kunde inte skapa eller hitta användare' }, { status: 500 });
  }

  const supabase = createClient();
  const { error } = await supabase.from('company_members').upsert(
    {
      company_id: companyId,
      user_id: user.id,
      role
    },
    { onConflict: 'company_id,user_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.members',
    eventType: invited ? 'admin.member.invited' : 'admin.member.role_assigned',
    severity: 'info',
    identifier: normalizedEmail,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      target_user_id: user.id,
      role,
      invited
    }
  });

  return NextResponse.json({ ok: true, invited });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = body?.companyId as string | undefined;
  const userId = body?.userId as string | undefined;
  const role = body?.role;

  if (!companyId || !userId || !isAllowedRole(role)) {
    return NextResponse.json({ error: 'companyId, userId and valid role are required' }, { status: 400 });
  }

  const auth = await requireTeamManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stepUp = auth.role === 'admin' ? await requireElevatedAdminSession() : await requireRecentSignIn();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.members',
      eventType: 'admin.member.step_up_blocked',
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
    .from('company_members')
    .update({ role })
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.members',
    eventType: 'admin.member.role_updated',
    severity: 'info',
    identifier: userId,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      target_user_id: userId,
      role
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const userId = request.nextUrl.searchParams.get('userId');

  if (!companyId || !userId) {
    return NextResponse.json({ error: 'companyId and userId are required' }, { status: 400 });
  }

  const auth = await requireTeamManager(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stepUp = auth.role === 'admin' ? await requireElevatedAdminSession() : await requireRecentSignIn();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.members',
      eventType: 'admin.member.step_up_blocked',
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

  if (auth.userId === userId) {
    return NextResponse.json({ error: 'You cannot remove yourself from the company' }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('company_members')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.members',
    eventType: 'admin.member.removed',
    severity: 'warning',
    identifier: userId,
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      target_user_id: userId
    }
  });

  return NextResponse.json({ ok: true });
}
