import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectTaskRow = Database['public']['Tables']['project_tasks']['Row'];

async function getActor(companyId: string) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401, error: 'Unauthorized', user: null, member: null };
  }

  const { data: member, error: memberError } = await supabase
    .from('company_members')
    .select('role,user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<Pick<CompanyMemberRow, 'role' | 'user_id'>>();

  if (memberError || !member) {
    return { ok: false as const, status: 403, error: 'Forbidden', user: null, member: null };
  }

  if (member.role === 'auditor') {
    return { ok: false as const, status: 403, error: 'Auditor cannot manage tasks', user: null, member: null };
  }

  return { ok: true as const, status: 200, error: null, user, member };
}

async function ensureProjectBelongsToCompany(admin: ReturnType<typeof createAdminClient>, companyId: string, projectId: string) {
  const { data: project, error } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', projectId)
    .maybeSingle<Pick<ProjectRow, 'id'>>();

  if (error || !project) {
    return { ok: false as const, status: 404, error: 'Project not found' };
  }

  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        projectId?: string;
        title?: string;
        description?: string | null;
        priority?: ProjectTaskRow['priority'];
        dueDate?: string | null;
        assigneeUserId?: string | null;
        milestoneId?: string | null;
        subtasks?: ProjectTaskRow['subtasks'];
      }
    | null;

  const companyId = body?.companyId;
  const projectId = body?.projectId;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (!companyId || !projectId || !title) {
    return NextResponse.json({ error: 'companyId, projectId and title are required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const admin = createAdminClient();
  const projectCheck = await ensureProjectBelongsToCompany(admin, companyId, projectId);
  if (!projectCheck.ok) {
    return NextResponse.json({ error: projectCheck.error }, { status: projectCheck.status });
  }

  const { error } = await admin.from('project_tasks').insert({
    company_id: companyId,
    project_id: projectId,
    title,
    description: typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null,
    status: 'todo',
    priority: body?.priority === 'low' || body?.priority === 'high' || body?.priority === 'normal' ? body.priority : 'normal',
    due_date: typeof body?.dueDate === 'string' && body.dueDate.trim() ? body.dueDate : null,
    assignee_user_id: typeof body?.assigneeUserId === 'string' && body.assigneeUserId.trim() ? body.assigneeUserId : null,
    milestone_id: typeof body?.milestoneId === 'string' && body.milestoneId.trim() ? body.milestoneId : null,
    subtasks: Array.isArray(body?.subtasks) ? body.subtasks : []
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        taskId?: string;
        patch?: Partial<Pick<ProjectTaskRow, 'status' | 'priority' | 'due_date' | 'assignee_user_id' | 'milestone_id' | 'subtasks'>>;
      }
    | null;

  const companyId = body?.companyId;
  const taskId = body?.taskId;
  const patch = body?.patch ?? null;

  if (!companyId || !taskId || !patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'companyId, taskId and patch are required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('project_tasks').update(patch).eq('company_id', companyId).eq('id', taskId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const taskId = request.nextUrl.searchParams.get('taskId');

  if (!companyId || !taskId) {
    return NextResponse.json({ error: 'companyId and taskId are required' }, { status: 400 });
  }

  const actor = await getActor(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('project_tasks').delete().eq('company_id', companyId).eq('id', taskId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

