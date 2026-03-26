'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import ProjectAutomationCard from '@/components/settings/ProjectAutomationCard';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { canViewProjectSummary } from '@/lib/auth/capabilities';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId, role, capabilities } = useAppContext();
  const canSeeProjectSummary = canViewProjectSummary(role, capabilities);
  const [showSummary, setShowSummary] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);

  const summaryToggle = canSeeProjectSummary ? (
    <Button variant={showSummary ? 'default' : 'outline'} size="sm" className="h-9 px-3 text-xs sm:text-sm" onClick={() => setShowSummary((current) => !current)}>
        {showSummary ? 'Dölj sammanfattning' : 'Visa sammanfattning'}
    </Button>
  ) : null;

  const automationTrigger = role === 'admin' ? (
    <Button variant="outline" size="sm" className="h-9 px-3 text-xs sm:text-sm" onClick={() => setShowAutomation(true)}>
      <SlidersHorizontal className="mr-2 h-4 w-4" />
      Automationer
    </Button>
  ) : null;

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {summaryToggle}
          {automationTrigger}
          <SectionErrorBoundary title="Skapa projekt">
            <CreateProjectEntry companyId={companyId} mode="mobile" />
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
          <ProjectBoardMobile companyId={companyId} />
        </SectionErrorBoundary>

        <Dialog open={showAutomation} onOpenChange={setShowAutomation}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Projektautomationer</DialogTitle>
            </DialogHeader>
            <ProjectAutomationCard companyId={companyId} />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {automationTrigger}
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

      <Dialog open={showAutomation} onOpenChange={setShowAutomation}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Projektautomationer</DialogTitle>
          </DialogHeader>
          <ProjectAutomationCard companyId={companyId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
