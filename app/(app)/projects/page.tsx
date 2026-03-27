'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Rows3, SlidersHorizontal, X } from 'lucide-react';
import ProfileBadge from '@/components/common/ProfileBadge';
import { useAppContext } from '@/components/providers/AppContext';
import SectionErrorBoundary from '@/components/common/SectionErrorBoundary';
import ProjectAutomationCard from '@/components/settings/ProjectAutomationCard';
import CreateProjectEntry from '@/features/projects/CreateProjectEntry';
import ProjectBoardDesktop from '@/features/projects/ProjectBoardDesktop';
import ProjectBoardMobile from '@/features/projects/ProjectBoardMobile';
import ProjectListView from '@/features/projects/ProjectListView';
import ProjectLeadershipDashboard from '@/features/projects/ProjectLeadershipDashboard';
import ProjectOverviewKpis from '@/features/projects/ProjectOverviewKpis';
import { useCompanyMemberOptions, useProjectColumns } from '@/features/projects/projectQueries';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { canViewProjectSummary } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/client';
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
  const [projectSearch, setProjectSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const searchMenuRef = useRef<HTMLDivElement | null>(null);
  const columnsQuery = useProjectColumns(companyId);
  const companyMemberOptionsQuery = useCompanyMemberOptions(companyId);
  const statusOptions = useMemo(
    () => [{ key: 'all', title: 'Alla statusar' }, ...(columnsQuery.data ?? []).map((column) => ({ key: column.key, title: column.title }))],
    [columnsQuery.data]
  );
  const filterMembers = useMemo(() => {
    const members = [...(companyMemberOptionsQuery.data ?? [])];
    members.sort((a, b) => {
      if (currentUserId && a.user_id === currentUserId && b.user_id !== currentUserId) return -1;
      if (currentUserId && b.user_id === currentUserId && a.user_id !== currentUserId) return 1;
      const aLabel = getUserDisplayName({ displayName: a.display_name, email: a.email, handle: a.handle, userId: a.user_id });
      const bLabel = getUserDisplayName({ displayName: b.display_name, email: b.email, handle: b.handle, userId: b.user_id });
      return aLabel.localeCompare(bLabel, 'sv');
    });
    return members;
  }, [companyMemberOptionsQuery.data, currentUserId]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PROJECT_VIEW_MODE_KEY);
    if (stored === 'board' || stored === 'list') {
      setViewMode(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!cancelled) {
        setCurrentUserId(user?.id ?? null);
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchMenuRef.current?.contains(event.target as Node)) {
        setSearchMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSearchMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
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

  function toggleSelectedMember(userId: string) {
    setSelectedMemberIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  const projectFilters = (
    <div ref={searchMenuRef} className="relative min-w-0">
      <div className="relative">
        <Input
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
          onFocus={() => setSearchMenuOpen(true)}
          onClick={() => setSearchMenuOpen(true)}
          placeholder="Sök"
          className="h-8 min-w-0 rounded-2xl px-2.5 pr-9 text-xs sm:h-9 sm:px-3 sm:pr-10 sm:text-sm"
        />
        {projectSearch || searchMenuOpen ? (
          <button
            type="button"
            onClick={() => {
              if (projectSearch) {
                setProjectSearch('');
                return;
              }
              setSearchMenuOpen(false);
            }}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-foreground/55 transition hover:bg-muted hover:text-foreground"
            aria-label={projectSearch ? 'Rensa sökning' : 'Stäng sökfilter'}
            title={projectSearch ? 'Rensa sökning' : 'Stäng sökfilter'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {searchMenuOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl border border-border bg-background p-3 shadow-xl">
          <div className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-foreground/65">
              Söker på kund, projektnamn, status, ansvarig och tilldelade medlemmar.
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">Status</p>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              >
                {statusOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">Startdatum</p>
                <Input type="date" value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} className="h-9 rounded-xl text-sm" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">Slutdatum</p>
                <Input type="date" value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} className="h-9 rounded-xl text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">Medlemmar</p>
                <p className="mt-1 text-xs text-foreground/60">Välj vilka som ska finnas med i projektet.</p>
              </div>
              <div
                className={`gap-2 ${
                  filterMembers.length > 7
                    ? 'grid grid-cols-4 sm:grid-cols-7'
                    : 'grid grid-cols-[repeat(7,minmax(0,1fr))]'
                }`}
              >
                {filterMembers.map((member) => {
                  const isSelected = selectedMemberIds.includes(member.user_id);
                  const label = getUserDisplayName({
                    displayName: member.display_name,
                    email: member.email,
                    handle: member.handle,
                    userId: member.user_id
                  });

                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-center transition ${
                        isSelected ? 'bg-primary/8 text-foreground' : 'text-foreground/80 hover:bg-muted/40'
                      }`}
                      onClick={() => toggleSelectedMember(member.user_id)}
                      title={label}
                    >
                      <div className="relative">
                        <ProfileBadge
                          label={label}
                          color={member.color}
                          avatarUrl={member.avatar_url}
                          emoji={member.emoji}
                          className={`h-10 w-10 shrink-0 ring-2 transition ${isSelected ? 'ring-primary' : 'ring-transparent'}`}
                          textClassName="text-xs font-semibold text-white"
                        />
                        <span
                          className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background text-[10px] font-semibold ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/55'
                          }`}
                        >
                          {isSelected ? '✓' : '+'}
                        </span>
                      </div>
                      <span className="line-clamp-2 text-[10px] font-medium leading-tight">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-xl px-2 text-xs"
                onClick={() => {
                  setStatusFilter('all');
                  setSelectedMemberIds([]);
                  setStartDateFilter('');
                  setEndDateFilter('');
                }}
              >
                Rensa filter
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const mobileViewModeTrigger = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full sm:h-9 sm:w-9" aria-label="Välj visningsläge">
          {viewMode === 'board' ? <LayoutGrid className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeViewMode('board')}>
          <LayoutGrid className="mr-2 h-4 w-4" />
          Board
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeViewMode('list')}>
          <Rows3 className="mr-2 h-4 w-4" />
          Lista
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const desktopViewModeToggle = (
    <div className="inline-flex items-center rounded-full border border-border bg-muted/20 p-1">
      <button
        type="button"
        onClick={() => changeViewMode('board')}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
          viewMode === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
        }`}
        aria-label="Boardvy"
        title="Boardvy"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => changeViewMode('list')}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
          viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'
        }`}
        aria-label="Listvy"
        title="Listvy"
      >
        <Rows3 className="h-4 w-4" />
      </button>
    </div>
  );

  if (mode === 'mobile') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          {summaryToggle}
          {automationTrigger}
          {mobileViewModeTrigger}
          <SectionErrorBoundary title="Skapa projekt">
            <CreateProjectEntry companyId={companyId} mode="mobile" />
          </SectionErrorBoundary>
        </div>
        {projectFilters}
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
          {viewMode === 'board' ? (
            <ProjectBoardMobile companyId={companyId} searchTerm={projectSearch} statusFilter={statusFilter} currentUserId={currentUserId} selectedMemberIds={selectedMemberIds} startDateFilter={startDateFilter} endDateFilter={endDateFilter} />
          ) : (
            <ProjectListView companyId={companyId} searchTerm={projectSearch} statusFilter={statusFilter} currentUserId={currentUserId} selectedMemberIds={selectedMemberIds} startDateFilter={startDateFilter} endDateFilter={endDateFilter} />
          )}
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
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center justify-end gap-2">
          {automationTrigger}
          {summaryToggle}
          {desktopViewModeToggle}
          <SectionErrorBoundary title="Skapa projekt">
            <CreateProjectEntry companyId={companyId} mode="desktop" />
          </SectionErrorBoundary>
        </div>
      </div>
      {projectFilters}
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
        {viewMode === 'board' ? (
          <ProjectBoardDesktop companyId={companyId} searchTerm={projectSearch} statusFilter={statusFilter} currentUserId={currentUserId} selectedMemberIds={selectedMemberIds} startDateFilter={startDateFilter} endDateFilter={endDateFilter} />
        ) : (
          <ProjectListView companyId={companyId} searchTerm={projectSearch} statusFilter={statusFilter} currentUserId={currentUserId} selectedMemberIds={selectedMemberIds} startDateFilter={startDateFilter} endDateFilter={endDateFilter} />
        )}
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
