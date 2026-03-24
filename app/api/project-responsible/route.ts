import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectMemberRow = Database['public']['Tables']['project_members']['Row'];

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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; projectId?: string; responsibleUserId?: string | null }
    | null;

  const companyId = body?.companyId;
  const projectId = body?.projectId;
  const responsibleUserId =
    typeof body?.responsibleUserId === 'string' && body.responsibleUserId.trim() ? body.responsibleUserId.trim() : null;

  if (!companyId || !projectId) {
    return NextResponse.json({ error: 'companyId and projectId required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  const admin = createAdminClient();

  if (actor.member.role === 'auditor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id,company_id')
    .eq('company_id', companyId)
    .eq('id', projectId)
    .maybeSingle<Pick<ProjectRow, 'id' | 'company_id'>>();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (responsibleUserId) {
    const { data: member, error: memberError } = await admin
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('user_id', responsibleUserId)
      .maybeSingle<Pick<CompanyMemberRow, 'user_id'>>();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Ansvarig användare saknas i bolaget' }, { status: 400 });
    }
  }

  const { error: updateError } = await admin
    .from('projects')
    .update({ responsible_user_id: responsibleUserId })
    .eq('company_id', companyId)
    .eq('id', projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (responsibleUserId) {
    const { data: existingAssignment, error: assignmentError } = await admin
      .from('project_members')
      .select('id')
      .eq('company_id', companyId)
      .eq('project_id', projectId)
      .eq('user_id', responsibleUserId)
      .maybeSingle<Pick<ProjectMemberRow, 'id'>>();

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    if (!existingAssignment) {
      const { error: insertError } = await admin.from('project_members').insert({
        company_id: companyId,
        project_id: projectId,
        user_id: responsibleUserId,
        created_by: actor.user.id
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
