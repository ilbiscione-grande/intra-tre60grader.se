'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Rows3, SlidersHorizontal } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import ProjectAutomationCard from '@/components/settings/ProjectAutomationCard';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectListView from '@/features/projects/ProjectListView';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { canViewProjectSummary } from '@/lib/auth/capabilities';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

type ProjectViewMode = 'board' | 'list';

const PROJECT_VIEW_MODE_KEY = 'projects_view_mode';

export default function ProjectsPage() {
  const mode = useBreakpointMode();
  const { companyId, role, capabilities } = useAppContext();
  const canSeeProjectSummary = canViewProjectSummary(role, capabilities);
  const [showSummary, setShowSummary] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [viewMode, setViewMode] = useState<ProjectViewMode>('board');

  useEffect(() => {
    const stored = window.localStorage.getItem(PROJECT_VIEW_MODE_KEY);
    if (stored === 'board' || stored === 'list') {
      setViewMode(stored);
    }
  }, []);

  function changeViewMode(nextMode: ProjectViewMode) {
    setViewMode(nextMode);
    window.localStorage.setItem(PROJECT_VIEW_MODE_KEY, nextMode);
  }

  const summaryToggle = canSeeProjectSummary ? (
    <Button
      variant={showSummary ? 'default' : 'outline'}
      size="sm"
      className="h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px] sm:h-9 sm:px-3 sm:text-sm"
      onClick={() => setShowSummary((current) => !current)}
    >
        {showSummary ? 'Dölj översikt' : 'Översikt'}
    </Button>
  ) : null;

  const automationTrigger = role === 'admin' ? (
    <Button
      variant="outline"
      size="sm"
      className="h-8 shrink-0 whitespace-nowrap px-2.5 text-[11px] sm:h-9 sm:px-3 sm:text-sm"
      onClick={() => setShowAutomation(true)}
    >
      <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
      Auto
    </Button>
  ) : null;

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          {summaryToggle}
          {automationTrigger}
          <SectionErrorBoundary title="Skapa projekt">
            <CreateProjectEntry companyId={companyId} mode="mobile" />
          </SectionErrorBoundary>
        </div>
        <div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
          <button
            type="button"
            onClick={() => changeViewMode('board')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
              viewMode === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            type="button"
            onClick={() => changeViewMode('list')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
              viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
            }`}
          >
            <Rows3 className="h-3.5 w-3.5" />
            Lista
          </button>
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
          {viewMode === 'board' ? <ProjectBoardMobile companyId={companyId} /> : <ProjectListView companyId={companyId} />}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
          <button
            type="button"
            onClick={() => changeViewMode('board')}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
              viewMode === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </button>
          <button
            type="button"
            onClick={() => changeViewMode('list')}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
              viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
            }`}
          >
            <Rows3 className="h-4 w-4" />
            Lista
          </button>
        </div>
        <div className="flex items-center justify-end gap-2">
        {automationTrigger}
        {summaryToggle}
        <SectionErrorBoundary title="Skapa projekt">
          <CreateProjectEntry companyId={companyId} mode="desktop" />
        </SectionErrorBoundary>
        </div>
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
        {viewMode === 'board' ? <ProjectBoardDesktop companyId={companyId} /> : <ProjectListView companyId={companyId} />}
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
