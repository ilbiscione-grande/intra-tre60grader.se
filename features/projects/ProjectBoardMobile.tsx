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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ActionSheet from '@/components/common/ActionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ProjectCard from '@/features/projects/ProjectCard';
import { useMoveProject, useProjectColumns, useProjects } from '@/features/projects/projectQueries';
import type { Project } from '@/lib/types';

type BoardState = Record<string, Project[]>;

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
  onOpenMoveMenu
}: {
  project: Project;
  statusLabel: string;
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
  children
}: {
  status: string;
  title: string;
  count: number;
  children: React.ReactNode;
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
          : 'border-border/70 bg-gradient-to-b from-card to-card/90'
      }`}
      aria-label={title}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-foreground/45">Dra kort sidledes mellan kolumner</p>
        </div>
        <Badge>{count}</Badge>
      </div>
      {children}
    </section>
  );
}

export default function ProjectBoardMobile({ companyId }: { companyId: string }) {
  const [activeStatus, setActiveStatus] = useState<string>('');
  const [selected, setSelected] = useState<Project | null>(null);
  const [board, setBoard] = useState<BoardState>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const edgeScrollRef = useRef<{ side: 'left' | 'right' | null; lastStepAt: number }>({
    side: null,
    lastStepAt: 0
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const moveMutation = useMoveProject(companyId);

  const columns = columnsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const statuses = useMemo(() => columns.map((column) => column.key), [columns]);

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
    const track = trackRef.current;
    if (!track || activeIndex < 0) return;

    const nextChild = track.children.item(activeIndex) as HTMLElement | null;
    nextChild?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, [activeIndex]);

  function updateActiveFromScroll() {
    const track = trackRef.current;
    if (!track || columns.length === 0) return;

    const width = track.clientWidth;
    if (!width) return;

    const nextIndex = Math.round(track.scrollLeft / width);
    const nextColumn = columns[Math.max(0, Math.min(columns.length - 1, nextIndex))];

    if (nextColumn && nextColumn.key !== activeStatus) {
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
    const edgeThreshold = 64;
    const stepWidth = rect.width * 0.9;
    const now = Date.now();
    const cooldownMs = 950;

    if (translated.right > rect.right - edgeThreshold) {
      const canAdvance =
        edgeScrollRef.current.side !== 'right' || now - edgeScrollRef.current.lastStepAt >= cooldownMs;

      if (canAdvance) {
        track.scrollTo({
          left: Math.min(track.scrollLeft + stepWidth, track.scrollWidth - rect.width),
          behavior: 'smooth'
        });
        edgeScrollRef.current = { side: 'right', lastStepAt: now };
      }
      return;
    }

    if (translated.left < rect.left + edgeThreshold) {
      const canAdvance =
        edgeScrollRef.current.side !== 'left' || now - edgeScrollRef.current.lastStepAt >= cooldownMs;

      if (canAdvance) {
        track.scrollTo({
          left: Math.max(track.scrollLeft - stepWidth, 0),
          behavior: 'smooth'
        });
        edgeScrollRef.current = { side: 'left', lastStepAt: now };
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
            disabled={activeIndex <= 0}
            onClick={() => setActiveStatus(columns[Math.max(0, activeIndex - 1)]?.key ?? activeStatus)}
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
            onClick={() => setActiveStatus(columns[Math.min(columns.length - 1, activeIndex + 1)]?.key ?? activeStatus)}
            aria-label="Nästa kolumn"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {columns.map((column, index) => (
          <button
            key={column.key}
            type="button"
            onClick={() => setActiveStatus(column.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
              activeStatus === column.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground/75'
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
              <MobileColumn key={column.key} status={column.key} title={column.title} count={list.length}>
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-foreground/45">
                  Kolumn {columnIndex + 1} av {columns.length}
                </p>

                <SortableContext items={list.map((project) => project.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {list.map((project) => (
                      <SortableProjectCard
                        key={project.id}
                        project={project}
                        statusLabel={titleByStatus.get(project.status) ?? project.status}
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
    </div>
  );
}
