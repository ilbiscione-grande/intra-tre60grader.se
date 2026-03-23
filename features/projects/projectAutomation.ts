import { createClient } from '@/lib/supabase/client';
import { moveProject } from '@/lib/rpc';

export type ProjectStatusMoveRule = {
  id: string;
  from_status: string;
  to_status: string;
  enabled: boolean;
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

export async function applyProjectStatusAutomation({
  companyId,
  projectId,
  status
}: {
  companyId: string;
  projectId: string;
  status: string;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('project_automation_settings')
    .select('status_move_rules')
    .eq('company_id', companyId)
    .maybeSingle<{ status_move_rules: unknown }>();

  if (error) throw error;

  const matchingRule = normalizeProjectStatusMoveRules(data?.status_move_rules).find(
    (rule) => rule.enabled && rule.from_status === status && rule.to_status !== status
  );

  if (!matchingRule) {
    return { applied: false as const, targetStatus: null };
  }

  await moveProject(projectId, matchingRule.to_status, 9999);
  return { applied: true as const, targetStatus: matchingRule.to_status };
}
