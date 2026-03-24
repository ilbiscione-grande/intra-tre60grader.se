import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';
import { PROFILE_BADGE_PREFERENCE_KEY } from '@/features/profile/profileBadge';
import { resolveUserDisplayName } from '@/lib/users/displayName';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type UserPreferenceRow = Database['public']['Tables']['user_company_preferences']['Row'];

function normalizeMemberRole(role: unknown): 'member' | 'finance' | 'admin' | 'auditor' {
  if (role === 'employee') return 'member';
  if (role === 'finance' || role === 'admin' || role === 'auditor' || role === 'member') return role;
  return 'member';
}

async function listAuthUsersById() {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return new Map<string, { email: string | null; user_metadata: Record<string, unknown> | null }>();
  }
  const usersById = new Map<string, { email: string | null; user_metadata: Record<string, unknown> | null }>();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users ?? [];
    for (const user of users) {
      usersById.set(user.id, {
        email: user.email ?? null,
        user_metadata: (user.user_metadata as Record<string, unknown> | null) ?? null
      });
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return usersById;
}

async function requireMember(companyId: string) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401, message: 'Unauthorized' };
  }

  const { data: member, error } = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<Pick<CompanyMemberRow, 'user_id'>>();

  if (error || !member) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return { ok: true as const, status: 200, message: 'ok' };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireMember(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const admin = createAdminClient();
  const [{ data: members, error }, { data: preferences, error: preferencesError }, authUsersById] = await Promise.all([
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
      .returns<Array<Pick<UserPreferenceRow, 'user_id' | 'preference_value'>>>(),
    listAuthUsersById()
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
      const authUser = authUsersById.get(member.user_id) ?? null;
      const email = authUser?.email ?? null;
      const handle = email?.split('@')[0]?.toLowerCase() ?? null;

      return {
        ...member,
        role: normalizeMemberRole(member.role),
        email,
        handle,
        display_name: resolveUserDisplayName({
          displayName: displayNameByUserId.get(member.user_id) ?? null,
          metadata: authUser?.user_metadata ?? null,
          email,
          handle,
          userId: member.user_id
        })
      };
    })
  );

  return NextResponse.json({ members: enriched });
}
