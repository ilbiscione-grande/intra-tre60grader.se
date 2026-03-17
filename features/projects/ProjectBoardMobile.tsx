'use client';

import { ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ActionSheet from '@/components/common/ActionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ProjectCard from '@/features/projects/ProjectCard';
import { useProjectColumns, useProjects, useSetProjectStatus } from '@/features/projects/projectQueries';
import type { Project } from '@/lib/types';

function MobileMoveButtons({
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight
}: {
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!canMoveLeft}
        onClick={onMoveLeft}
        aria-label="Flytta åt vänster"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={!canMoveRight}
        onClick={onMoveRight}
        aria-label="Flytta åt höger"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function ProjectBoardMobile({ companyId }: { companyId: string }) {
  const [activeStatus, setActiveStatus] = useState<string>('');
  const [selected, setSelected] = useState<Project | null>(null);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const setStatusMutation = useSetProjectStatus(companyId);

  const columns = columnsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

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
  const projectsByStatus = useMemo(() => {
    const base = new Map<string, Project[]>();
    columns.forEach((column) => base.set(column.key, []));

    for (const project of projects) {
      const list = base.get(project.status);
      if (list) {
        list.push(project);
      } else {
        base.set(project.status, [project]);
      }
    }

    for (const list of base.values()) {
      list.sort((a, b) => a.position - b.position);
    }

    return base;
  }, [columns, projects]);

  const activeIndex = useMemo(
    () => Math.max(0, columns.findIndex((column) => column.key === activeStatus)),
    [activeStatus, columns]
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

  function moveProject(project: Project, status: string) {
    setPendingMoveId(project.id);
    setStatusMutation.mutate(
      { project, toStatus: status },
      {
        onSettled: () => setPendingMoveId(null)
      }
    );
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
            <Badge>{projectsByStatus.get(activeStatus)?.length ?? 0}</Badge>
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

      <div
        ref={trackRef}
        onScroll={updateActiveFromScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {columns.map((column, columnIndex) => {
          const list = projectsByStatus.get(column.key) ?? [];

          return (
            <section
              key={column.key}
              className="mobile-column-panel min-w-full snap-center rounded-[22px] border border-border/70 bg-gradient-to-b from-card to-card/90 p-4 shadow-sm"
              aria-label={column.title}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground/45">
                    Kolumn {columnIndex + 1} av {columns.length}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{column.title}</h3>
                </div>
                <Badge>{list.length}</Badge>
              </div>

              <div className="space-y-3">
                {list.map((project) => {
                  const leftColumn = columns[columnIndex - 1] ?? null;
                  const rightColumn = columns[columnIndex + 1] ?? null;
                  const isMoving = pendingMoveId === project.id || setStatusMutation.isPending;

                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      statusLabel={titleByStatus.get(project.status) ?? project.status}
                      actions={
                        <div className="flex items-center gap-2">
                          <MobileMoveButtons
                            canMoveLeft={Boolean(leftColumn) && !isMoving}
                            canMoveRight={Boolean(rightColumn) && !isMoving}
                            onMoveLeft={() => {
                              if (leftColumn) moveProject(project, leftColumn.key);
                            }}
                            onMoveRight={() => {
                              if (rightColumn) moveProject(project, rightColumn.key);
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelected(project)}
                            aria-label="Fler flyttval"
                          >
                            <GripHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      }
                    />
                  );
                })}

                {list.length === 0 && (
                  <p className="rounded-2xl bg-muted/60 p-4 text-sm text-foreground/70">Inga projekt i kolumnen.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

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
              disabled={!selected || selected.status === column.key || setStatusMutation.isPending}
              onClick={() => {
                if (!selected) return;
                moveProject(selected, column.key);
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
