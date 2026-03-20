'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ProjectCard from '@/features/projects/ProjectCard';
import { useMoveProject, useProjectActivitySummaries, useProjectColumns, useProjectMembers, useProjects } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';

type BoardState = Record<string, Project[]>;

function toKeySeed(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function makeUniqueKey(existing: string[], seed: string) {
  const base = seed || 'kolumn';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function columnId(status: string) {
  return `mobile-column:${status}`;
}

function statusFromColumnId(id: string) {
  if (!id.startsWith('mobile-column:')) return null;
  return id.replace('mobile-column:', '');
}

function buildBoardState(projects: Project[], statuses: string[]): BoardState {
  const base: BoardState = Object.fromEntries(statuses.map((status) => [status, []]));

  for (const project of projects) {
    if (!base[project.status]) {
      base[project.status] = [];
    }

    base[project.status].push(project);
  }

  Object.values(base).forEach((list) => list.sort((a, b) => a.position - b.position));
  return base;
}

function findContainer(projectId: string, board: BoardState) {
  for (const [status, list] of Object.entries(board)) {
    if (list.some((project) => project.id === projectId)) {
      return status;
    }
  }

  return null;
}

function SortableProjectCard({
  project,
  statusLabel,
  members,
  availableMembers,
  activitySummary,
  onOpenMoveMenu
}: {
  project: Project;
  statusLabel: string;
  members: React.ComponentProps<typeof ProjectCard>['members'];
  availableMembers: React.ComponentProps<typeof ProjectCard>['availableMembers'];
  activitySummary?: React.ComponentProps<typeof ProjectCard>['activitySummary'];
  onOpenMoveMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : 1,
        zIndex: isDragging ? 20 : 1
      }}
      className={isDragging ? 'project-card-dragging touch-none' : 'project-card-idle touch-pan-y'}
      {...attributes}
      {...listeners}
    >
      <ProjectCard
        project={project}
        statusLabel={statusLabel}
        members={members}
        availableMembers={availableMembers}
        activitySummary={activitySummary}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenMoveMenu();
            }}
          >
            Flytta
          </Button>
        }
      />
    </div>
  );
}

function MobileColumn({
  status,
  title,
  count,
  children,
  isLocked
}: {
  status: string;
  title: string;
  count: number;
  children: React.ReactNode;
  isLocked: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status)
  });

  return (
    <section
      ref={setNodeRef}
      className={`mobile-column-panel w-[88vw] shrink-0 snap-center rounded-[22px] border p-4 shadow-sm transition ${
        isOver
          ? 'border-primary/70 bg-primary/5 ring-2 ring-primary/25'
          : isLocked
            ? 'border-primary/45 bg-gradient-to-b from-card to-card/90 ring-2 ring-primary/15'
            : 'border-border/70 bg-gradient-to-b from-card to-card/90'
      }`}
      aria-label={title}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <Badge>{count}</Badge>
      </div>
      {children}
    </section>
  );
}

