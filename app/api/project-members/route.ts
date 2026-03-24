import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_PROFILE_BADGE_COLOR, PROFILE_AVATAR_BUCKET, PROFILE_BADGE_PREFERENCE_KEY } from '@/features/profile/profileBadge';
import type { Json, Database } from '@/lib/supabase/database.types';
import { resolveUserDisplayName } from '@/lib/users/displayName';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type ProjectMemberRow = Database['public']['Tables']['project_members']['Row'];
type UserPreferenceRow = Database['public']['Tables']['user_company_preferences']['Row'];

function normalizeMemberRole(role: unknown): 'member' | 'finance' | 'admin' | 'auditor' {
  if (role === 'employee') return 'member';
  if (role === 'finance' || role === 'admin' || role === 'auditor' || role === 'member') return role;
  return 'member';
}

function parseProfilePreference(value: Json | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { color: DEFAULT_PROFILE_BADGE_COLOR, avatarPath: null as string | null, emoji: null as string | null, displayName: null as string | null };
  }

  const record = value as Record<string, unknown>;
  return {
    color: typeof record.color === 'string' && record.color.trim() ? record.color : DEFAULT_PROFILE_BADGE_COLOR,
    avatarPath: typeof record.avatar_path === 'string' && record.avatar_path.trim() ? record.avatar_path : null,
    emoji: typeof record.emoji === 'string' && record.emoji.trim() ? record.emoji : null,
    displayName: typeof record.display_name === 'string' && record.display_name.trim() ? record.display_name.trim() : null
  };
}

async function getActor(companyId: string) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401, error: 'Unauthorized', supabase };
  }

  const { data: member, error } = await supabase
    .from('company_members')
    .select('role,user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<Pick<CompanyMemberRow, 'role' | 'user_id'>>();

  if (error || !member) {
    return { ok: false as const, status: 403, error: 'Forbidden', supabase };
  }

  return { ok: true as const, status: 200, user, member, supabase };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const admin = createAdminClient();

  const [{ data: assignments, error: assignmentError }, { data: members, error: membersError }, { data: preferences, error: prefError }] =
    await Promise.all([
      admin
        .from('project_members')
        .select('id,company_id,project_id,user_id,created_by,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .returns<ProjectMemberRow[]>(),
      admin
        .from('company_members')
        .select('id,company_id,user_id,role,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .returns<CompanyMemberRow[]>(),
      admin
        .from('user_company_preferences')
        .select('user_id,preference_value')
        .eq('company_id', companyId)
        .eq('preference_key', PROFILE_BADGE_PREFERENCE_KEY)
        .returns<Array<Pick<UserPreferenceRow, 'user_id' | 'preference_value'>>>()
    ]);

  if (assignmentError || membersError || prefError) {
    return NextResponse.json({ error: assignmentError?.message ?? membersError?.message ?? prefError?.message ?? 'Kunde inte läsa projektmedlemmar' }, { status: 500 });
  }

  const prefByUserId = new Map(
    (preferences ?? []).map((pref) => {
      const parsed = parseProfilePreference(pref.preference_value);
      return [pref.user_id, parsed] as const;
    })
  );

  const memberRecords = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: userData } = await admin.auth.admin.getUserById(member.user_id);
      const email = userData.user?.email ?? null;
      const handle = email?.split('@')[0]?.toLowerCase() ?? null;
      const pref = prefByUserId.get(member.user_id) ?? { color: DEFAULT_PROFILE_BADGE_COLOR, avatarPath: null, emoji: null, displayName: null };
      let avatarUrl: string | null = null;

      if (pref.avatarPath) {
        const { data: signed } = await admin.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(pref.avatarPath, 60 * 60);
        avatarUrl = signed?.signedUrl ?? null;
      }

      return {
        ...member,
        role: normalizeMemberRole(member.role),
        email,
        handle,
        display_name: resolveUserDisplayName({
          displayName: pref.displayName,
          metadata: userData.user?.user_metadata,
          email,
          handle,
          userId: member.user_id
        }),
        color: pref.color,
        avatar_path: pref.avatarPath,
        avatar_url: avatarUrl,
        emoji: pref.emoji
      };
    })
  );

  return NextResponse.json({
    availableMembers: memberRecords,
    assignments: (assignments ?? []).map((assignment) => ({
      ...assignment,
      member: memberRecords.find((member) => member.user_id === assignment.user_id) ?? null
    }))
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; projectId?: string; userIds?: string[] }
    | null;

  const companyId = body?.companyId;
  const projectId = body?.projectId;
  const userIds = Array.from(new Set((body?.userIds ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0)));

  if (!companyId || !projectId) {
    return NextResponse.json({ error: 'companyId and projectId required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  if (!['admin', 'member', 'finance'].includes(actor.member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: project, error: projectError } = await actor.supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', projectId)
    .maybeSingle<{ id: string }>();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (userIds.length > 0) {
    const { data: existingMembers, error: existingMembersError } = await actor.supabase
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .in('user_id', userIds)
      .returns<Array<Pick<CompanyMemberRow, 'user_id'>>>();

    if (existingMembersError) {
      return NextResponse.json({ error: existingMembersError.message }, { status: 500 });
    }

    const validUserIds = new Set((existingMembers ?? []).map((member) => member.user_id));
    const invalid = userIds.filter((userId) => !validUserIds.has(userId));
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'En eller flera användare saknas i bolaget' }, { status: 400 });
    }
  }

  const { data: currentAssignments, error: currentError } = await actor.supabase
    .from('project_members')
    .select('id,user_id')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .returns<Array<Pick<ProjectMemberRow, 'id' | 'user_id'>>>();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  const currentUserIds = new Set((currentAssignments ?? []).map((assignment) => assignment.user_id));
  const nextUserIds = new Set(userIds);
  const toDelete = (currentAssignments ?? []).filter((assignment) => !nextUserIds.has(assignment.user_id));
  const toInsert = userIds.filter((userId) => !currentUserIds.has(userId));

  if (toDelete.length > 0) {
    const { error } = await actor.supabase.from('project_members').delete().in('id', toDelete.map((row) => row.id));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await actor.supabase.from('project_members').insert(
      toInsert.map((userId) => ({
        company_id: companyId,
        project_id: projectId,
        user_id: userId,
        created_by: actor.user.id
      }))
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
