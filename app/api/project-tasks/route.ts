import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectTaskRow = Database['public']['Tables']['project_tasks']['Row'];
type ProjectTaskMemberRow = Database['public']['Tables']['project_task_members']['Row'];

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

async function ensureTaskBelongsToCompany(admin: ReturnType<typeof createAdminClient>, companyId: string, taskId: string) {
  const { data: task, error } = await admin
    .from('project_tasks')
    .select('id,project_id')
    .eq('company_id', companyId)
    .eq('id', taskId)
    .maybeSingle<Pick<ProjectTaskRow, 'id' | 'project_id'>>();

  if (error || !task) {
    return { ok: false as const, status: 404, error: 'Task not found' };
  }

  return { ok: true as const, task };
}

async function validateCompanyMemberUserIds(admin: ReturnType<typeof createAdminClient>, companyId: string, userIds: string[]) {
  if (userIds.length === 0) return { ok: true as const };

  const { data: members, error } = await admin
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .in('user_id', userIds)
    .returns<Array<Pick<CompanyMemberRow, 'user_id'>>>();

  if (error) return { ok: false as const, status: 500, error: error.message };

  const validUserIds = new Set((members ?? []).map((member) => member.user_id));
  const invalid = userIds.filter((userId) => !validUserIds.has(userId));
  if (invalid.length > 0) {
    return { ok: false as const, status: 400, error: 'En eller flera användare saknas i bolaget' };
  }

  return { ok: true as const };
}

async function syncTaskMembers(
  admin: ReturnType<typeof createAdminClient>,
  {
    companyId,
    projectId,
    taskId,
    actorUserId,
    memberUserIds,
    assigneeUserId
  }: {
    companyId: string;
    projectId: string;
    taskId: string;
    actorUserId: string;
    memberUserIds: string[];
    assigneeUserId: string | null;
  }
) {
  const nextUserIds = Array.from(new Set([
    ...memberUserIds.filter((value) => typeof value === 'string' && value.trim()),
    ...(assigneeUserId ? [assigneeUserId] : [])
  ]));

  const validation = await validateCompanyMemberUserIds(admin, companyId, nextUserIds);
  if (!validation.ok) return validation;

  const { data: currentAssignments, error: currentError } = await admin
    .from('project_task_members')
    .select('id,user_id')
    .eq('company_id', companyId)
    .eq('task_id', taskId)
    .returns<Array<Pick<ProjectTaskMemberRow, 'id' | 'user_id'>>>();

  if (currentError) {
    return { ok: false as const, status: 500, error: currentError.message };
  }

  const currentUserIds = new Set((currentAssignments ?? []).map((assignment) => assignment.user_id));
  const nextUserIdSet = new Set(nextUserIds);
  const toDelete = (currentAssignments ?? []).filter((assignment) => !nextUserIdSet.has(assignment.user_id));
  const toInsert = nextUserIds.filter((userId) => !currentUserIds.has(userId));

  if (toDelete.length > 0) {
    const { error } = await admin.from('project_task_members').delete().in('id', toDelete.map((row) => row.id));
    if (error) return { ok: false as const, status: 500, error: error.message };
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('project_task_members').insert(
      toInsert.map((userId) => ({
        company_id: companyId,
        project_id: projectId,
        task_id: taskId,
        user_id: userId,
        created_by: actorUserId
      }))
    );
    if (error) return { ok: false as const, status: 500, error: error.message };
  }

  const { data: assignments, error: assignmentsError } = await admin
    .from('project_task_members')
    .select('id,company_id,project_id,task_id,user_id,created_by,created_at')
    .eq('company_id', companyId)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .returns<ProjectTaskMemberRow[]>();

  if (assignmentsError) {
    return { ok: false as const, status: 500, error: assignmentsError.message };
  }

  return { ok: true as const, assignments: assignments ?? [] };
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
        memberUserIds?: string[];
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

  const { data: task, error } = await admin.from('project_tasks').insert({
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
  }).select('id,project_id').single<Pick<ProjectTaskRow, 'id' | 'project_id'>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const taskMembersResult = await syncTaskMembers(admin, {
    companyId,
    projectId,
    taskId: task.id,
    actorUserId: actor.user.id,
    memberUserIds: Array.isArray(body?.memberUserIds) ? body.memberUserIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [],
    assigneeUserId: typeof body?.assigneeUserId === 'string' && body.assigneeUserId.trim() ? body.assigneeUserId : null
  });

  if (!taskMembersResult.ok) {
    return NextResponse.json({ error: taskMembersResult.error }, { status: taskMembersResult.status });
  }

  return NextResponse.json({
    ok: true,
    task: {
      id: task.id,
      title
    },
    taskMembers: taskMembersResult.assignments ?? []
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        taskId?: string;
        patch?: Partial<Pick<ProjectTaskRow, 'status' | 'priority' | 'due_date' | 'assignee_user_id' | 'milestone_id' | 'subtasks'>>;
        memberUserIds?: string[];
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
  const taskCheck = await ensureTaskBelongsToCompany(admin, companyId, taskId);
  if (!taskCheck.ok) {
    return NextResponse.json({ error: taskCheck.error }, { status: taskCheck.status });
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('project_tasks').update(patch).eq('company_id', companyId).eq('id', taskId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Array.isArray(body?.memberUserIds)) {
    const taskMembersResult = await syncTaskMembers(admin, {
      companyId,
      projectId: taskCheck.task.project_id,
      taskId,
      actorUserId: actor.user.id,
      memberUserIds: body.memberUserIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      assigneeUserId:
        typeof patch.assignee_user_id === 'string'
          ? patch.assignee_user_id
          : patch.assignee_user_id === null
            ? null
            : null
    });
    if (!taskMembersResult.ok) {
      return NextResponse.json({ error: taskMembersResult.error }, { status: taskMembersResult.status });
    }
  } else if ('assignee_user_id' in patch) {
    const { data: currentTaskMembers, error: memberReadError } = await admin
      .from('project_task_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('task_id', taskId)
      .returns<Array<Pick<ProjectTaskMemberRow, 'user_id'>>>();

    if (memberReadError) {
      return NextResponse.json({ error: memberReadError.message }, { status: 500 });
    }

    const taskMembersResult = await syncTaskMembers(admin, {
      companyId,
      projectId: taskCheck.task.project_id,
      taskId,
      actorUserId: actor.user.id,
      memberUserIds: (currentTaskMembers ?? []).map((member) => member.user_id),
      assigneeUserId:
        typeof patch.assignee_user_id === 'string'
          ? patch.assignee_user_id
          : patch.assignee_user_id === null
            ? null
            : null
    });
    if (!taskMembersResult.ok) {
      return NextResponse.json({ error: taskMembersResult.error }, { status: taskMembersResult.status });
    }
  }

  const { data: latestAssignments, error: latestAssignmentsError } = await admin
    .from('project_task_members')
    .select('id,company_id,project_id,task_id,user_id,created_by,created_at')
    .eq('company_id', companyId)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .returns<ProjectTaskMemberRow[]>();

  if (latestAssignmentsError) {
    return NextResponse.json({ error: latestAssignmentsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, taskMembers: latestAssignments ?? [] });
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
