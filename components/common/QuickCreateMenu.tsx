'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Plus, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { useProjects } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import { getDesktopQuickCreateItems, getMobileQuickActions } from '@/lib/mobile/quickActions';
import type { Capability, Role } from '@/lib/types';

export default function QuickCreateMenu({
  role,
  capabilities,
  compact = false
}: {
  role: Role;
  capabilities: Capability[];
  compact?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { companyId } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();
  const mode = useBreakpointMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [updateContent, setUpdateContent] = useState('');
  const [submitting, setSubmitting] = useState<null | 'task' | 'update'>(null);
  const projectsQuery = useProjects(companyId);
  const desktopItems = getDesktopQuickCreateItems(role, capabilities);
  const mobileActions = getMobileQuickActions(role, capabilities, hasActiveTimer);
  const projectOptions = (projectsQuery.data ?? []).map((project) => ({
    value: project.id,
    label: project.title
  }));

  function resetTaskDialog() {
    setTaskDialogOpen(false);
    setSelectedProjectId('');
    setTaskTitle('');
    setTaskDescription('');
  }

  function resetUpdateDialog() {
    setUpdateDialogOpen(false);
    setSelectedProjectId('');
    setUpdateContent('');
  }

  function handleActionSelect(actionId: string, href?: Route) {
    if (actionId === 'time') {
      if (hasActiveTimer) openControlsDialog();
      else openStartDialog();
      return;
    }

    if (actionId === 'task') {
      setTaskDialogOpen(true);
      return;
    }

    if (actionId === 'update') {
      setUpdateDialogOpen(true);
      return;
    }

    if (href) {
      router.push(href);
    }
  }

  async function submitTask() {
    if (!selectedProjectId || !taskTitle.trim()) {
      toast.error('Välj projekt och ange en titel');
      return;
    }

    try {
      setSubmitting('task');
      const res = await fetch('/api/project-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          projectId: selectedProjectId,
          title: taskTitle.trim(),
          description: taskDescription.trim() || null
        })
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Kunde inte skapa uppgift');

      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['todo-project-tasks', companyId] });
      toast.success('Uppgift skapad');
      resetTaskDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa uppgift');
    } finally {
      setSubmitting(null);
    }
  }

  async function submitUpdate() {
    if (!selectedProjectId || !updateContent.trim()) {
      toast.error('Välj projekt och skriv en uppdatering');
      return;
    }

    try {
      setSubmitting('update');
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        throw new Error('Kunde inte identifiera användaren för uppdateringen.');
      }

      const { error } = await supabase.from('project_updates').insert({
        company_id: companyId,
        project_id: selectedProjectId,
        parent_id: null,
        created_by: user.id,
        content: updateContent.trim()
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-updates-activity', companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-activity-summaries', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['todo-project-watch', companyId] });
      toast.success('Uppdatering skapad');
      resetUpdateDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa uppdatering');
    } finally {
      setSubmitting(null);
    }
  }

  if (mode === 'mobile') {
    return (
      <>
        <Button
          variant="default"
          size={compact ? 'icon' : 'sm'}
          className={compact ? 'rounded-full' : 'gap-2 rounded-full pl-3 pr-4'}
          aria-label="Lägg till"
          onClick={() => setMobileOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {!compact ? <span>Lägg till</span> : null}
        </Button>

        <ActionSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Snabbåtgärder"
          description="Samma kärnåtgärder oavsett var du jobbar i mobilen."
        >
          <div className="grid grid-cols-2 gap-2">
            {mobileActions.map((item) => {
              const Icon = item.icon;
              const isTimeAction = item.id === 'time';

              if (isTimeAction) {
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-16 flex-col items-start gap-1 rounded-2xl px-3 py-3 text-left"
                    onClick={() => {
                      setMobileOpen(false);
                      if (hasActiveTimer) {
                        openControlsDialog();
                        return;
                      }
                      openStartDialog();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="whitespace-normal text-xs text-foreground/60">{item.description}</span>
                  </Button>
                );
              }

              return (
                <Button
                  key={item.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-16 flex-col items-start gap-1 rounded-2xl px-3 py-3 text-left"
                  onClick={() => {
                    setMobileOpen(false);
                    handleActionSelect(item.id, item.href as Route | undefined);
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="whitespace-normal text-xs text-foreground/60">{item.description}</span>
                  </div>
                </Button>
              );
            })}
          </div>
        </ActionSheet>

        <QuickCreateTaskDialog
          mobile
          open={taskDialogOpen}
          onClose={resetTaskDialog}
          projectOptions={projectOptions}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          taskTitle={taskTitle}
          setTaskTitle={setTaskTitle}
          taskDescription={taskDescription}
          setTaskDescription={setTaskDescription}
          onSubmit={submitTask}
          submitting={submitting === 'task'}
        />

        <QuickCreateUpdateDialog
          mobile
          open={updateDialogOpen}
          onClose={resetUpdateDialog}
          projectOptions={projectOptions}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          updateContent={updateContent}
          setUpdateContent={setUpdateContent}
          onSubmit={submitUpdate}
          submitting={submitting === 'update'}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            size={compact ? 'icon' : 'sm'}
            className={compact ? 'rounded-full' : 'gap-2 rounded-full pl-3 pr-4'}
            aria-label="Lägg till"
          >
            <Plus className="h-4 w-4" />
            {!compact ? <span>Lägg till</span> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          className="z-[1000] w-[220px]"
        >
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              openStartDialog();
            }}
          >
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              <span>Ny tidrapportering</span>
            </div>
          </DropdownMenuItem>
          {desktopItems.length === 0 ? (
            <div className="px-2 py-3 text-sm text-foreground/65">Inga genvägar tillgängliga.</div>
          ) : null}
          {desktopItems.map((item) => {
            const Icon = item.icon;
            if (item.href) {
              return (
                <DropdownMenuItem key={item.id} asChild>
                  <Link
                    href={item.href}
                    prefetch
                    onMouseEnter={() => router.prefetch(item.href)}
                    onTouchStart={() => router.prefetch(item.href)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuItem
                key={item.id}
                onSelect={(event) => {
                  event.preventDefault();
                  handleActionSelect(item.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <QuickCreateTaskDialog
        open={taskDialogOpen}
        onClose={resetTaskDialog}
        projectOptions={projectOptions}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        taskTitle={taskTitle}
        setTaskTitle={setTaskTitle}
        taskDescription={taskDescription}
        setTaskDescription={setTaskDescription}
        onSubmit={submitTask}
        submitting={submitting === 'task'}
      />

      <QuickCreateUpdateDialog
        open={updateDialogOpen}
        onClose={resetUpdateDialog}
        projectOptions={projectOptions}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        updateContent={updateContent}
        setUpdateContent={setUpdateContent}
        onSubmit={submitUpdate}
        submitting={submitting === 'update'}
      />
    </>
  );
}

function ProjectSelectField({
  projectOptions,
  selectedProjectId,
  setSelectedProjectId
}: {
  projectOptions: Array<{ value: string; label: string }>;
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Projekt</label>
      <select
        value={selectedProjectId}
        onChange={(event) => setSelectedProjectId(event.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none"
      >
        <option value="">Välj projekt</option>
        {projectOptions.map((project) => (
          <option key={project.value} value={project.value}>
            {project.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function QuickCreateTaskDialog({
  mobile = false,
  open,
  onClose,
  projectOptions,
  selectedProjectId,
  setSelectedProjectId,
  taskTitle,
  setTaskTitle,
  taskDescription,
  setTaskDescription,
  onSubmit,
  submitting
}: {
  mobile?: boolean;
  open: boolean;
  onClose: () => void;
  projectOptions: Array<{ value: string; label: string }>;
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDescription: string;
  setTaskDescription: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const content = (
    <div className="space-y-4">
      <ProjectSelectField
        projectOptions={projectOptions}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium">Titel</label>
        <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Vad ska göras?" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Beskrivning</label>
        <Textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Valfri beskrivning" rows={4} />
      </div>
      <Button type="button" onClick={onSubmit} disabled={submitting || projectOptions.length === 0} className="w-full">
        {submitting ? 'Skapar...' : 'Skapa uppgift'}
      </Button>
    </div>
  );

  if (mobile) {
    return (
      <ActionSheet open={open} onClose={onClose} title="Ny uppgift" description="Välj projekt och lägg till en uppgift direkt.">
        {content}
      </ActionSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny uppgift</DialogTitle>
          <DialogDescription>Välj projekt och lägg till en uppgift direkt.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function QuickCreateUpdateDialog({
  mobile = false,
  open,
  onClose,
  projectOptions,
  selectedProjectId,
  setSelectedProjectId,
  updateContent,
  setUpdateContent,
  onSubmit,
  submitting
}: {
  mobile?: boolean;
  open: boolean;
  onClose: () => void;
  projectOptions: Array<{ value: string; label: string }>;
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  updateContent: string;
  setUpdateContent: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const content = (
    <div className="space-y-4">
      <ProjectSelectField
        projectOptions={projectOptions}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium">Uppdatering</label>
        <Textarea value={updateContent} onChange={(event) => setUpdateContent(event.target.value)} placeholder="Skriv en projektuppdatering" rows={5} />
      </div>
      <Button type="button" onClick={onSubmit} disabled={submitting || projectOptions.length === 0} className="w-full">
        {submitting ? 'Sparar...' : 'Skapa uppdatering'}
      </Button>
    </div>
  );

  if (mobile) {
    return (
      <ActionSheet open={open} onClose={onClose} title="Ny uppdatering" description="Välj projekt och skriv uppdateringen direkt här.">
        {content}
      </ActionSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ny uppdatering</DialogTitle>
          <DialogDescription>Välj projekt och skriv uppdateringen direkt här.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
