'use client';

import { useMemo } from 'react';
import { useMoveProject, useProjectActivitySummaries, useProjectColumns, useProjectMembers, useProjects, useUpdateProjectWorkflowStatus } from '@/features/projects/projectQueries';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import ProjectCard from '@/features/projects/ProjectCard';

export default function ProjectListView({ companyId }: { companyId: string }) {
  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const moveMutation = useMoveProject(companyId);
  const updateWorkflowStatusMutation = useUpdateProjectWorkflowStatus(companyId);

  const columns = columnsQuery.data ?? [];
  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort((a, b) => {
        const updatedDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        if (updatedDiff !== 0) return updatedDiff;
        return a.position - b.position;
      }),
    [projectsQuery.data]
  );
  const availableMembers = projectMembersQuery.data?.availableMembers ?? [];
  const membersByProjectId = useMemo(() => {
    const next = new Map<string, NonNullable<React.ComponentProps<typeof ProjectCard>['members']>>();
    for (const assignment of projectMembersQuery.data?.assignments ?? []) {
      if (!assignment.member) continue;
      const current = next.get(assignment.project_id) ?? [];
      current.push(assignment.member);
      next.set(assignment.project_id, current);
    }
    return next;
  }, [projectMembersQuery.data?.assignments]);
  const activitySummaryByProjectId = useMemo(() => {
    const next = new Map<string, NonNullable<React.ComponentProps<typeof ProjectCard>['activitySummary']>>();
    for (const item of activitySummariesQuery.data ?? []) {
      const actor = item.actor_user_id ? availableMembers.find((member) => member.user_id === item.actor_user_id) ?? null : null;
      next.set(item.project_id, {
        ...item,
        actorLabel: actor
          ? getUserDisplayName({
              displayName: actor.display_name,
              email: actor.email,
              handle: actor.handle,
              userId: actor.user_id
            })
          : null
      });
    }
    return next;
  }, [activitySummariesQuery.data, availableMembers]);

  if (projects.length === 0) {
    return <p className="rounded-lg bg-muted p-4 text-sm text-foreground/70">Inga projekt ännu.</p>;
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          statusLabel={columns.find((column) => column.key === (project.workflow_status ?? project.status))?.title ?? project.workflow_status ?? project.status}
          statusOptions={columns.map((column) => ({ key: column.key, title: column.title }))}
          columnOptions={columns.map((column) => ({ key: column.key, title: column.title }))}
          onSetWorkflowStatus={(cardProject, workflowStatus) =>
            updateWorkflowStatusMutation.mutate({ projectId: cardProject.id, workflowStatus })
          }
          onMoveToColumn={(cardProject, status) =>
            moveMutation.mutate({ project: cardProject, toStatus: status, toPosition: 9999 })
          }
          isUpdatingWorkflowStatus={updateWorkflowStatusMutation.isPending}
          members={membersByProjectId.get(project.id) ?? []}
          availableMembers={availableMembers}
          activitySummary={activitySummaryByProjectId.get(project.id)}
        />
      ))}
    </div>
  );
}
