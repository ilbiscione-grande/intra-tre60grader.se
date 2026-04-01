'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';
import { AlertTriangle, Clock3, FolderKanban, UserRound } from 'lucide-react';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Badge } from '@/components/ui/badge';
import { useProjectActivitySummaries, useProjectColumns, useProjectCustomers, useProjectMembers, useProjects, type ProjectActivitySummary } from '@/features/projects/projectQueries';
import { getUserDisplayName } from '@/features/profile/profileBadge';

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
}

function formatProjectDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('sv-SE');
}

function statusTone(status: string) {
  const map: Record<string, string> = {
    todo: 'border-slate-200/80 bg-slate-100/80 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    in_progress: 'border-sky-200/80 bg-sky-100/80 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    review: 'border-amber-200/80 bg-amber-100/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    done: 'border-emerald-200/80 bg-emerald-100/80 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
  };
  return map[status] ?? 'border-border/70 bg-muted/40 text-foreground/80';
}

function SummaryMetric({
  icon: Icon,
  title,
  value,
  helper,
  tone
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  helper: string;
  tone: 'blue' | 'amber' | 'violet' | 'emerald';
}) {
  const toneClasses = {
    blue: 'border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/25',
    amber: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/25',
    violet: 'border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/25',
    emerald: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25'
  } as const;

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-foreground/65">{helper}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/80 text-foreground/70">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export default function ProjectListView({
  companyId,
  searchTerm = '',
  statusFilter = 'all',
  onStatusFilterChange,
  statusOptions = [],
  selectedMemberIds = [],
  startDateFilter = '',
  endDateFilter = ''
}: {
  companyId: string;
  searchTerm?: string;
  statusFilter?: string;
  onStatusFilterChange?: (next: string) => void;
  statusOptions?: Array<{ key: string; title: string }>;
  selectedMemberIds?: string[];
  startDateFilter?: string;
  endDateFilter?: string;
}) {
  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const customersQuery = useProjectCustomers(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const search = normalizeSearch(searchTerm);

  const columns = columnsQuery.data ?? [];
  const resolvedStatusOptions = statusOptions.length > 0 ? statusOptions : [{ key: 'all', title: 'Alla projekt' }, ...columns.map((column) => ({ key: column.key, title: column.title }))];
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
    const next = new Map<string, (typeof availableMembers)>();
    for (const assignment of projectMembersQuery.data?.assignments ?? []) {
      if (!assignment.member) continue;
      const current = next.get(assignment.project_id) ?? [];
      current.push(assignment.member);
      next.set(assignment.project_id, current);
    }
    return next;
  }, [availableMembers, projectMembersQuery.data?.assignments]);
  const activitySummaryByProjectId = useMemo(() => {
    const next = new Map<string, ProjectActivitySummary>();
    for (const item of activitySummariesQuery.data ?? []) {
      next.set(item.project_id, item);
    }
    return next;
  }, [activitySummariesQuery.data]);

  const contextFilteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (startDateFilter && project.start_date !== startDateFilter) return false;
        if (endDateFilter && project.end_date !== endDateFilter) return false;
        if (selectedMemberIds.length > 0) {
          const projectUserIds = new Set((membersByProjectId.get(project.id) ?? []).map((member) => member.user_id));
          if (project.responsible_user_id) projectUserIds.add(project.responsible_user_id);
          if (!selectedMemberIds.every((userId) => projectUserIds.has(userId))) return false;
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
    [availableMembers, columns, customerById, endDateFilter, membersByProjectId, projects, search, selectedMemberIds, startDateFilter]
  );

  const filteredProjects = useMemo(
    () => contextFilteredProjects.filter((project) => (statusFilter === 'all' ? true : project.status === statusFilter)),
    [contextFilteredProjects, statusFilter]
  );

  const metrics = useMemo(() => {
    const today = todayIso();
    const staleProjects = contextFilteredProjects.filter((project) => daysSince(project.updated_at) >= 7).length;
    const overdueProjects = contextFilteredProjects.filter((project) => Boolean(project.end_date && project.end_date < today && project.status !== 'done')).length;
    const projectsWithoutOwner = contextFilteredProjects.filter((project) => !project.responsible_user_id && project.status !== 'done').length;
    const completedProjects = contextFilteredProjects.filter((project) => project.status === 'done').length;

    return {
      total: contextFilteredProjects.length,
      overdue: overdueProjects,
      stale: staleProjects,
      withoutOwner: projectsWithoutOwner,
      completed: completedProjects
    };
  }, [contextFilteredProjects]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counts.set('all', contextFilteredProjects.length);
    for (const project of contextFilteredProjects) {
      counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
    }
    return counts;
  }, [contextFilteredProjects]);

  if (projectsQuery.isLoading) {
    return <p className="rounded-lg bg-muted p-4 text-sm text-foreground/70">Laddar projekt...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric icon={FolderKanban} title="Projekt" value={String(metrics.total)} helper="Projekt i aktuellt urval" tone="blue" />
        <SummaryMetric icon={AlertTriangle} title="Försenade" value={String(metrics.overdue)} helper="Har passerat slutdatum" tone="amber" />
        <SummaryMetric icon={Clock3} title="Ej uppdaterade" value={String(metrics.stale)} helper="Ingen aktivitet på 7 dagar" tone="violet" />
        <SummaryMetric icon={UserRound} title="Utan ansvarig" value={String(metrics.withoutOwner)} helper={`${metrics.completed} klara projekt i urvalet`} tone="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-2">
        {resolvedStatusOptions.map((option) => {
          const isActive = statusFilter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onStatusFilterChange?.(option.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-2 text-sm transition ${
                isActive
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              <span>{option.key === 'all' ? 'Alla projekt' : option.title}</span>
              <span className="text-xs text-foreground/45">{statusCounts.get(option.key) ?? 0}</span>
            </button>
          );
        })}
      </div>

      {filteredProjects.length === 0 ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-foreground/70">
          {search || statusFilter !== 'all' || selectedMemberIds.length > 0 || startDateFilter || endDateFilter ? 'Inga projekt matchar filtret.' : 'Inga projekt ännu.'}
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredProjects.map((project) => {
              const members = membersByProjectId.get(project.id) ?? [];
              const responsible = availableMembers.find((member) => member.user_id === project.responsible_user_id) ?? null;
              const customerName = customerById.get(project.customer_id ?? '') ?? '-';
              const updatedAgo = daysSince(project.updated_at);
              const statusLabel = columns.find((column) => column.key === (project.workflow_status ?? project.status))?.title ?? project.workflow_status ?? project.status;

              return (
                <Link key={project.id} href={`/projects/${project.id}` as Route} className="block rounded-2xl border border-border/70 bg-card p-4 transition hover:border-primary/35 hover:bg-muted/15">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{project.title}</p>
                      <p className="mt-1 text-xs text-foreground/60">{customerName}</p>
                    </div>
                    <Badge className={statusTone(project.status)}>{statusLabel}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <MiniFact label="Start" value={formatProjectDate(project.start_date)} />
                    <MiniFact label="Slut" value={formatProjectDate(project.end_date)} />
                    <MiniFact
                      label="Ansvarig"
                      value={
                        responsible
                          ? getUserDisplayName({
                              displayName: responsible.display_name,
                              email: responsible.email,
                              handle: responsible.handle,
                              userId: responsible.user_id
                            })
                          : 'Ej satt'
                      }
                    />
                    <MiniFact label="Uppdaterad" value={updatedAgo === 0 ? 'Idag' : `${updatedAgo} d sedan`} />
                  </div>
                  {members.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {members.slice(0, 6).map((member) => {
                        const label = getUserDisplayName({
                          displayName: member.display_name,
                          email: member.email,
                          handle: member.handle,
                          userId: member.user_id
                        });
                        return (
                          <ProfileBadge
                            key={`${project.id}-${member.user_id}`}
                            label={label}
                            color={member.color}
                            avatarUrl={member.avatar_url}
                            emoji={member.emoji}
                            className="h-7 w-7 shrink-0 border border-background"
                            textClassName="text-[10px] font-semibold text-white"
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-border/70 md:block">
            <div className="grid grid-cols-[minmax(0,2.2fr)_130px_minmax(0,1.2fr)_160px_130px_130px] gap-4 bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
              <span>Projekt</span>
              <span>Skapad</span>
              <span>Kund / Team</span>
              <span>Status</span>
              <span>Ansvarig</span>
              <span>Uppdaterad</span>
            </div>
            <div className="divide-y divide-border/70 bg-card/70">
              {filteredProjects.map((project) => {
                const members = membersByProjectId.get(project.id) ?? [];
                const responsible = availableMembers.find((member) => member.user_id === project.responsible_user_id) ?? null;
                const customerName = customerById.get(project.customer_id ?? '') ?? '-';
                const updatedAgo = daysSince(project.updated_at);
                const summary = activitySummaryByProjectId.get(project.id);
                const statusLabel = columns.find((column) => column.key === (project.workflow_status ?? project.status))?.title ?? project.workflow_status ?? project.status;
                const responsibleLabel = responsible
                  ? getUserDisplayName({
                      displayName: responsible.display_name,
                      email: responsible.email,
                      handle: responsible.handle,
                      userId: responsible.user_id
                    })
                  : 'Ej satt';

                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}` as Route}
                    className="grid grid-cols-[minmax(0,2.2fr)_130px_minmax(0,1.2fr)_160px_130px_130px] gap-4 px-5 py-4 transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{project.title}</p>
                      <p className="mt-1 truncate text-xs text-foreground/60">
                        {summary?.text ?? (project.end_date ? `Slutdatum ${formatProjectDate(project.end_date)}` : 'Ingen senaste aktivitet ännu')}
                      </p>
                    </div>
                    <div className="text-sm text-foreground/75">{formatProjectDate(project.created_at)}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground/80">{customerName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {members.slice(0, 4).map((member) => {
                          const label = getUserDisplayName({
                            displayName: member.display_name,
                            email: member.email,
                            handle: member.handle,
                            userId: member.user_id
                          });
                          return (
                            <ProfileBadge
                              key={`${project.id}-${member.user_id}`}
                              label={label}
                              color={member.color}
                              avatarUrl={member.avatar_url}
                              emoji={member.emoji}
                              className="h-7 w-7 shrink-0 border border-background"
                              textClassName="text-[10px] font-semibold text-white"
                            />
                          );
                        })}
                        {members.length > 4 ? (
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-border/70 bg-muted/30 px-1.5 text-[11px] text-foreground/65">
                            +{members.length - 4}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Badge className={statusTone(project.status)}>{statusLabel}</Badge>
                      <p className="text-xs text-foreground/55">{project.end_date ? `Slut ${formatProjectDate(project.end_date)}` : 'Inget slutdatum'}</p>
                    </div>
                    <div className="min-w-0 text-sm text-foreground/75">{responsibleLabel}</div>
                    <div className="text-sm text-foreground/75">{updatedAgo === 0 ? 'Idag' : `${updatedAgo} d sedan`}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground/85">{value}</p>
    </div>
  );
}