export default function ProjectBoardMobile({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<string>('');
  const [selected, setSelected] = useState<Project | null>(null);
  const [board, setBoard] = useState<BoardState>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lockedStatus, setLockedStatus] = useState<string | null>(null);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [renameColumnOpen, setRenameColumnOpen] = useState(false);
  const [deleteColumnOpen, setDeleteColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [renameColumnTitle, setRenameColumnTitle] = useState('');
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeStatusRef = useRef<string>('');
  const activeIndexRef = useRef(0);
  const edgeScrollRef = useRef<{ side: 'left' | 'right' | null; lastStepAt: number }>({
    side: null,
    lastStepAt: 0
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { containerRef: columnTabsRef, registerItem: registerColumnTab } = useAutoScrollActiveTab(activeStatus);

  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const moveMutation = useMoveProject(companyId);
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
        actorLabel: actor?.email ?? actor?.handle ?? null
      });
    }
    return next;
  }, [activitySummariesQuery.data, availableMembers]);

  const columns = columnsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const statuses = useMemo(() => columns.map((column) => column.key), [columns]);
  const activeColumn = useMemo(() => columns.find((column) => column.key === activeStatus) ?? null, [activeStatus, columns]);

  useEffect(() => {
    setRenameColumnTitle(activeColumn?.title ?? '');
  }, [activeColumn?.title]);

  const addColumnMutation = useMutation({
    mutationFn: async () => {
      const title = newColumnTitle.trim();
      if (!title) throw new Error('Kolumnnamn krävs');

      const existingKeys = columns.map((c) => c.key);
      const key = makeUniqueKey(existingKeys, toKeySeed(title));
      const position = (columns.at(-1)?.position ?? 0) + 1;

      const { error } = await supabase.from('project_columns').insert({
        company_id: companyId,
        key,
        title,
        position
      });
      if (error) throw error;
      return key;
    },
    onSuccess: async (key) => {
      setNewColumnTitle('');
      setCreateColumnOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn tillagd');
      setActiveColumn(key);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till kolumn')
  });

  const renameColumnMutation = useMutation({
    mutationFn: async () => {
      const clean = renameColumnTitle.trim();
      if (!clean) throw new Error('Kolumnnamn krävs');
      if (!activeColumn) throw new Error('Kolumn hittades inte');

      const { error } = await supabase
        .from('project_columns')
        .update({ title: clean })
        .eq('company_id', companyId)
        .eq('id', activeColumn.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setRenameColumnOpen(false);
      setColumnSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kolumn')
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async () => {
      if (!activeColumn) throw new Error('Kolumn hittades inte');
      if (columns.length <= 1) throw new Error('Minst en kolumn måste finnas kvar');

      const fallback = columns.find((c) => c.key !== activeColumn.key);
      if (!fallback) throw new Error('Ingen reservkolumn hittades');

      const { error: moveError } = await supabase
        .from('projects')
        .update({ status: fallback.key })
        .eq('company_id', companyId)
        .eq('status', activeColumn.key);
      if (moveError) throw moveError;

      const { error: deleteError } = await supabase
        .from('project_columns')
        .delete()
        .eq('company_id', companyId)
        .eq('id', activeColumn.id);
      if (deleteError) throw deleteError;

      const remaining = columns
        .filter((c) => c.id !== activeColumn.id)
        .sort((a, b) => a.position - b.position)
        .map((c, i) => ({ id: c.id, position: i + 1 }));

      for (const item of remaining) {
        const { error: posError } = await supabase
          .from('project_columns')
          .update({ position: item.position })
          .eq('company_id', companyId)
          .eq('id', item.id);
        if (posError) throw posError;
      }

      return fallback.key;
    },
    onSuccess: async (fallbackKey) => {
      setDeleteColumnOpen(false);
      setColumnSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Kolumn borttagen');
      setActiveColumn(fallbackKey);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort kolumn')
  });

  useEffect(() => {
    if (!activeStatus && columns.length > 0) {
      setActiveStatus(columns[0].key);
      return;
    }

    if (activeStatus && columns.length > 0 && !columns.some((column) => column.key === activeStatus)) {
      setActiveStatus(columns[0].key);
    }
  }, [activeStatus, columns]);

  const titleByStatus = useMemo(() => new Map(columns.map((c) => [c.key, c.title])), [columns]);
  const initialBoard = useMemo(() => buildBoardState(projects, statuses), [projects, statuses]);

  useEffect(() => {
    setBoard(initialBoard);
  }, [initialBoard]);

  const activeIndex = useMemo(
    () => Math.max(0, columns.findIndex((column) => column.key === activeStatus)),
    [activeStatus, columns]
  );
  const activeProject = useMemo(
    () => (activeId ? projects.find((project) => project.id === activeId) ?? null : null),
    [activeId, projects]
  );

  useEffect(() => {
    activeStatusRef.current = activeStatus;
    activeIndexRef.current = Math.max(0, columns.findIndex((column) => column.key === activeStatus));
  }, [activeStatus, columns]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || activeIndex < 0) return;

    const nextChild = track.children.item(activeIndex) as HTMLElement | null;
    nextChild?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    if (!lockedStatus) return;

    const timeout = window.setTimeout(() => {
      setLockedStatus((current) => (current === lockedStatus ? null : current));
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [lockedStatus]);

  function scrollToColumn(columnIndex: number, behavior: ScrollBehavior = 'smooth') {
    const track = trackRef.current;
    if (!track) return;

    const nextChild = track.children.item(columnIndex) as HTMLElement | null;
    nextChild?.scrollIntoView({ behavior, inline: 'start', block: 'nearest' });
  }

  function setActiveColumn(nextStatus: string, options?: { scroll?: boolean; behavior?: ScrollBehavior }) {
    if (!nextStatus) return;

    const nextIndex = columns.findIndex((column) => column.key === nextStatus);
    if (nextIndex < 0) return;

    activeStatusRef.current = nextStatus;
    activeIndexRef.current = nextIndex;
    setActiveStatus(nextStatus);

    if (options?.scroll !== false) {
      scrollToColumn(nextIndex, options?.behavior ?? 'smooth');
    }
  }

  function updateActiveFromScroll() {
    const track = trackRef.current;
    if (!track || columns.length === 0) return;

    const width = track.clientWidth;
    if (!width) return;

    const nextIndex = Math.round(track.scrollLeft / width);
    const nextColumn = columns[Math.max(0, Math.min(columns.length - 1, nextIndex))];

    if (nextColumn && nextColumn.key !== activeStatusRef.current) {
      activeStatusRef.current = nextColumn.key;
      activeIndexRef.current = Math.max(0, Math.min(columns.length - 1, nextIndex));
      setActiveStatus(nextColumn.key);
    }
  }

  function commitMove(project: Project, status: string, toPosition: number) {
    moveMutation.mutate({
      project,
      toStatus: status,
      toPosition
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    edgeScrollRef.current = { side: null, lastStepAt: 0 };
  }

  function handleDragMove(event: DragMoveEvent) {
    const track = trackRef.current;
    const translated = event.active.rect.current.translated;
    if (!track || !translated) return;

    const rect = track.getBoundingClientRect();
    const edgeThreshold = 56;
    const now = Date.now();
    const cooldownMs = 1450;
    const currentIndex = activeIndexRef.current;

    if (translated.right > rect.right - edgeThreshold) {
      const canAdvance =
        edgeScrollRef.current.side !== 'right' || now - edgeScrollRef.current.lastStepAt >= cooldownMs;

      if (canAdvance) {
        edgeScrollRef.current = { side: 'right', lastStepAt: now };
        const nextIndex = Math.min(columns.length - 1, currentIndex + 1);
        const nextColumn = columns[nextIndex];
        if (nextColumn) {
          setActiveColumn(nextColumn.key);
          setLockedStatus(nextColumn.key);
        }
      }
      return;
    }

    if (translated.left < rect.left + edgeThreshold) {
      const canAdvance =
        edgeScrollRef.current.side !== 'left' || now - edgeScrollRef.current.lastStepAt >= cooldownMs;

      if (canAdvance) {
        edgeScrollRef.current = { side: 'left', lastStepAt: now };
        const nextIndex = Math.max(0, currentIndex - 1);
        const nextColumn = columns[nextIndex];
        if (nextColumn) {
          setActiveColumn(nextColumn.key);
          setLockedStatus(nextColumn.key);
        }
      }
      return;
    }

    edgeScrollRef.current = { side: null, lastStepAt: edgeScrollRef.current.lastStepAt };
  }

  function handleDragOver(event: DragOverEvent) {
    const activeProjectId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    setBoard((current) => {
      const sourceStatus = findContainer(activeProjectId, current);
      const targetStatus = statusFromColumnId(overId) ?? findContainer(overId, current);

      if (!sourceStatus || !targetStatus) return current;

      if (sourceStatus === targetStatus) {
        return current;
      }

      const sourceItems = current[sourceStatus] ?? [];
      const targetItems = current[targetStatus] ?? [];
      const sourceIndex = sourceItems.findIndex((project) => project.id === activeProjectId);
      if (sourceIndex < 0) return current;

      const moving = { ...sourceItems[sourceIndex], status: targetStatus };
      const nextSource = [...sourceItems.slice(0, sourceIndex), ...sourceItems.slice(sourceIndex + 1)];
      const nextTarget = [...targetItems, moving];

      return {
        ...current,
        [sourceStatus]: nextSource,
        [targetStatus]: nextTarget
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeProjectId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    setActiveId(null);
    setLockedStatus(null);
    edgeScrollRef.current = { side: null, lastStepAt: 0 };

    if (!overId) {
      setBoard(initialBoard);
      return;
    }

    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) {
      setBoard(initialBoard);
      return;
    }

    const targetStatus = statusFromColumnId(overId) ?? findContainer(overId, board);
    if (!targetStatus) {
      setBoard(initialBoard);
      return;
    }

    const targetList = board[targetStatus] ?? [];
    const targetIndex = targetList.findIndex((item) => item.id === activeProjectId);
    const before = targetIndex > 0 ? targetList[targetIndex - 1] : null;
    const after = targetIndex >= 0 && targetIndex < targetList.length - 1 ? targetList[targetIndex + 1] : null;

    let toPosition = project.position;
    if (before && after) {
      toPosition = Math.floor((before.position + after.position) / 2);
      if (toPosition === before.position || toPosition === after.position) {
        toPosition = after.position;
      }
    } else if (before) {
      toPosition = before.position + 1;
    } else if (after) {
      toPosition = Math.max(1, after.position - 1);
    } else {
      toPosition = 1;
    }

    if (project.status !== targetStatus || project.position !== toPosition) {
      commitMove(project, targetStatus, toPosition);
    } else {
      setBoard(initialBoard);
    }
  }

  if (columns.length === 0) {
    return <p className="rounded-xl bg-muted p-4 text-sm">Inga kolumner konfigurerade ännu.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/55">Projektflöde</p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-lg font-semibold">{titleByStatus.get(activeStatus) ?? activeStatus}</h2>
            <Badge>{board[activeStatus]?.length ?? 0}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setCreateColumnOpen(true)}
            aria-label="Lägg till kolumn"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setColumnSheetOpen(true)}
            aria-label="Kolumninställningar"
          >
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            disabled={activeIndex <= 0}
            onClick={() => setActiveColumn(columns[Math.max(0, activeIndex - 1)]?.key ?? activeStatus)}
            aria-label="Föregående kolumn"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            disabled={activeIndex >= columns.length - 1}
            onClick={() => setActiveColumn(columns[Math.min(columns.length - 1, activeIndex + 1)]?.key ?? activeStatus)}
            aria-label="Nästa kolumn"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={columnTabsRef}
        className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {columns.map((column, index) => (
          <button
            key={column.key}
            ref={registerColumnTab(column.key)}
            type="button"
            onClick={() => setActiveColumn(column.key)}
            className={`shrink-0 border-b-2 px-1 pb-2 pt-1 text-sm font-medium transition ${
              activeStatus === column.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-foreground/55'
            }`}
          >
            {index + 1}. {column.title}
          </button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={trackRef}
          onScroll={updateActiveFromScroll}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[6%] pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {columns.map((column, columnIndex) => {
            const list = board[column.key] ?? [];

            return (
              <MobileColumn
                key={column.key}
                status={column.key}
                title={column.title}
                count={list.length}
                isLocked={lockedStatus === column.key}
              >
                <p
                  className={`mb-4 text-xs font-semibold uppercase tracking-[0.24em] transition ${
                    lockedStatus === column.key ? 'text-primary' : 'text-foreground/45'
                  }`}
                >
                  Kolumn {columnIndex + 1} av {columns.length}
                </p>

                <SortableContext items={list.map((project) => project.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {list.map((project) => (
                      <SortableProjectCard
                        key={project.id}
                        project={project}
                        statusLabel={titleByStatus.get(project.status) ?? project.status}
                        members={membersByProjectId.get(project.id) ?? []}
                        availableMembers={availableMembers}
                        activitySummary={activitySummaryByProjectId.get(project.id)}
                        onOpenMoveMenu={() => setSelected(project)}
                      />
                    ))}

                    {list.length === 0 && (
                      <p className="rounded-2xl bg-muted/60 p-4 text-sm text-foreground/70">Inga projekt i kolumnen.</p>
                    )}
                  </div>
                </SortableContext>
              </MobileColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeProject ? (
            <div className="w-[82vw] max-w-[340px] rotate-[1.2deg] touch-none">
              <ProjectCard
                project={activeProject}
                statusLabel={titleByStatus.get(activeProject.status) ?? activeProject.status}
                members={membersByProjectId.get(activeProject.id) ?? []}
                availableMembers={availableMembers}
                activitySummary={activitySummaryByProjectId.get(activeProject.id)}
              />
            </div>
          ) : null}
        </DragOverlay>
        {activeId ? <div className="sr-only">Drar {activeId}</div> : null}
      </DndContext>

      <ActionSheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Flytta projekt"
        description={selected?.title}
      >
        <div className="grid gap-2">
          {columns.map((column) => (
            <Button
              key={column.key}
              variant={selected?.status === column.key ? 'secondary' : 'outline'}
              className="justify-start"
              disabled={!selected || selected.status === column.key || moveMutation.isPending}
              onClick={() => {
                if (!selected) return;
                commitMove(selected, column.key, 1);
                setSelected(null);
              }}
            >
              {column.title}
            </Button>
          ))}
        </div>
      </ActionSheet>

      <ActionSheet
        open={columnSheetOpen}
        onClose={() => setColumnSheetOpen(false)}
        title={activeColumn?.title ?? 'Kolumn'}
        description="Hantera den aktiva kolumnen."
      >
        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setColumnSheetOpen(false);
              setRenameColumnOpen(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Byt namn
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 justify-start rounded-2xl"
            onClick={() => {
              setColumnSheetOpen(false);
              setDeleteColumnOpen(true);
            }}
            disabled={columns.length <= 1}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Ta bort kolumn
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet
        open={createColumnOpen}
        onClose={() => setCreateColumnOpen(false)}
        title="Ny kolumn"
        description="Lägg till en ny kolumn i projektflödet."
      >
        <div className="space-y-3">
          <Input
            placeholder="Kolumnnamn"
            value={newColumnTitle}
            onChange={(event) => setNewColumnTitle(event.target.value)}
          />
          <Button type="button" className="w-full" onClick={() => addColumnMutation.mutate()} disabled={addColumnMutation.isPending}>
            {addColumnMutation.isPending ? 'Lägger till...' : 'Lägg till kolumn'}
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet
        open={renameColumnOpen}
        onClose={() => setRenameColumnOpen(false)}
        title="Byt namn på kolumn"
        description={activeColumn?.title ?? undefined}
      >
        <div className="space-y-3">
          <Input
            placeholder="Kolumnnamn"
            value={renameColumnTitle}
            onChange={(event) => setRenameColumnTitle(event.target.value)}
          />
          <Button type="button" className="w-full" onClick={() => renameColumnMutation.mutate()} disabled={renameColumnMutation.isPending}>
            {renameColumnMutation.isPending ? 'Sparar...' : 'Spara namn'}
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet
        open={deleteColumnOpen}
        onClose={() => setDeleteColumnOpen(false)}
        title="Ta bort kolumn"
        description="Projekt i kolumnen flyttas till en annan kolumn."
      >
        <div className="space-y-3">
          <p className="text-sm text-foreground/70">
            Vill du ta bort <span className="font-medium text-foreground">{activeColumn?.title}</span>?
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => deleteColumnMutation.mutate()}
            disabled={deleteColumnMutation.isPending || columns.length <= 1}
          >
            {deleteColumnMutation.isPending ? 'Tar bort...' : 'Ta bort kolumn'}
          </Button>
        </div>
      </ActionSheet>
    </div>
  );
}
