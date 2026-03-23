import { createClient } from '@/lib/supabase/client';
import { moveProject } from '@/lib/rpc';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

export type ProjectStatusMoveRule = {
  id: string;
  from_status: string;
  to_status: string;
  enabled: boolean;
};

type AutomationSettingsRow = DbRow<'project_automation_settings'>;

const DEFAULT_AUTOMATION_SETTINGS = {
  watched_statuses: [] as string[],
  create_task_on_watched_status: false,
  watched_status_task_title: 'Följ upp projekt i bevakad kolumn',
  create_update_on_workflow_status_change: true
};

function toRule(value: unknown): ProjectStatusMoveRule | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
  const fromStatus = typeof row.from_status === 'string' && row.from_status.trim() ? row.from_status.trim() : null;
  const toStatus = typeof row.to_status === 'string' && row.to_status.trim() ? row.to_status.trim() : null;
  if (!id || !fromStatus || !toStatus) return null;

  return {
    id,
    from_status: fromStatus,
    to_status: toStatus,
    enabled: row.enabled !== false
  };
}

export function normalizeProjectStatusMoveRules(input: unknown): ProjectStatusMoveRule[] {
  if (!Array.isArray(input)) return [];
  return input.map(toRule).filter((rule): rule is ProjectStatusMoveRule => Boolean(rule));
}

async function getAutomationSettings(companyId: string, supabase = createClient()) {
  const { data, error } = await supabase
    .from('project_automation_settings')
    .select(
      'company_id,watched_statuses,status_move_rules,create_task_on_watched_status,watched_status_task_title,create_update_on_workflow_status_change'
    )
    .eq('company_id', companyId)
    .maybeSingle<
      Pick<
        AutomationSettingsRow,
        | 'company_id'
        | 'watched_statuses'
        | 'status_move_rules'
        | 'create_task_on_watched_status'
        | 'watched_status_task_title'
        | 'create_update_on_workflow_status_change'
      >
    >();

  if (error) throw error;
  return data ?? null;
}

export async function maybeCreateWatchedStatusTask({
  companyId,
  projectId,
  targetStatus
}: {
  companyId: string;
  projectId: string;
  targetStatus: string;
}) {
  const supabase = createClient();
  const settings = await getAutomationSettings(companyId, supabase);
  const watchedStatuses = settings?.watched_statuses ?? DEFAULT_AUTOMATION_SETTINGS.watched_statuses;

  if (!settings?.create_task_on_watched_status || !watchedStatuses.includes(targetStatus)) {
    return { created: false as const };
  }

  const taskTitleBase = settings.watched_status_task_title?.trim() || DEFAULT_AUTOMATION_SETTINGS.watched_status_task_title;
  const taskTitle = `${taskTitleBase}: ${targetStatus}`;

  const { data: existingTask, error: existingError } = await supabase
    .from('project_tasks')
    .select('id')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('title', taskTitle)
    .in('status', ['todo', 'in_progress'])
    .maybeSingle<{ id: string }>();

  if (existingError) throw existingError;
  if (existingTask?.id) return { created: false as const };

  const response = await fetch('/api/project-tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyId,
      projectId,
      title: taskTitle,
      description: `Skapad automatiskt när projektet hamnade i kolumnen ${targetStatus}.`
    })
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte skapa automatisk uppgift');

  return { created: true as const };
}

export async function maybeCreateWorkflowStatusUpdate({
  companyId,
  projectId,
  previousWorkflowStatus,
  nextWorkflowStatus
}: {
  companyId: string;
  projectId: string;
  previousWorkflowStatus: string | null;
  nextWorkflowStatus: string;
}) {
  if (!nextWorkflowStatus || previousWorkflowStatus === nextWorkflowStatus) {
    return { created: false as const };
  }

  const supabase = createClient();
  const settings = await getAutomationSettings(companyId, supabase);
  if (settings?.create_update_on_workflow_status_change === false) {
    return { created: false as const };
  }

  const userId =
    (
      await supabase.auth.getUser().catch(() => ({
        data: { user: null }
      }))
    ).data.user?.id ?? null;

  if (!userId) return { created: false as const };

  const previousLabel = previousWorkflowStatus?.trim() ? previousWorkflowStatus : 'okänd';
  const { error } = await supabase.from('project_updates').insert({
    company_id: companyId,
    project_id: projectId,
    parent_id: null,
    created_by: userId,
    content: `Projektstatus ändrad från ${previousLabel} till ${nextWorkflowStatus}.`
  });

  if (error) throw error;
  return { created: true as const };
}

export async function applyProjectStatusAutomation({
  companyId,
  projectId,
  workflowStatus
}: {
  companyId: string;
  projectId: string;
  workflowStatus: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_automation_settings')
    .select('status_move_rules')
    .eq('company_id', companyId)
    .maybeSingle<{ status_move_rules: unknown }>();

  if (error) throw error;

  const matchingRule = normalizeProjectStatusMoveRules(data?.status_move_rules).find(
    (rule) => rule.enabled && rule.from_status === workflowStatus
  );

  if (!matchingRule) {
    return { applied: false as const, targetStatus: null };
  }

  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('status')
    .eq('company_id', companyId)
    .eq('id', projectId)
    .maybeSingle<{ status: string }>();

  if (projectError) throw projectError;
  if (!projectRow?.status || projectRow.status === matchingRule.to_status) {
    return { applied: false as const, targetStatus: matchingRule.to_status };
  }

  await moveProject(projectId, matchingRule.to_status, 9999);
  await maybeCreateWatchedStatusTask({
    companyId,
    projectId,
    targetStatus: matchingRule.to_status
  });
  return { applied: true as const, targetStatus: matchingRule.to_status };
}
