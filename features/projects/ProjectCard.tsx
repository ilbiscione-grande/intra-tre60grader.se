'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import type { ProjectMemberVisual } from '@/features/projects/projectQueries';

function fallbackLabel(status: string) {
  const map: Record<string, string> = {
    todo: 'Att göra',
    in_progress: 'Pågående',
    review: 'Granskning',
    done: 'Klar'
  };
  return map[status] ?? status;
}

export default function ProjectCard({
  project,
  actions,
  statusLabel,
  members = [],
  availableMembers = []
}: {
  project: Project;
  actions?: React.ReactNode;
  statusLabel?: string;
  members?: ProjectMemberVisual[];
  availableMembers?: ProjectMemberVisual[];
}) {
  const { role } = useAppContext();
  const queryClient = useQueryClient();
  const visibleMembers = members.slice(0, 3);
  const hiddenCount = Math.max(0, members.length - visibleMembers.length);
  const canManageMembers = role !== 'auditor';

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

  return (
    <Card className="group relative transition-shadow hover:shadow-sm">
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Öppna projekt ${project.title}`}
        className="absolute inset-0 z-10 rounded-[inherit]"
      />
      <CardContent className="relative flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 pb-8">
          <h3 className="font-semibold group-hover:underline">{project.title}</h3>
          <Badge className="mt-2 w-fit uppercase tracking-wide">{statusLabel ?? fallbackLabel(project.status)}</Badge>
        </div>
        {actions ? <div className="relative z-20">{actions}</div> : null}
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
                    const label = member.handle || member.email || member.user_id;

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
                        label={member.email ?? member.user_id}
                        color={member.color}
                        avatarUrl={member.avatar_url}
                        emoji={member.emoji}
                        className="h-6 w-6 shrink-0"
                        textClassName="text-[10px] font-semibold text-white"
                      />
                      <span className="truncate text-xs text-foreground">{member.email ?? member.handle ?? member.user_id}</span>
                    </div>
                    {canManageMembers ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/55 transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        aria-label={`Ta bort ${member.email ?? member.user_id}`}
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
                            label={member.email ?? member.user_id}
                            color={member.color}
                            avatarUrl={member.avatar_url}
                            emoji={member.emoji}
                            className="h-6 w-6 shrink-0"
                            textClassName="text-[10px] font-semibold text-white"
                          />
                          <span className="truncate text-xs text-foreground">{member.email ?? member.handle ?? member.user_id}</span>
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
