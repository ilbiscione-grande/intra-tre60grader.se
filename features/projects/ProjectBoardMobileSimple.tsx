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
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PROJECT_COLUMN_COLOR_OPTIONS, getProjectColumnBackground } from '@/features/projects/columnColors';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import ProjectCard from '@/features/projects/ProjectCard';
import { useMoveProject, useProjectActivitySummaries, useProjectColumns, useProjectCustomers, useProjectMembers, useProjects, useUpdateProjectWorkflowStatus } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';

type BoardState = Record<string, Project[]>;

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
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

function columnId(status: string) {
  return `mobile-column:${status}`;
}

function buildBoardState(projects: Project[], statuses: string[]): BoardState {
  const base: BoardState = Object.fromEntries(statuses.map((status) => [status, []]));

  for (const project of projects) {
    if (!base[project.status]) base[project.status] = [];
    base[project.status].push(project);
  }

  Object.values(base).forEach((list) => list.sort((a, b) => a.position - b.position));
  return base;
}

function findContainer(projectId: string, board: BoardState) {
  for (const [status, list] of Object.entries(board)) {
    if (list.some((project) => project.id === projectId)) return status;
  }
  return null;
}

function moveProjectBetweenColumns(current: BoardState, projectId: string, targetStatus: string) {
  const sourceStatus = findContainer(projectId, current);
  if (!sourceStatus || sourceStatus === targetStatus) return current;

  const sourceItems = current[sourceStatus] ?? [];
  const targetItems = current[targetStatus] ?? [];
  const sourceIndex = sourceItems.findIndex((project) => project.id === projectId);
  if (sourceIndex < 0) return current;

  const moving = { ...sourceItems[sourceIndex], status: targetStatus };
  return {
    ...current,
    [sourceStatus]: [...sourceItems.slice(0, sourceIndex), ...sourceItems.slice(sourceIndex + 1)],
    [targetStatus]: [...targetItems, moving]
  };
}

function SortableProjectCard({
  project,
  statusLabel,
  statusOptions,
  columnOptions,
  onSetWorkflowStatus,
  onMoveToColumn,
  isUpdatingWorkflowStatus,
  members,
  availableMembers,
  activitySummary
}: {
  project: Project;
  statusLabel: string;
  statusOptions?: React.ComponentProps<typeof ProjectCard>['statusOptions'];
  columnOptions?: React.ComponentProps<typeof ProjectCard>['columnOptions'];
  onSetWorkflowStatus?: React.ComponentProps<typeof ProjectCard>['onSetWorkflowStatus'];
  onMoveToColumn?: React.ComponentProps<typeof ProjectCard>['onMoveToColumn'];
  isUpdatingWorkflowStatus?: React.ComponentProps<typeof ProjectCard>['isUpdatingWorkflowStatus'];
  members: React.ComponentProps<typeof ProjectCard>['members'];
  availableMembers: React.ComponentProps<typeof ProjectCard>['availableMembers'];
  activitySummary?: React.ComponentProps<typeof ProjectCard>['activitySummary'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 20 : 1
      }}
      className={isDragging ? 'touch-none' : 'touch-pan-y'}
      {...attributes}
      {...listeners}
    >
      <ProjectCard
        project={project}
        statusLabel={statusLabel}
        statusOptions={statusOptions}
        columnOptions={columnOptions}
        onSetWorkflowStatus={onSetWorkflowStatus}
        onMoveToColumn={onMoveToColumn}
        isUpdatingWorkflowStatus={isUpdatingWorkflowStatus}
        members={members}
        availableMembers={availableMembers}
        activitySummary={activitySummary}
      />
    </div>
  );
}

