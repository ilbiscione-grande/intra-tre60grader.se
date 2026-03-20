'use client';

import { useAppContext } from '@/components/providers/AppContext';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { canViewProjectSummary } from '@/lib/auth/capabilities';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId, role, capabilities } = useAppContext();
  const canSeeProjectSummary = canViewProjectSummary(role, capabilities);

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        {canSeeProjectSummary ? (
          <>
            <SectionErrorBoundary title="Projektöversikt">
              <ProjectOverviewKpis companyId={companyId} />
            </SectionErrorBoundary>
            <SectionErrorBoundary title="Ledningsvy">
              <ProjectLeadershipDashboard companyId={companyId} />
            </SectionErrorBoundary>
          </>
        ) : null}
        <SectionErrorBoundary title="Skapa projekt">
          <CreateProjectEntry companyId={companyId} mode="mobile" />
        </SectionErrorBoundary>
        <SectionErrorBoundary title="Projektflöde">
          <ProjectBoardMobile companyId={companyId} />
        </SectionErrorBoundary>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canSeeProjectSummary ? (
        <>
          <SectionErrorBoundary title="Projektöversikt">
            <ProjectOverviewKpis companyId={companyId} />
          </SectionErrorBoundary>
          <SectionErrorBoundary title="Ledningsvy">
            <ProjectLeadershipDashboard companyId={companyId} />
          </SectionErrorBoundary>
        </>
      ) : null}
      <SectionErrorBoundary title="Skapa projekt">
        <CreateProjectEntry companyId={companyId} mode="desktop" />
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Projektflöde">
        <ProjectBoardDesktop companyId={companyId} />
      </SectionErrorBoundary>
    </div>
  );
}
