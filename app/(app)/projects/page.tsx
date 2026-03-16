'use client';

import { useAppContext } from '@/components/providers/AppContext';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId } = useAppContext();

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <CreateProjectEntry companyId={companyId} mode="mobile" />
        <ProjectBoardMobile companyId={companyId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CreateProjectEntry companyId={companyId} mode="desktop" />
      <ProjectBoardDesktop companyId={companyId} />
    </div>
  );
}
