import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/types';

export type CompanyAction = 'finance.read' | 'finance.write' | 'finance.governance' | 'members.manage';
const STEP_UP_MAX_AGE_MINUTES = 30;

type PermissionResult = {
  ok: true;
  status: 200;
  role: Role;
  userId: string;
  supabase: ReturnType<typeof createClient>;
} | {
  ok: false;
  status: 400 | 401 | 403;
  error: string;
  role: null;
  userId: null;
  supabase: null;
};

function hasActionPermission(role: Role, action: CompanyAction) {
  if (action === 'finance.read') return role === 'finance' || role === 'admin' || role === 'auditor';
  if (action === 'finance.write') return role === 'finance' || role === 'admin';
  if (action === 'finance.governance') return role === 'admin';
  if (action === 'members.manage') return role === 'admin';
  return false;
}

export async function requireCompanyPermission(companyId: string, action: CompanyAction): Promise<PermissionResult> {
  if (!companyId) {
    return { ok: false, status: 400, error: 'companyId required', role: null, userId: null, supabase: null };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized', role: null, userId: null, supabase: null };
  }

  const { data: member, error: memberError } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<{ role: Role }>();

  if (memberError || !member) {
    return { ok: false, status: 403, error: 'Forbidden', role: null, userId: null, supabase: null };
  }

  if (!hasActionPermission(member.role, action)) {
    return { ok: false, status: 403, error: 'Insufficient role for action', role: null, userId: null, supabase: null };
  }

  return { ok: true, status: 200, role: member.role, userId: user.id, supabase };
}

export async function requireRecentSignIn(maxAgeMinutes = STEP_UP_MAX_AGE_MINUTES): Promise<
  | { ok: true; status: 200; userId: string; lastSignInAt: string | null }
  | { ok: false; status: 401 | 403; error: string; userId: string | null; lastSignInAt: string | null }
> {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: 'Unauthorized', userId: null, lastSignInAt: null };
  }

  const lastSignInAt = user.last_sign_in_at ?? null;
  if (!lastSignInAt) {
    return {
      ok: false,
      status: 403,
      error: 'Fresh sign-in required',
      userId: user.id,
      lastSignInAt: null
    };
  }

  const ageMs = Date.now() - new Date(lastSignInAt).getTime();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
    return {
      ok: false,
      status: 403,
      error: `Fresh sign-in required (within ${maxAgeMinutes} minutes)`,
      userId: user.id,
      lastSignInAt
    };
  }

  return { ok: true, status: 200, userId: user.id, lastSignInAt };
}

export async function requireElevatedAdminSession(maxAgeMinutes = STEP_UP_MAX_AGE_MINUTES): Promise<
  | { ok: true; status: 200; userId: string; method: 'aal2' | 'recent_sign_in'; lastSignInAt: string | null }
  | { ok: false; status: 401 | 403; error: string; userId: string | null; lastSignInAt: string | null; needsMfa: boolean }
> {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: 'Unauthorized', userId: null, lastSignInAt: null, needsMfa: false };
  }

  const aalResponse = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = aalResponse.data?.currentLevel ?? null;
  const nextLevel = aalResponse.data?.nextLevel ?? null;

  if (currentLevel === 'aal2') {
    return {
      ok: true,
      status: 200,
      userId: user.id,
      method: 'aal2',
      lastSignInAt: user.last_sign_in_at ?? null
    };
  }

  if (nextLevel === 'aal2') {
    return {
      ok: false,
      status: 403,
      error: 'MFA verification required for this action',
      userId: user.id,
      lastSignInAt: user.last_sign_in_at ?? null,
      needsMfa: true
    };
  }

  const recent = await requireRecentSignIn(maxAgeMinutes);
  if (!recent.ok) {
    return {
      ok: false,
      status: recent.status,
      error: recent.error,
      userId: recent.userId,
      lastSignInAt: recent.lastSignInAt,
      needsMfa: false
    };
  }

  return {
    ok: true,
    status: 200,
    userId: recent.userId,
    method: 'recent_sign_in',
    lastSignInAt: recent.lastSignInAt
  };
}