function ActiveMobileColumn({
  status,
  title,
  count,
  children,
  bgColor,
  isLocked,
  index,
  total
}: {
  status: string;
  title: string;
  count: number;
  children: React.ReactNode;
  bgColor?: string | null;
  isLocked: boolean;
  index: number;
  total: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(status) });
  const backgroundColor = getProjectColumnBackground(bgColor);

  return (
    <section
      ref={setNodeRef}
      className={`rounded-[22px] border p-4 shadow-sm transition ${
        isOver
          ? 'border-primary/70 bg-primary/5 ring-2 ring-primary/25'
          : isLocked
            ? 'border-primary/45 bg-gradient-to-b from-card to-card/90 ring-2 ring-primary/15'
            : 'border-border/70 bg-gradient-to-b from-card to-card/90'
      }`}
      style={{ backgroundColor }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className={`mt-1 text-xs font-semibold uppercase tracking-[0.24em] ${isLocked ? 'text-primary' : 'text-foreground/45'}`}>
            Kolumn {index + 1} av {total}
          </p>
        </div>
        <Badge>{count}</Badge>
      </div>
      {children}
    </section>
  );
}

export default function ProjectBoardMobileSimple({
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
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState('');
  const [board, setBoard] = useState<BoardState>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lockedStatus, setLockedStatus] = useState<string | null>(null);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [createColumnOpen, setCreateColumnOpen] = useState(false);
  const [renameColumnOpen, setRenameColumnOpen] = useState(false);
  const [deleteColumnOpen, setDeleteColumnOpen] = useState(false);
  const [colorColumnOpen, setColorColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [renameColumnTitle, setRenameColumnTitle] = useState('');
  const activeStatusRef = useRef('');
  const activeIndexRef = useRef(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const edgeStepRef = useRef<{ side: 'left' | 'right' | null; enteredAt: number; lastStepAt: number }>({
    side: null,
    enteredAt: 0,
    lastStepAt: 0
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));
  const { containerRef: columnTabsRef, registerItem: registerColumnTab } = useAutoScrollActiveTab(activeStatus);

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

  const titleByStatus = useMemo(() => new Map(columns.map((column) => [column.key, column.title])), [columns]);
  const projects = useMemo(
    () =>
      (projectsQuery.data ?? []).filter((project) => {
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
          titleByStatus.get(project.status) ?? '',
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
    [availableMembers, currentUserId, customerById, endDateFilter, membersByProjectId, onlyMine, projectsQuery.data, search, startDateFilter, statusFilter, titleByStatus]
  );
  const statuses = useMemo(() => columns.map((column) => column.key), [columns]);
  const initialBoard = useMemo(() => buildBoardState(projects, statuses), [projects, statuses]);
  const activeColumn = useMemo(() => columns.find((column) => column.key === activeStatus) ?? null, [activeStatus, columns]);
  const activeIndex = Math.max(0, columns.findIndex((column) => column.key === activeStatus));
  const activeList = board[activeStatus] ?? [];
  const activeProject = activeId ? projects.find((project) => project.id === activeId) ?? null : null;

  useEffect(() => {
    setBoard(initialBoard);
  }, [initialBoard]);

  useEffect(() => {
    if (!activeStatus && columns.length > 0) {
      setActiveStatus(columns[0].key);
      return;
    }
    if (activeStatus && columns.length > 0 && !columns.some((column) => column.key === activeStatus)) {
      setActiveStatus(columns[0].key);
    }
  }, [activeStatus, columns]);

  useEffect(() => {
    activeStatusRef.current = activeStatus;
    activeIndexRef.current = Math.max(0, columns.findIndex((column) => column.key === activeStatus));
  }, [activeStatus, columns]);

  useEffect(() => {
    setRenameColumnTitle(activeColumn?.title ?? '');
  }, [activeColumn?.title]);

  useEffect(() => {
    if (!lockedStatus) return;
    const timeout = window.setTimeout(() => {
      setLockedStatus((current) => (current === lockedStatus ? null : current));
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [lockedStatus]);

  function switchColumn(nextStatus: string) {
    const nextIndex = columns.findIndex((column) => column.key === nextStatus);
    if (nextIndex < 0) return;
    activeStatusRef.current = nextStatus;
    activeIndexRef.current = nextIndex;
    setActiveStatus(nextStatus);
  }

  function commitMove(project: Project, status: string, toPosition: number) {
    moveMutation.mutate({ project, toStatus: status, toPosition });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    edgeStepRef.current = { side: null, enteredAt: 0, lastStepAt: 0 };
  }

  function handleDragMove(event: DragMoveEvent) {
    if (columns.length <= 1 || !activeId) return;

    const deltaX = event.delta.x;
    const deltaY = Math.abs(event.delta.y);
    const horizontalTrigger = 86;
    const cooldownMs = 1350;
    const dwellMs = 260;
    const now = Date.now();
    const currentIndex = activeIndexRef.current;
    const horizontalIntent = Math.abs(deltaX) > deltaY + 24;

    if (!horizontalIntent) {
      edgeStepRef.current = { ...edgeStepRef.current, side: null, enteredAt: 0 };
      return;
    }

    if (deltaX >= horizontalTrigger && currentIndex < columns.length - 1) {
      if (edgeStepRef.current.side !== 'right') {
        edgeStepRef.current = { ...edgeStepRef.current, side: 'right', enteredAt: now };
        return;
      }
      if (now - edgeStepRef.current.enteredAt < dwellMs || now - edgeStepRef.current.lastStepAt < cooldownMs) return;

      const nextColumn = columns[currentIndex + 1];
      edgeStepRef.current = { side: 'right', enteredAt: now, lastStepAt: now };
      switchColumn(nextColumn.key);
      setLockedStatus(nextColumn.key);
      setBoard((current) => moveProjectBetweenColumns(current, activeId, nextColumn.key));
      return;
    }

    if (deltaX <= -horizontalTrigger && currentIndex > 0) {
      if (edgeStepRef.current.side !== 'left') {
        edgeStepRef.current = { ...edgeStepRef.current, side: 'left', enteredAt: now };
        return;
      }
      if (now - edgeStepRef.current.enteredAt < dwellMs || now - edgeStepRef.current.lastStepAt < cooldownMs) return;

      const nextColumn = columns[currentIndex - 1];
      edgeStepRef.current = { side: 'left', enteredAt: now, lastStepAt: now };
      switchColumn(nextColumn.key);
      setLockedStatus(nextColumn.key);
      setBoard((current) => moveProjectBetweenColumns(current, activeId, nextColumn.key));
      return;
    }

    edgeStepRef.current = { ...edgeStepRef.current, side: null, enteredAt: 0 };
  }

  function goToPreviousColumn() {
    if (activeIndexRef.current <= 0) return;
    switchColumn(columns[Math.max(0, activeIndexRef.current - 1)]?.key ?? activeStatusRef.current);
  }

  function goToNextColumn() {
    if (activeIndexRef.current >= columns.length - 1) return;
    switchColumn(columns[Math.min(columns.length - 1, activeIndexRef.current + 1)]?.key ?? activeStatusRef.current);
  }

  function handleColumnTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (activeId) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleColumnTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (activeId) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);

    if (Math.abs(deltaX) < 54 || Math.abs(deltaX) < deltaY + 18) return;

    if (deltaX < 0) {
      goToNextColumn();
    } else {
      goToPreviousColumn();
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const activeProjectId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    setBoard((current) => {
      const list = current[activeStatusRef.current] ?? [];
      const sourceIndex = list.findIndex((project) => project.id === activeProjectId);
      if (sourceIndex < 0 || overId === columnId(activeStatusRef.current)) return current;

      const overIndex = list.findIndex((project) => project.id === overId);
      if (overIndex < 0 || overIndex === sourceIndex) return current;

      return {
        ...current,
        [activeStatusRef.current]: arrayMove(list, sourceIndex, overIndex)
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeProjectId = String(event.active.id);
    setActiveId(null);
    setLockedStatus(null);
    edgeStepRef.current = { side: null, enteredAt: 0, lastStepAt: 0 };

    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) {
      setBoard(initialBoard);
      return;
    }

    const targetStatus = findContainer(activeProjectId, board);
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

  const addColumnMutation = useMutation({
    mutationFn: async () => {
      const title = newColumnTitle.trim();
      if (!title) throw new Error('Kolumnnamn krävs');
      const key = makeUniqueKey(columns.map((column) => column.key), toKeySeed(title));
      const position = (columns.at(-1)?.position ?? 0) + 1;
      const { error } = await supabase.from('project_columns').insert({ company_id: companyId, key, title, position });
      if (error) throw error;
      return key;
    },
    onSuccess: async (key) => {
      setNewColumnTitle('');
      setCreateColumnOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumn tillagd');
      switchColumn(key);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till kolumn')
  });

  const renameColumnMutation = useMutation({
    mutationFn: async () => {
      const clean = renameColumnTitle.trim();
      if (!clean) throw new Error('Kolumnnamn krävs');
      if (!activeColumn) throw new Error('Kolumn hittades inte');
      const { error } = await supabase.from('project_columns').update({ title: clean }).eq('company_id', companyId).eq('id', activeColumn.id);
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

  const setColumnColorMutation = useMutation({
    mutationFn: async (color: string | null) => {
      if (!activeColumn) throw new Error('Kolumn hittades inte');
      const { error } = await supabase
        .from('project_columns')
        .update({ bg_color: color })
        .eq('company_id', companyId)
        .eq('id', activeColumn.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setColorColumnOpen(false);
      setColumnSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      toast.success('Kolumnfärg uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera kolumnfärg')
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async () => {
      if (!activeColumn) throw new Error('Kolumn hittades inte');
      if (columns.length <= 1) throw new Error('Minst en kolumn måste finnas kvar');
      const fallback = columns.find((column) => column.key !== activeColumn.key);
      if (!fallback) throw new Error('Ingen reservkolumn hittades');

      const { error: moveError } = await supabase.from('projects').update({ status: fallback.key }).eq('company_id', companyId).eq('status', activeColumn.key);
      if (moveError) throw moveError;

      const { error: deleteError } = await supabase.from('project_columns').delete().eq('company_id', companyId).eq('id', activeColumn.id);
      if (deleteError) throw deleteError;

      return fallback.key;
    },
    onSuccess: async (fallbackKey) => {
      setDeleteColumnOpen(false);
      setColumnSheetOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['project-columns', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Kolumn borttagen');
      switchColumn(fallbackKey);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort kolumn')
  });

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
            <Badge>{activeList.length}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setCreateColumnOpen(true)} aria-label="Lägg till kolumn">
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setColumnSheetOpen(true)} aria-label="Kolumninställningar">
            <Ellipsis className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={activeIndex <= 0} onClick={goToPreviousColumn} aria-label="Föregående kolumn">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={activeIndex >= columns.length - 1} onClick={goToNextColumn} aria-label="Nästa kolumn">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={columnTabsRef} className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {columns.map((column, index) => (
          <button
            key={column.key}
            ref={registerColumnTab(column.key)}
            type="button"
            onClick={() => switchColumn(column.key)}
            className={`shrink-0 border-b-2 px-1 pb-2 pt-1 text-sm font-medium transition ${
              activeStatus === column.key ? 'border-primary text-foreground' : 'border-transparent text-foreground/55'
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
        <div onTouchStart={handleColumnTouchStart} onTouchEnd={handleColumnTouchEnd}>
          <ActiveMobileColumn
            status={activeStatus}
            title={activeColumn?.title ?? activeStatus}
            count={activeList.length}
            bgColor={activeColumn?.bg_color}
            isLocked={lockedStatus === activeStatus}
            index={activeIndex}
            total={columns.length}
          >
            <SortableContext items={activeList.map((project) => project.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {activeList.map((project) => (
                  <SortableProjectCard
                    key={project.id}
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
                ))}
                {activeList.length === 0 ? (
                  <p className="rounded-2xl bg-muted/60 p-4 text-sm text-foreground/70">
                    {search || statusFilter !== 'all' ? 'Inga projekt matchar filtret.' : 'Inga projekt i kolumnen.'}
                  </p>
                ) : null}
              </div>
            </SortableContext>
          </ActiveMobileColumn>
        </div>

        <DragOverlay>
          {activeProject ? (
            <div className="w-[88vw] touch-none">
              <ProjectCard
                project={activeProject}
                statusLabel={titleByStatus.get(activeProject.workflow_status ?? activeProject.status) ?? activeProject.workflow_status ?? activeProject.status}
                statusOptions={columns.map((column) => ({ key: column.key, title: column.title }))}
                columnOptions={columns.map((column) => ({ key: column.key, title: column.title }))}
                onSetWorkflowStatus={(cardProject, workflowStatus) =>
                  updateWorkflowStatusMutation.mutate({ projectId: cardProject.id, workflowStatus })
                }
                onMoveToColumn={(cardProject, status) =>
                  moveMutation.mutate({ project: cardProject, toStatus: status, toPosition: 9999 })
                }
                isUpdatingWorkflowStatus={updateWorkflowStatusMutation.isPending}
                members={membersByProjectId.get(activeProject.id) ?? []}
                availableMembers={availableMembers}
                activitySummary={activitySummaryByProjectId.get(activeProject.id)}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ActionSheet open={columnSheetOpen} onClose={() => setColumnSheetOpen(false)} title={activeColumn?.title ?? 'Kolumn'} description="Hantera den aktiva kolumnen.">
        <div className="grid gap-2">
          <Button type="button" variant="outline" className="h-12 justify-start rounded-2xl" onClick={() => { setColumnSheetOpen(false); setRenameColumnOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" />
            Byt namn
          </Button>
          <Button type="button" variant="outline" className="h-12 justify-start rounded-2xl" onClick={() => { setColumnSheetOpen(false); setColorColumnOpen(true); }}>
            <div className="mr-2 h-4 w-4 rounded-full border" style={{ backgroundColor: getProjectColumnBackground(activeColumn?.bg_color) }} />
            Ändra bakgrund
          </Button>
          <Button type="button" variant="outline" className="h-12 justify-start rounded-2xl" onClick={() => { setColumnSheetOpen(false); setDeleteColumnOpen(true); }} disabled={columns.length <= 1}>
            <Trash2 className="mr-2 h-4 w-4" />
            Ta bort kolumn
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet open={createColumnOpen} onClose={() => setCreateColumnOpen(false)} title="Ny kolumn" description="Lägg till en ny kolumn i projektflödet.">
        <div className="space-y-3">
          <Input placeholder="Kolumnnamn" value={newColumnTitle} onChange={(event) => setNewColumnTitle(event.target.value)} />
          <Button type="button" className="w-full" onClick={() => addColumnMutation.mutate()} disabled={addColumnMutation.isPending}>
            {addColumnMutation.isPending ? 'Lägger till...' : 'Lägg till kolumn'}
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet open={renameColumnOpen} onClose={() => setRenameColumnOpen(false)} title="Byt namn på kolumn" description={activeColumn?.title ?? undefined}>
        <div className="space-y-3">
          <Input placeholder="Kolumnnamn" value={renameColumnTitle} onChange={(event) => setRenameColumnTitle(event.target.value)} />
          <Button type="button" className="w-full" onClick={() => renameColumnMutation.mutate()} disabled={renameColumnMutation.isPending}>
            {renameColumnMutation.isPending ? 'Sparar...' : 'Spara namn'}
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet open={colorColumnOpen} onClose={() => setColorColumnOpen(false)} title="Kolumnbakgrund" description="Välj en färg för den aktiva kolumnen.">
        <div className="grid gap-2">
          {PROJECT_COLUMN_COLOR_OPTIONS.map((option) => (
            <Button
              key={option.label}
              type="button"
              variant="outline"
              className="h-12 justify-start rounded-2xl"
              onClick={() => setColumnColorMutation.mutate(option.value || null)}
              disabled={setColumnColorMutation.isPending}
            >
              <div className="mr-3 h-5 w-5 rounded-full border" style={{ backgroundColor: option.background }} />
              {option.label}
            </Button>
          ))}
        </div>
      </ActionSheet>

      <ActionSheet open={deleteColumnOpen} onClose={() => setDeleteColumnOpen(false)} title="Ta bort kolumn" description="Projekt i kolumnen flyttas till en annan kolumn.">
        <div className="space-y-3">
          <p className="text-sm text-foreground/70">
            Vill du ta bort <span className="font-medium text-foreground">{activeColumn?.title}</span>?
          </p>
          <Button type="button" variant="destructive" className="w-full" onClick={() => deleteColumnMutation.mutate()} disabled={deleteColumnMutation.isPending || columns.length <= 1}>
            {deleteColumnMutation.isPending ? 'Tar bort...' : 'Ta bort kolumn'}
          </Button>
        </div>
      </ActionSheet>
    </div>
  );
}
