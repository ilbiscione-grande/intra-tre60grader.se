'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Project } from '@/lib/types';

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
  statusLabel
}: {
  project: Project;
  actions?: React.ReactNode;
  statusLabel?: string;
}) {
  return (
    <Card className="group relative transition-shadow hover:shadow-sm">
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Öppna projekt ${project.title}`}
        className="absolute inset-0 z-10 rounded-[inherit]"
      />
      <CardContent className="relative flex items-start justify-between gap-3 p-4">
        <div>
          <h3 className="font-semibold group-hover:underline">{project.title}</h3>
          <Badge className="mt-2 w-fit uppercase tracking-wide">{statusLabel ?? fallbackLabel(project.status)}</Badge>
        </div>
        {actions ? <div className="relative z-20">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
