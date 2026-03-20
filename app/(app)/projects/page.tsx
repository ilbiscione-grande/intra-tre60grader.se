'use client';

import { useAppContext } from '@/components/providers/AppContext';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId } = useAppContext();

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <ProjectOverviewKpis companyId={companyId} />
        <ProjectLeadershipDashboard companyId={companyId} />
        <CreateProjectEntry companyId={companyId} mode="mobile" />
        <ProjectBoardMobile companyId={companyId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectOverviewKpis companyId={companyId} />
      <ProjectLeadershipDashboard companyId={companyId} />
      <CreateProjectEntry companyId={companyId} mode="desktop" />
      <ProjectBoardDesktop companyId={companyId} />
    </div>
  );
}
