'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PROJECT_COLUMN_COLOR_OPTIONS, getProjectColumnBackground } from '@/features/projects/columnColors';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import ProjectCard from '@/features/projects/ProjectCard';
import { useMoveProject, useProjectActivitySummaries, useProjectColumns, useProjectMembers, useProjects, useUpdateProjectWorkflowStatus } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';

type BoardState = Record<string, Project[]>;

function columnId(status: string) {
  return `column:${status}`;
}

function listId(status: string) {
  return `list:${status}`;
}

function statusFromColumnId(id: string): string | null {
  if (!id.startsWith('column:')) return null;
  return id.replace('column:', '');
}

function statusFromListId(id: string): string | null {
  if (!id.startsWith('list:')) return null;
  return id.replace('list:', '');
}

function isListDragId(id: string) {
  return id.startsWith('list:');
}

function buildBoardState(projects: Project[], statuses: string[]): BoardState {
  const base: BoardState = Object.fromEntries(statuses.map((s) => [s, []]));

  for (const project of projects) {
    if (!base[project.status]) base[project.status] = [];
    base[project.status].push(project);
  }

  Object.keys(base).forEach((status) => {
    base[status].sort((a, b) => a.position - b.position);
  });

  return base;
}

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

function SortableCardItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: 1,
    zIndex: isDragging ? 30 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'project-card-dragging' : 'project-card-idle'} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function ColumnDropZone({
  status,
  title,
  count,
  children,
  bgColor,
  onRename,
  onDelete,
  onSetColor,
  canDelete,
  dragHandle
}: {
  status: string;
  title: string;
  count: number;
  children: React.ReactNode;
  bgColor?: string | null;
  onRename: (status: string, title: string) => void;
  onDelete: (status: string) => void;
  onSetColor: (status: string, color: string | null) => void;
  canDelete: boolean;
  dragHandle: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const backgroundColor = getProjectColumnBackground(bgColor);

  return (
    <Card ref={setNodeRef} className={`min-w-[260px] ${isOver ? 'ring-2 ring-primary/50' : ''}`} style={{ backgroundColor }}>
      <CardContent className="p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold uppercase tracking-wide">{title}</h2>
          </div>
          <div className="flex items-center gap-1">
            <Badge>{count}</Badge>
            {dragHandle}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Kolumnmeny">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    const next = window.prompt('Nytt kolumnnamn', title);
                    if (!next) return;
                    onRename(status, next);
                  }}
                >
                  Byt namn
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border/70" />
                {PROJECT_COLUMN_COLOR_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.label} onClick={() => onSetColor(status, option.value || null)}>
                    Bakgrund: {option.label}
                  </DropdownMenuItem>
                ))}
                <div className="my-1 h-px bg-border/70" />
                <DropdownMenuItem
                  disabled={!canDelete}
                  onClick={() => {
                    if (!canDelete) return;
                    const ok = window.confirm(`Ta bort kolumnen "${title}"? Projekt flyttas till en annan kolumn.`);
                    if (!ok) return;
                    onDelete(status);
                  }}
                >
                  Ta bort
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SortableColumn({
  status,
  title,
  count,
  children,
  bgColor,
  onRename,
  onDelete,
  onSetColor,
  canDelete,
  reorderMode,
  onEnableReorder
}: {
  status: string;
  title: string;
  count: number;
  children: React.ReactNode;
  bgColor?: string | null;
  onRename: (status: string, title: string) => void;
  onDelete: (status: string) => void;
  onSetColor: (status: string, color: string | null) => void;
  canDelete: boolean;
  reorderMode: boolean;
  onEnableReorder: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listId(status),
    disabled: !reorderMode
  });

  const holdTimerRef = useRef<number | null>(null);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHoldToEnable() {
    if (reorderMode) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      onEnableReorder();
      holdTimerRef.current = null;
    }, 450);
  }

  useEffect(() => {
    return () => clearHoldTimer();
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 20 : 1,
    animation: reorderMode && !isDragging ? 'column-jiggle 220ms ease-in-out infinite' : undefined,
};

  return (
    <div ref={setNodeRef} style={style}>
      <ColumnDropZone
        status={status}
        title={title}
        count={count}
        bgColor={bgColor}
        onRename={onRename}
        onDelete={onDelete}
        onSetColor={onSetColor}
        canDelete={canDelete}
        dragHandle={
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${reorderMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            aria-label="Håll in för att flytta kolumn"
            title={reorderMode ? 'Dra för att flytta kolumn' : 'Håll in för att aktivera kolumnflytt'}
            onPointerDown={startHoldToEnable}
            onPointerUp={clearHoldTimer}
            onPointerLeave={clearHoldTimer}
            onPointerCancel={clearHoldTimer}
            {...(reorderMode ? attributes : {})}
            {...(reorderMode ? listeners : {})}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
        }
      >
        {children}
      </ColumnDropZone>
    </div>
  );
}

function AddColumnCard({ onAdd, busy }: { onAdd: () => void; busy: boolean }) {
  return (
    <Card className="min-w-[88px] border-dashed bg-muted/20">
      <CardContent className="flex h-full min-h-[120px] items-center justify-center p-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full border border-dashed"
          onClick={onAdd}
          disabled={busy}
          aria-label="Lägg till kolumn"
          title="Ny kolumn"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProjectBoardDesktop({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const moveMutation = useMoveProject(companyId);
  const updateWorkflowStatusMutation = useUpdateProjectWorkflowStatus(companyId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = columnsQuery.data ?? [];
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
  const statuses = useMemo(() => columns.map((c) => c.key), [columns]);
  const titleByStatus = useMemo(() => new Map(columns.map((c) => [c.key, c.title])), [columns]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnReorderMode, setColumnReorderMode] = useState(false);

  useEffect(() => {
    setColumnOrder(statuses);
  }, [statuses]);

  useEffect(() => {
    if (!columnReorderMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setColumnReorderMode(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [columnReorderMode]);

  const orderedStatuses = useMemo(() => {
    const known = columnOrder.filter((status) => statuses.includes(status));
    const missing = statuses.filter((status) => !known.includes(status));
    return [...known, ...missing];
  }, [columnOrder, statuses]);

  const projects = projectsQuery.data ?? [];
  const initialBoard = useMemo(() => buildBoardState(projects, statuses), [projects, statuses]);

  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setBoard(initialBoard);
  }, [initialBoard]);

  const addColumnMutation = useMutation({
    mutationFn: async () => {
      const title = window.prompt('Namn på ny kolumn');
      if (!title || !title.trim()) return;

      const existingKeys = columns.map((c) => c.key);
      const key = makeUniqueKey(existingKeys, toKeySeed(title));
      const position = (columns.at(-1)?.position ?? 0) + 1;

      const { error } = await supabase.from('project_columns').insert({
        company_id: companyId,
        key,
        title: title.trim(),
        position
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn tillagd');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till kolumn')
  });

  const reorderColumnsMutation = useMutation({
    mutationFn: async (nextOrder: string[]) => {
      for (let i = 0; i < nextOrder.length; i += 1) {
        const status = nextOrder[i];
        const column = columns.find((c) => c.key === status);
        if (!column) continue;

        const { error } = await supabase
          .from('project_columns')
          .update({ position: i + 1 })
          .eq('company_id', companyId)
          .eq('id', column.id);

        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumnordning uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte flytta kolumn')
  });

  const renameColumnMutation = useMutation({
    mutationFn: async ({ status, title }: { status: string; title: string }) => {
      const clean = title.trim();
      if (!clean) throw new Error('Kolumnnamn krävs');

      const column = columns.find((c) => c.key === status);
      if (!column) throw new Error('Kolumn hittades inte');

      const { error } = await supabase
        .from('project_columns')
        .update({ title: clean })
        .eq('company_id', companyId)
        .eq('id', column.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kolumn')
  });

  const setColumnColorMutation = useMutation({
    mutationFn: async ({ status, color }: { status: string; color: string | null }) => {
      const column = columns.find((c) => c.key === status);
      if (!column) throw new Error('Kolumn hittades inte');

      const { error } = await supabase
        .from('project_columns')
        .update({ bg_color: color })
        .eq('company_id', companyId)
        .eq('id', column.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumnfärg uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kolumnfärg')
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (columns.length <= 1) throw new Error('Minst en kolumn måste finnas kvar');

      const target = columns.find((c) => c.key === status);
      const fallback = columns.find((c) => c.key !== status);
      if (!target || !fallback) throw new Error('Kunde inte hitta kolumner');

      const { error: moveError } = await supabase
        .from('projects')
        .update({ status: fallback.key })
        .eq('company_id', companyId)
        .eq('status', status);
      if (moveError) throw moveError;

      const { error: deleteError } = await supabase
        .from('project_columns')
        .delete()
        .eq('company_id', companyId)
        .eq('id', target.id);
      if (deleteError) throw deleteError;

      const remaining = columns
        .filter((c) => c.id !== target.id)
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
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Kolumn borttagen');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort kolumn')
  });

  function findContainer(itemOrContainerId: string, current: BoardState): string | null {
    const fromColumn = statusFromColumnId(itemOrContainerId);
    if (fromColumn) return fromColumn;

    for (const status of orderedStatuses) {
      if ((current[status] ?? []).some((p) => p.id === itemOrContainerId)) {
        return status;
      }
    }

    return null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const activeItemId = String(event.active.id);
    if (isListDragId(activeItemId)) return;

    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    setBoard((prev) => {
      const source = findContainer(activeItemId, prev);
      const target = findContainer(overId, prev);
      if (!source || !target) return prev;

      if (source === target) {
        const items = prev[source] ?? [];
        const oldIndex = items.findIndex((p) => p.id === activeItemId);
        const newIndex = items.findIndex((p) => p.id === overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;

        return {
          ...prev,
          [source]: arrayMove(items, oldIndex, newIndex)
        };
      }

      const sourceItems = prev[source] ?? [];
      const targetItems = prev[target] ?? [];
      const sourceIndex = sourceItems.findIndex((p) => p.id === activeItemId);
      if (sourceIndex < 0) return prev;

      const targetIndex = targetItems.findIndex((p) => p.id === overId);
      const moving = { ...sourceItems[sourceIndex], status: target };

      const nextSource = [...sourceItems.slice(0, sourceIndex), ...sourceItems.slice(sourceIndex + 1)];
      const insertionIndex = targetIndex >= 0 ? targetIndex : targetItems.length;
      const nextTarget = [...targetItems.slice(0, insertionIndex), moving, ...targetItems.slice(insertionIndex)];

      return {
        ...prev,
        [source]: nextSource,
        [target]: nextTarget
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const activeItemId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    setActiveId(null);

    if (isListDragId(activeItemId)) {
      const activeStatus = statusFromListId(activeItemId);
      const overStatus = overId ? statusFromListId(overId) : null;

      if (!activeStatus || !overStatus || activeStatus === overStatus) {
        setColumnReorderMode(false);
        return;
      }

      const oldIndex = orderedStatuses.findIndex((status) => status === activeStatus);
      const newIndex = orderedStatuses.findIndex((status) => status === overStatus);
      if (oldIndex < 0 || newIndex < 0) {
        setColumnReorderMode(false);
        return;
      }

      const nextOrder = arrayMove(orderedStatuses, oldIndex, newIndex);
      setColumnOrder(nextOrder);
      reorderColumnsMutation.mutate(nextOrder, {
        onError: () => setColumnOrder(statuses)
      });
      setColumnReorderMode(false);
      return;
    }

    if (!overId) {
      setBoard(buildBoardState(projects, statuses));
      return;
    }

    const dragged = projects.find((p) => p.id === activeItemId);
    if (!dragged) return;

    const targetStatus = findContainer(overId, board);
    if (!targetStatus) {
      setBoard(buildBoardState(projects, statuses));
      return;
    }

    const targetColumn = board[targetStatus] ?? [];
    const targetIndex = targetColumn.findIndex((p) => p.id === activeItemId);
    const before = targetIndex > 0 ? targetColumn[targetIndex - 1] : null;
    const after = targetIndex >= 0 && targetIndex < targetColumn.length - 1 ? targetColumn[targetIndex + 1] : null;

    let toPosition = dragged.position;
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

    if (dragged.status === targetStatus && dragged.position === toPosition) return;

    moveMutation.mutate({
      project: dragged,
      toStatus: targetStatus,
      toPosition
    });
  }

  if (statuses.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-muted p-4 text-sm">Inga kolumner konfigurerade ännu.</p>
        <Button variant="outline" size="sm" onClick={() => addColumnMutation.mutate()}>
          <Plus className="mr-1 h-4 w-4" /> Ny kolumn
        </Button>
      </div>
    );
  }

  const columnBusy =
    addColumnMutation.isPending ||
    renameColumnMutation.isPending ||
    deleteColumnMutation.isPending ||
    reorderColumnsMutation.isPending ||
    setColumnColorMutation.isPending;

  return (
    <div className="space-y-2 overflow-x-auto">
      {columnReorderMode ? (
        <div className="flex items-center justify-end px-1">
          <Button variant="outline" size="sm" onClick={() => setColumnReorderMode(false)}>
            Avsluta flyttläge (Esc)
          </Button>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-w-full gap-4 pb-2">
          <SortableContext items={orderedStatuses.map((status) => listId(status))} strategy={horizontalListSortingStrategy}>
            {orderedStatuses.map((status) => {
              const list = board[status] ?? [];
              return (
                <SortableColumn
                  key={status}
                  status={status}
                  title={titleByStatus.get(status) ?? status}
                  count={list.length}
                  bgColor={columns.find((column) => column.key === status)?.bg_color}
                  onRename={(s, title) => renameColumnMutation.mutate({ status: s, title })}
                  onDelete={(s) => deleteColumnMutation.mutate({ status: s })}
                  onSetColor={(s, color) => setColumnColorMutation.mutate({ status: s, color })}
                  canDelete={columns.length > 1}
                  reorderMode={columnReorderMode}
                  onEnableReorder={() => {
                    if (!columnReorderMode) {
                      setColumnReorderMode(true);
                      toast.info('Kolumnflytt aktiv. Dra kolumnen med handtaget.');
                    }
                  }}
                >
                  <SortableContext items={list.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="min-h-24 space-y-3">
                      {list.map((project) => (
                        <SortableCardItem key={project.id} id={project.id}>
                          <ProjectCard
                            project={project}
                            statusLabel={titleByStatus.get(project.workflow_status ?? project.status) ?? project.workflow_status ?? project.status}
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
                        </SortableCardItem>
                      ))}
                    </div>
                  </SortableContext>
                </SortableColumn>
              );
            })}
          </SortableContext>

          <AddColumnCard onAdd={() => addColumnMutation.mutate()} busy={columnBusy} />
        </div>
        {activeId ? <div className="sr-only">Drar {activeId}</div> : null}
      </DndContext>
    </div>
  );
}





