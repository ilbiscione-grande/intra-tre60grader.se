'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, MoreHorizontal, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Project } from '@/lib/types';
import type { ProjectActivitySummary, ProjectMemberVisual } from '@/features/projects/projectQueries';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

function fallbackLabel(status: string) {
  const map: Record<string, string> = {
    todo: 'Att göra',
    in_progress: 'Pågående',
    review: 'Granskning',
    done: 'Klar'
  };
  return map[status] ?? status;
}

function normalizeMilestones(value: Project['milestones']) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      return {
        title: typeof record.title === 'string' ? record.title.trim() : '',
        date: typeof record.date === 'string' ? record.date : '',
        completed: Boolean(record.completed)
      };
    })
    .filter((item): item is { title: string; date: string; completed: boolean } => Boolean(item));
}

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

export default function ProjectCard({
  project,
  actions,
  statusLabel,
  statusOptions = [],
  columnOptions = [],
  onSetWorkflowStatus,
  onMoveToColumn,
  isUpdatingWorkflowStatus = false,
  members = [],
  availableMembers = [],
  activitySummary
}: {
  project: Project;
  actions?: React.ReactNode;
  statusLabel?: string;
  statusOptions?: Array<{ key: string; title: string }>;
  columnOptions?: Array<{ key: string; title: string }>;
  onSetWorkflowStatus?: (project: Project, workflowStatus: string) => void;
  onMoveToColumn?: (project: Project, status: string) => void;
  isUpdatingWorkflowStatus?: boolean;
  members?: ProjectMemberVisual[];
  availableMembers?: ProjectMemberVisual[];
  activitySummary?: ProjectActivitySummary & { actorLabel?: string | null };
}) {
  const { role } = useAppContext();
  const breakpointMode = useBreakpointMode();
  const queryClient = useQueryClient();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const visibleMembers = members.slice(0, 3);
  const hiddenCount = Math.max(0, members.length - visibleMembers.length);
  const canManageMembers = role !== 'auditor';
  const milestones = normalizeMilestones(project.milestones);
  const completedMilestones = milestones.filter((milestone) => milestone.completed).length;
  const totalMilestones = milestones.length;
  const nextMilestone =
    milestones
      .filter((milestone) => !milestone.completed)
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      })[0] ?? null;
  const today = todayIso();
  const isMilestoneOverdue = Boolean(nextMilestone?.date && nextMilestone.date < today);
  const isEndDateOverdue = Boolean(project.end_date && project.end_date < today);
  const isEndDateSoon = Boolean(
    project.end_date &&
      project.end_date >= today &&
      Math.ceil((new Date(project.end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)) <= 7
  );
  const progressPercent =
    totalMilestones > 0 ? Math.max(6, Math.round((completedMilestones / totalMilestones) * 100)) : 0;
  const planningLabel = isMilestoneOverdue || isEndDateOverdue
    ? 'Över tid'
    : nextMilestone?.title
      ? `${nextMilestone.title}${nextMilestone.date ? ` • ${nextMilestone.date}` : ''}`
      : project.end_date
        ? `Slutdatum ${project.end_date}`
        : 'Ingen tidsplan satt';
  const planningTone = isMilestoneOverdue || isEndDateOverdue
    ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
    : isEndDateSoon || nextMilestone
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
      : 'bg-muted text-foreground/70';

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const nextUserIds = members.filter((member) => member.user_id !== userId).map((member) => member.user_id);
      const res = await fetch('/api/project-members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: project.company_id,
          projectId: project.id,
          userIds: nextUserIds
        })
      });

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Kunde inte uppdatera projektmedlemmar');
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-members', project.company_id] });
      toast.success('Medlem borttagen från projektet');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort medlem');
    }
  });

  const addableMembers = availableMembers.filter(
    (candidate) => !members.some((member) => member.user_id === candidate.user_id)
  );

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const nextUserIds = Array.from(new Set([...members.map((member) => member.user_id), userId]));
      const res = await fetch('/api/project-members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: project.company_id,
          projectId: project.id,
          userIds: nextUserIds
        })
      });

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Kunde inte uppdatera projektmedlemmar');
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-members', project.company_id] });
      toast.success('Medlem tillagd i projektet');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till medlem');
    }
  });

  const projectMenuSections = onSetWorkflowStatus ? (
    <>
      <div className="space-y-2">
        <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Projekt</p>
        <Link
          href={`/projects/${project.id}`}
          className="flex rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:bg-muted"
          onClick={(event) => event.stopPropagation()}
        >
          Öppna projekt
        </Link>
        <Link
          href={`/projects/${project.id}?tab=members`}
          className="flex rounded-lg border border-border/60 px-3 py-2 text-sm transition hover:bg-muted"
          onClick={(event) => event.stopPropagation()}
        >
          Medlemmar
        </Link>
      </div>

      <div className="space-y-2 pt-3">
        <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Projektstatus</p>
        <div className="grid gap-2">
          {statusOptions.map((option) => {
            const active = (project.workflow_status ?? project.status) === option.key;
            return (
              <button
                key={`${project.id}-${option.key}`}
                type="button"
                disabled={active || isUpdatingWorkflowStatus}
                className="flex rounded-lg border border-border/60 px-3 py-2 text-left text-sm transition hover:bg-muted disabled:cursor-default disabled:opacity-55"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSetWorkflowStatus(project, option.key);
                  setProjectMenuOpen(false);
                }}
              >
                {active ? `• ${option.title}` : option.title}
              </button>
            );
          })}
        </div>
      </div>

      {onMoveToColumn ? (
        <div className="space-y-2 pt-3">
          <p className="px-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Flytta till kolumn</p>
          <div className="grid gap-2">
            {columnOptions.map((option) => {
              const active = project.status === option.key;
              return (
                <button
                  key={`${project.id}-column-${option.key}`}
                  type="button"
                  disabled={active}
                  className="flex rounded-lg border border-border/60 px-3 py-2 text-left text-sm transition hover:bg-muted disabled:cursor-default disabled:opacity-55"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveToColumn(project, option.key);
                    setProjectMenuOpen(false);
                  }}
                >
                  {active ? `• ${option.title}` : option.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <Card className="group relative transition-shadow hover:shadow-sm">
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Öppna projekt ${project.title}`}
        className="absolute inset-0 z-10 rounded-[inherit]"
      />
      <CardContent className="relative p-4">
        <div className="absolute right-3 top-3 z-20 flex items-start gap-1">
          {onSetWorkflowStatus ? (
            breakpointMode === 'mobile' ? (
              <>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 text-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                  aria-label="Projektmeny"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setProjectMenuOpen(true);
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <ActionSheet
                  open={projectMenuOpen}
                  onClose={() => setProjectMenuOpen(false)}
                  title="Projektmeny"
                  description={project.title}
                >
                  <div className="space-y-3">{projectMenuSections}</div>
                </ActionSheet>
              </>
            ) : (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 text-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                    aria-label="Projektmeny"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 pb-2 pt-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Projekt</p>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link href={`/projects/${project.id}`} onClick={(event) => event.stopPropagation()}>
                      Öppna projekt
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/projects/${project.id}?tab=members`} onClick={(event) => event.stopPropagation()}>
                      Medlemmar
                    </Link>
                  </DropdownMenuItem>

                  <div className="px-2 pb-2 pt-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Projektstatus</p>
                  </div>
                  {statusOptions.map((option) => {
                    const active = (project.workflow_status ?? project.status) === option.key;
                    return (
                      <DropdownMenuItem
                        key={`${project.id}-${option.key}`}
                        disabled={active || isUpdatingWorkflowStatus}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onSetWorkflowStatus(project, option.key);
                        }}
                      >
                        {active ? `• ${option.title}` : option.title}
                      </DropdownMenuItem>
                    );
                  })}

                  {onMoveToColumn ? (
                    <>
                      <div className="px-2 pb-2 pt-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Flytta till kolumn</p>
                      </div>
                      {columnOptions.map((option) => {
                        const active = project.status === option.key;
                        return (
                          <DropdownMenuItem
                            key={`${project.id}-column-${option.key}`}
                            disabled={active}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onMoveToColumn(project, option.key);
                            }}
                          >
                            {active ? `• ${option.title}` : option.title}
                          </DropdownMenuItem>
                        );
                      })}
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          ) : null}
          {actions ? <div>{actions}</div> : null}
        </div>

        <div className="min-w-0 pb-12 pr-24">
          <h3 className="font-semibold group-hover:underline">{project.title}</h3>
          <Badge className="mt-2 w-fit uppercase tracking-wide">{statusLabel ?? fallbackLabel(project.workflow_status ?? project.status)}</Badge>
          <div className="mt-3 max-w-full space-y-1">
            <div className="flex items-center gap-2">
              {isMilestoneOverdue || isEndDateOverdue ? (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                  title="Projektet har ett försenat delmål eller passerat slutdatum"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
              ) : null}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${planningTone}`}>{planningLabel}</span>
              {totalMilestones > 0 ? (
                <span className="text-[10px] text-foreground/55">{completedMilestones}/{totalMilestones} delmål</span>
              ) : null}
            </div>
            {totalMilestones > 0 ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            ) : null}
          </div>
          {activitySummary ? (
            <div className="mt-3 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-foreground/65">
              <p className="truncate font-medium text-foreground/75">
                Senast uppdaterat av {activitySummary.actorLabel ?? 'intern användare'}
              </p>
              <p className="truncate">{activitySummary.text}</p>
            </div>
          ) : null}
        </div>
        {members.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="absolute bottom-3 right-3 z-20 rounded-full"
                aria-label="Visa projektmedlemmar"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <div className="flex items-center -space-x-2 rounded-full bg-background/85 pl-1 pr-1.5 shadow-sm ring-1 ring-border/70 backdrop-blur-sm">
                  {visibleMembers.map((member) => {
                    const label = getUserDisplayName({
                      displayName: member.display_name,
                      email: member.email,
                      handle: member.handle,
                      userId: member.user_id
                    });

                    return (
                      <ProfileBadge
                        key={member.id}
                        label={label}
                        color={member.color}
                        avatarUrl={member.avatar_url}
                        emoji={member.emoji}
                        className="h-6 w-6 border border-background"
                        textClassName="text-[10px] font-semibold text-white"
                      />
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                      +{hiddenCount}
                    </span>
                  ) : null}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 pb-2 pt-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Projektmedlemmar</p>
              </div>
              <div className="space-y-1 px-1 pb-1">
                {members.map((member) => (
                  <div
                    key={`menu-${member.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/25 px-2 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ProfileBadge
                        label={member.display_name ?? member.email ?? member.user_id}
                        color={member.color}
                        avatarUrl={member.avatar_url}
                        emoji={member.emoji}
                        className="h-6 w-6 shrink-0"
                        textClassName="text-[10px] font-semibold text-white"
                      />
                      <span className="truncate text-xs text-foreground">{member.display_name ?? member.email ?? member.handle ?? member.user_id}</span>
                    </div>
                    {canManageMembers ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/55 transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label={`Ta bort ${member.display_name ?? member.email ?? member.user_id}`}
                        disabled={removeMemberMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeMemberMutation.mutate(member.user_id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {canManageMembers && addableMembers.length > 0 ? (
                <>
                  <div className="px-2 pb-2 pt-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Lägg till medlem</p>
                  </div>
                  <div className="space-y-1 px-1 pb-1">
                    {addableMembers.slice(0, 6).map((member) => (
                      <button
                        key={`add-${member.id}`}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-border/50 hover:bg-muted disabled:opacity-50"
                        disabled={addMemberMutation.isPending}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          addMemberMutation.mutate(member.user_id);
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ProfileBadge
                            label={member.display_name ?? member.email ?? member.user_id}
                            color={member.color}
                            avatarUrl={member.avatar_url}
                            emoji={member.emoji}
                            className="h-6 w-6 shrink-0"
                            textClassName="text-[10px] font-semibold text-white"
                          />
                          <span className="truncate text-xs text-foreground">{member.display_name ?? member.email ?? member.handle ?? member.user_id}</span>
                        </div>
                        <span className="text-xs text-foreground/55">Lägg till</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/projects/${project.id}?tab=members`} onClick={(event) => event.stopPropagation()}>
                  Medlemmar
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardContent>
    </Card>
  );
}
