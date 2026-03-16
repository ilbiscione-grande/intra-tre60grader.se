'use client';

import { useEffect, useMemo, useState } from 'react';
import ActionSheet from '@/components/common/ActionSheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProjectCard from '@/features/projects/ProjectCard';
import { useProjectColumns, useProjects, useSetProjectStatus } from '@/features/projects/projectQueries';
import type { Project } from '@/lib/types';

export default function ProjectBoardMobile({ companyId }: { companyId: string }) {
  const [activeStatus, setActiveStatus] = useState<string>('');
  const [selected, setSelected] = useState<Project | null>(null);

  const projectsQuery = useProjects(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const setStatusMutation = useSetProjectStatus(companyId);

  const columns = columnsQuery.data ?? [];

  useEffect(() => {
    if (!activeStatus && columns.length > 0) {
      setActiveStatus(columns[0].key);
    }
  }, [activeStatus, columns]);

  const titleByStatus = useMemo(() => new Map(columns.map((c) => [c.key, c.title])), [columns]);

  const projects = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => project.status === activeStatus),
    [activeStatus, projectsQuery.data]
  );

  if (columns.length === 0) {
    return <p className="rounded-xl bg-muted p-4 text-sm">Inga kolumner konfigurerade ännu.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Visa kolumn</p>
        <Select value={activeStatus} onValueChange={setActiveStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Välj kolumn" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.key} value={column.key}>
                {column.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            statusLabel={titleByStatus.get(project.status) ?? project.status}
            actions={
              <Button variant="outline" size="sm" onClick={() => setSelected(project)}>
                Flytta
              </Button>
            }
          />
        ))}

        {projects.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm">Inga projekt i kolumnen.</p>}
      </div>

      <ActionSheet open={Boolean(selected)} onClose={() => setSelected(null)} title="Flytta projekt" description={selected?.title}>
        <div className="grid gap-2">
          {columns.map((column) => (
            <Button
              key={column.key}
              variant="outline"
              className="justify-start"
              onClick={() => {
                if (!selected) return;
                setStatusMutation.mutate({ project: selected, toStatus: column.key });
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
