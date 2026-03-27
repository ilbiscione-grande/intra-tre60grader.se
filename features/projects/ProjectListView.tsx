'use client';

import { useMemo } from 'react';
import { useMoveProject, useProjectActivitySummaries, useProjectColumns, useProjectCustomers, useProjectMembers, useProjects, useUpdateProjectWorkflowStatus } from '@/features/projects/projectQueries';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import ProjectCard from '@/features/projects/ProjectCard';

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export default function ProjectListView({
  companyId,
  searchTerm = '',
  statusFilter = 'all',
  onlyMine = false,
  currentUserId = null,
  startDateFilter = '',
  endDateFilter = ''
}: {
  companyId: string;
  searchTerm?: string;
  statusFilter?: string;
  onlyMine?: boolean;
  currentUserId?: string | null;
  startDateFilter?: string;
  endDateFilter?: string;
}) {
  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const customersQuery = useProjectCustomers(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const moveMutation = useMoveProject(companyId);
  const updateWorkflowStatusMutation = useUpdateProjectWorkflowStatus(companyId);
  const search = normalizeSearch(searchTerm);

  const columns = columnsQuery.data ?? [];
  const customerById = useMemo(() => new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer.name])), [customersQuery.data]);
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
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (statusFilter !== 'all' && project.status !== statusFilter) return false;
        if (startDateFilter && project.start_date !== startDateFilter) return false;
        if (endDateFilter && project.end_date !== endDateFilter) return false;
        if (
          onlyMine &&
          (!currentUserId ||
            (project.responsible_user_id !== currentUserId &&
              !(membersByProjectId.get(project.id) ?? []).some((member) => member.user_id === currentUserId)))
        ) {
          return false;
        }
        if (!search) return true;

        const members = membersByProjectId.get(project.id) ?? [];
        const responsible = availableMembers.find((member) => member.user_id === project.responsible_user_id) ?? null;
        const haystack = [
          customerById.get(project.customer_id ?? '') ?? '',
          project.title,
          columns.find((column) => column.key === project.status)?.title ?? '',
          responsible
            ? getUserDisplayName({
                displayName: responsible.display_name,
                email: responsible.email,
                handle: responsible.handle,
                userId: responsible.user_id
              })
            : '',
          ...members.map((member) =>
            getUserDisplayName({
              displayName: member.display_name,
              email: member.email,
              handle: member.handle,
              userId: member.user_id
            })
          )
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      }),
    [availableMembers, columns, currentUserId, customerById, endDateFilter, membersByProjectId, onlyMine, projects, search, startDateFilter, statusFilter]
  );

  if (filteredProjects.length === 0) {
    return (
      <p className="rounded-lg bg-muted p-4 text-sm text-foreground/70">
        {search || statusFilter !== 'all' || onlyMine ? 'Inga projekt matchar filtret.' : 'Inga projekt ännu.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {filteredProjects.map((project) => (
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
