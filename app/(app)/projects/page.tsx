'use client';

import { useState } from 'react';
import { useAppContext } from '@/components/providers/AppContext';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { Button } from '@/components/ui/button';
import { canViewProjectSummary } from '@/lib/auth/capabilities';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId, role, capabilities } = useAppContext();
  const canSeeProjectSummary = canViewProjectSummary(role, capabilities);
  const [showSummary, setShowSummary] = useState(false);

  const summaryToggle = canSeeProjectSummary ? (
    <Button variant={showSummary ? 'default' : 'outline'} size="sm" className="h-9 px-3 text-xs sm:text-sm" onClick={() => setShowSummary((current) => !current)}>
        {showSummary ? 'Dölj sammanfattning' : 'Visa sammanfattning'}
    </Button>
  ) : null;

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        {summaryToggle}
        {canSeeProjectSummary && showSummary ? (
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
      <div className="flex items-center justify-end gap-2">
        {summaryToggle}
        <SectionErrorBoundary title="Skapa projekt">
          <CreateProjectEntry companyId={companyId} mode="desktop" />
        </SectionErrorBoundary>
      </div>
      {canSeeProjectSummary && showSummary ? (
        <>
          <SectionErrorBoundary title="Projektöversikt">
            <ProjectOverviewKpis companyId={companyId} />
          </SectionErrorBoundary>
          <SectionErrorBoundary title="Ledningsvy">
            <ProjectLeadershipDashboard companyId={companyId} />
          </SectionErrorBoundary>
        </>
      ) : null}
      <SectionErrorBoundary title="Projektflöde">
        <ProjectBoardDesktop companyId={companyId} />
      </SectionErrorBoundary>
    </div>
  );
}
