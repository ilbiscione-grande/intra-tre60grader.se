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
    <div className="flex justify-end">
      <Button variant={showSummary ? 'default' : 'outline'} size="sm" onClick={() => setShowSummary((current) => !current)}>
        {showSummary ? 'Dölj sammanfattning' : 'Visa sammanfattning'}
      </Button>
    </div>
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
        <CreateProjectEntry companyId={companyId} mode="desktop" />
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Projektflöde">
        <ProjectBoardDesktop companyId={companyId} />
      </SectionErrorBoundary>
    </div>
  );
}
