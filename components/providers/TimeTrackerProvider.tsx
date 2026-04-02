'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Pause, Play, Square, Timer } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateProject, useProjectColumns, useProjects } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

type ProjectTaskRow = DbRow<'project_tasks'>;
type ProjectActiveTimerRow = DbRow<'project_active_timers'>;

type ActiveTimer = {
  companyId: string;
  projectId: string;
  projectTitle: string;
  taskId: string | null;
  taskTitle: string | null;
  startedAt: string;
  accumulatedMs: number;
  pausedAt: string | null;
  note: string | null;
};

type TimeTrackerContextValue = {
  openStartDialog: () => void;
  openControlsDialog: () => void;
  hasActiveTimer: boolean;
};

const TimeTrackerContext = createContext<TimeTrackerContextValue | null>(null);

const STORAGE_PREFIX = 'global_time_tracker_v1';
const NEW_PROJECT_VALUE = '__new_project__';
const NEW_TASK_VALUE = '__new_task__';
const NONE_TASK_VALUE = 'none';

function currentTimeValue() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getStorageKey(companyId: string) {
  return `${STORAGE_PREFIX}:${companyId}`;
}

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function buildElapsedMs(timer: ActiveTimer, now: number) {
  const startedAtMs = new Date(timer.startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return timer.accumulatedMs;
  if (timer.pausedAt) return timer.accumulatedMs;
  return timer.accumulatedMs + Math.max(0, now - startedAtMs);
}

function toActiveTimer(row: ProjectActiveTimerRow): ActiveTimer {
  return {
    companyId: row.company_id,
    projectId: row.project_id,
    projectTitle: row.project_title,
    taskId: row.task_id,
    taskTitle: row.task_title,
    startedAt: row.started_at,
    accumulatedMs: Number(row.accumulated_ms ?? 0),
    pausedAt: row.paused_at,
    note: row.note
  };
}

export function TimeTrackerProvider({ children }: { children: React.ReactNode }) {
  const { companyId } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const mode = useBreakpointMode();
  const [hydrated, setHydrated] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>(NONE_TASK_VALUE);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [timerNote, setTimerNote] = useState('');
  const [timerStartTime, setTimerStartTime] = useState(() => currentTimeValue());
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [localTimerSnapshot, setLocalTimerSnapshot] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const currentUserQuery = useQuery<string | null>({
    queryKey: ['current-user-auth-id', 'time-tracker'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();

      if (error) throw error;
      return user?.id ?? null;
    }
  });

  const projectsQuery = useProjects(companyId);
  const projectColumnsQuery = useProjectColumns(companyId);
  const createProjectMutation = useCreateProject(companyId);
  const activeTimerQuery = useQuery<ProjectActiveTimerRow | null>({
    queryKey: ['project-active-timer', companyId, currentUserQuery.data],
    enabled: hydrated && Boolean(currentUserQuery.data),
    staleTime: 1000 * 15,
    queryFn: async () => {
      const userId = currentUserQuery.data;
      if (!userId) return null;

      const { data, error } = await supabase
        .from('project_active_timers')
        .select('id,company_id,user_id,project_id,project_title,task_id,task_title,note,started_at,accumulated_ms,paused_at,created_at,updated_at')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .maybeSingle<ProjectActiveTimerRow>();

      if (error) throw error;
      return data ?? null;
    }
  });

  const tasksQuery = useQuery<ProjectTaskRow[]>({
    queryKey: ['global-time-tracker-tasks', companyId, selectedProjectId],
    enabled: Boolean(startDialogOpen && selectedProjectId && selectedProjectId !== NEW_PROJECT_VALUE),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,title,status,priority,project_id,company_id,created_at,updated_at,created_by,description,due_date,assignee_user_id,milestone_id,subtasks')
        .eq('company_id', companyId)
        .eq('project_id', selectedProjectId)
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .returns<ProjectTaskRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: async (timer: ActiveTimer) => {
      const userId = currentUserQuery.data;
      if (!userId) throw new Error('Kunde inte identifiera användaren');

      const elapsedMs = buildElapsedMs(timer, Date.now());
      const hours = Math.max(0.01, Math.round((elapsedMs / 3_600_000) * 100) / 100);
      const { error } = await supabase.from('project_time_entries').insert({
        company_id: timer.companyId,
        project_id: timer.projectId,
        task_id: timer.taskId,
        user_id: userId,
        entry_date: todayIso(),
        hours,
        note: timer.note?.trim() || null,
        is_billable: true,
        order_id: null
      });

      if (error) throw error;
      return { hours };
    },
    onSuccess: async (_, timer) => {
      await queryClient.invalidateQueries({ queryKey: ['project-time-entries', companyId, timer.projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-activity-summaries', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Tid rapporterad från timer');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara timer');
    }
  });

  const persistActiveTimerMutation = useMutation({
    mutationFn: async (timer: ActiveTimer) => {
      const userId = currentUserQuery.data;
      if (!userId) throw new Error('Kunde inte identifiera användaren');

      const { error } = await supabase.from('project_active_timers').upsert(
        {
          company_id: timer.companyId,
          user_id: userId,
          project_id: timer.projectId,
          project_title: timer.projectTitle,
          task_id: timer.taskId,
          task_title: timer.taskTitle,
          note: timer.note?.trim() || null,
          started_at: timer.startedAt,
          accumulated_ms: timer.accumulatedMs,
          paused_at: timer.pausedAt
        },
        { onConflict: 'company_id,user_id' }
      );

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-active-timer', companyId, currentUserQuery.data] });
    }
  });

  const clearActiveTimerMutation = useMutation({
    mutationFn: async () => {
      const userId = currentUserQuery.data;
      if (!userId) throw new Error('Kunde inte identifiera användaren');

      const { error } = await supabase
        .from('project_active_timers')
        .delete()
        .eq('company_id', companyId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-active-timer', companyId, currentUserQuery.data] });
    }
  });

  useEffect(() => {
    const raw = window.localStorage.getItem(getStorageKey(companyId));
    if (!raw) {
      setHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as ActiveTimer | null;
      if (parsed?.companyId === companyId) {
        setLocalTimerSnapshot(parsed);
      }
    } catch {
      window.localStorage.removeItem(getStorageKey(companyId));
    } finally {
      setHydrated(true);
    }
  }, [companyId]);

  useEffect(() => {
    if (!hydrated) return;
    const storageKey = getStorageKey(companyId);
    if (!activeTimer) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(activeTimer));
  }, [activeTimer, companyId, hydrated]);

  useEffect(() => {
    if (!hydrated || activeTimerQuery.isLoading) return;

    if (activeTimerQuery.data) {
      setActiveTimer(toActiveTimer(activeTimerQuery.data));
      return;
    }

    if (localTimerSnapshot?.companyId === companyId) {
      setActiveTimer(localTimerSnapshot);
      void persistActiveTimerMutation.mutateAsync(localTimerSnapshot).catch(() => null);
      return;
    }

    setActiveTimer(null);
  }, [activeTimerQuery.data, activeTimerQuery.isLoading, companyId, hydrated, localTimerSnapshot]);

  useEffect(() => {
    if (!activeTimer || activeTimer.pausedAt) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeTimer]);

  useEffect(() => {
    if (!startDialogOpen) return;
    if (!selectedProjectId) {
      setSelectedProjectId(projectsQuery.data?.[0]?.id ?? NEW_PROJECT_VALUE);
    }
    setTimerStartTime((current) => current || currentTimeValue());
  }, [projectsQuery.data, selectedProjectId, startDialogOpen]);

  const elapsedMs = activeTimer ? buildElapsedMs(activeTimer, now) : 0;
  const hasActiveTimer = Boolean(activeTimer);
  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((project) => project.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId]
  );
  const selectedTask = useMemo(
    () => (tasksQuery.data ?? []).find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasksQuery.data]
  );

  function openStartDialog() {
    setStartDialogOpen(true);
  }

  function openControlsDialog() {
    setControlsOpen(true);
  }

  function resetDraft() {
    setSelectedProjectId((projectsQuery.data ?? [])[0]?.id ?? NEW_PROJECT_VALUE);
    setSelectedTaskId(NONE_TASK_VALUE);
    setNewProjectTitle('');
    setNewTaskTitle('');
    setTimerNote('');
    setTimerStartTime(currentTimeValue());
  }

  async function handleStartTimer() {
    try {
      const currentUserId = currentUserQuery.data;
      if (!currentUserId) {
        toast.error('Kunde inte identifiera användaren');
        return;
      }

      let resolvedProjectId = selectedProjectId;
      let resolvedProjectTitle = selectedProject?.title ?? '';

      if (selectedProjectId === NEW_PROJECT_VALUE) {
        const defaultStatus = projectColumnsQuery.data?.[0]?.key ?? '';
        if (!defaultStatus) {
          toast.error('Det finns ingen projektkolumn att starta i');
          return;
        }
        if (!newProjectTitle.trim()) {
          toast.error('Ange projektnamn');
          return;
        }

        const result = await createProjectMutation.mutateAsync({
          title: newProjectTitle.trim(),
          status: defaultStatus,
          customer_id: null,
          customer_name: null,
          start_date: null,
          end_date: null,
          order_total: 0,
          responsible_user_id: currentUserId,
          member_ids: [currentUserId],
          source: 'ui'
        });

        resolvedProjectId = result?.project_id ?? '';
        resolvedProjectTitle = newProjectTitle.trim();
        if (!resolvedProjectId) {
          throw new Error('Projekt skapades inte korrekt');
        }
      }

      if (!resolvedProjectId) {
        toast.error('Välj projekt');
        return;
      }

      let resolvedTaskId: string | null = selectedTaskId === NONE_TASK_VALUE ? null : selectedTaskId;
      let resolvedTaskTitle: string | null = selectedTask?.title ?? null;

      if (selectedTaskId === NEW_TASK_VALUE) {
        if (!newTaskTitle.trim()) {
          toast.error('Ange uppgiftstitel');
          return;
        }

        const response = await fetch('/api/project-tasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            companyId,
            projectId: resolvedProjectId,
            title: newTaskTitle.trim(),
            assigneeUserId: currentUserId,
            memberUserIds: [currentUserId]
          })
        });

        const payload = (await response.json().catch(() => null)) as { error?: string; task?: { id: string; title: string } } | null;
        if (!response.ok || !payload?.task?.id) {
          throw new Error(payload?.error ?? 'Kunde inte skapa uppgift');
        }

        resolvedTaskId = payload.task.id;
        resolvedTaskTitle = payload.task.title;
        await queryClient.invalidateQueries({ queryKey: ['global-time-tracker-tasks', companyId, resolvedProjectId] });
        await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, resolvedProjectId] });
        await queryClient.invalidateQueries({ queryKey: ['project-time-tasks', companyId, resolvedProjectId] });
      }

      const [startHourRaw, startMinuteRaw] = timerStartTime.split(':', 2);
      const startHour = Number.parseInt(startHourRaw ?? '', 10);
      const startMinute = Number.parseInt(startMinuteRaw ?? '', 10);
      const startDate = new Date();

      if (Number.isFinite(startHour) && Number.isFinite(startMinute)) {
        startDate.setHours(startHour, startMinute, 0, 0);
      }

      const startedAt = startDate.toISOString();
      const nextTimer = {
        companyId,
        projectId: resolvedProjectId,
        projectTitle: resolvedProjectTitle,
        taskId: resolvedTaskId,
        taskTitle: resolvedTaskTitle,
        startedAt,
        accumulatedMs: 0,
        pausedAt: null,
        note: timerNote.trim() || null
      } satisfies ActiveTimer;

      await persistActiveTimerMutation.mutateAsync(nextTimer);
      setNow(Date.now());
      setLocalTimerSnapshot(nextTimer);
      setActiveTimer(nextTimer);
      setStartDialogOpen(false);
      resetDraft();
      toast.success('Tidrapportering startad');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte starta tidrapportering');
    }
  }

  async function handlePauseTimer() {
    if (!activeTimer || activeTimer.pausedAt) return;
    const nextTimer = {
      ...activeTimer,
      accumulatedMs: buildElapsedMs(activeTimer, Date.now()),
      pausedAt: new Date().toISOString()
    };
    await persistActiveTimerMutation.mutateAsync(nextTimer);
    setLocalTimerSnapshot(nextTimer);
    setActiveTimer(nextTimer);
    setControlsOpen(false);
  }

  async function handleResumeTimer() {
    if (!activeTimer || !activeTimer.pausedAt) return;
    const nextTimer = {
      ...activeTimer,
      startedAt: new Date().toISOString(),
      pausedAt: null
    };
    await persistActiveTimerMutation.mutateAsync(nextTimer);
    setLocalTimerSnapshot(nextTimer);
    setActiveTimer(nextTimer);
    setControlsOpen(false);
  }

  async function handleStopTimer() {
    if (!activeTimer) return;
    const timer = activeTimer;
    setControlsOpen(false);
    await createTimeEntryMutation.mutateAsync(timer);
    await clearActiveTimerMutation.mutateAsync();
    setLocalTimerSnapshot(null);
    setActiveTimer(null);
  }

  const compactStartLayout = mode === 'mobile';

  const startDialogBody = (
    <div className={compactStartLayout ? 'space-y-3' : 'space-y-4'}>
      <label className="block space-y-1">
        <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Projekt</span>
        <Select
          value={selectedProjectId}
          onValueChange={(value) => {
            setSelectedProjectId(value);
            setSelectedTaskId(NONE_TASK_VALUE);
            setNewTaskTitle('');
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Välj projekt" />
          </SelectTrigger>
          <SelectContent>
            {(projectsQuery.data ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
            <SelectItem value={NEW_PROJECT_VALUE}>+ Nytt projekt</SelectItem>
          </SelectContent>
        </Select>
      </label>

      {selectedProjectId === NEW_PROJECT_VALUE ? (
        <label className="block space-y-1">
          <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Nytt projekt</span>
          <Input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} placeholder="Projektnamn" />
        </label>
      ) : null}

      {selectedProjectId && selectedProjectId !== NEW_PROJECT_VALUE ? (
        <div className={compactStartLayout ? 'grid grid-cols-[minmax(0,1fr)_110px] gap-3' : 'space-y-4'}>
          <label className="block space-y-1">
            <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Uppgift</span>
            <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj uppgift" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_TASK_VALUE}>Ingen kopplad uppgift</SelectItem>
                {(tasksQuery.data ?? []).map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_TASK_VALUE}>+ Ny uppgift</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1">
            <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Starttid</span>
            <Input
              type="time"
              value={timerStartTime}
              onChange={(event) => setTimerStartTime(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {selectedTaskId === NEW_TASK_VALUE ? (
        <label className="block space-y-1">
          <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Ny uppgift</span>
          <Input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Uppgiftstitel" />
        </label>
      ) : null}

      {!selectedProjectId || selectedProjectId === NEW_PROJECT_VALUE ? (
        <label className="block space-y-1">
          <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Starttid</span>
          <Input
            type="time"
            value={timerStartTime}
            onChange={(event) => setTimerStartTime(event.target.value)}
          />
        </label>
      ) : null}

      <label className="block space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className={compactStartLayout ? 'text-xs' : 'text-sm'}>Anteckning</span>
          <span className="text-[11px] text-foreground/55">Tomt = start nu med aktuell tid</span>
        </div>
        <Textarea value={timerNote} onChange={(event) => setTimerNote(event.target.value)} placeholder="Valfritt" rows={compactStartLayout ? 2 : 3} />
      </label>

      <Button
        type="button"
        className="w-full"
        onClick={() => void handleStartTimer()}
        disabled={createProjectMutation.isPending || createTimeEntryMutation.isPending || persistActiveTimerMutation.isPending || hasActiveTimer}
      >
        Starta tidrapportering
      </Button>
    </div>
  );

  const controlsBody = activeTimer ? (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-muted/20 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-foreground/45">Aktiv timer</p>
        <p className="mt-2 text-base font-semibold">{activeTimer.projectTitle}</p>
        {activeTimer.taskTitle ? <p className="mt-1 text-sm text-foreground/65">{activeTimer.taskTitle}</p> : null}
        <p className="mt-3 font-mono text-2xl font-semibold">{formatElapsed(elapsedMs)}</p>
        <p className="mt-1 text-xs text-foreground/55">{activeTimer.pausedAt ? 'Pausad' : 'Pågår nu'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {activeTimer.pausedAt ? (
          <Button type="button" variant="outline" onClick={() => void handleResumeTimer()} disabled={persistActiveTimerMutation.isPending}>
            <Play className="mr-2 h-4 w-4" />
            Fortsätt
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => void handlePauseTimer()} disabled={persistActiveTimerMutation.isPending}>
            <Pause className="mr-2 h-4 w-4" />
            Pausa
          </Button>
        )}
        <Button type="button" variant="destructive" onClick={() => void handleStopTimer()} disabled={createTimeEntryMutation.isPending || clearActiveTimerMutation.isPending}>
          <Square className="mr-2 h-4 w-4" />
          Stoppa
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <TimeTrackerContext.Provider value={{ openStartDialog, openControlsDialog, hasActiveTimer }}>
      {children}

      {hasActiveTimer && activeTimer ? (
        <button
          type="button"
          onClick={() => setControlsOpen(true)}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-[140] flex min-w-[180px] items-center gap-3 rounded-full border border-primary/20 bg-card/95 px-3 py-2 text-left shadow-lg backdrop-blur transition hover:shadow-xl md:bottom-6"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Timer className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-[0.14em] text-foreground/45">
              {activeTimer.pausedAt ? 'Pausad timer' : 'Tidrapportering'}
            </p>
            <p className="truncate text-sm font-medium">{activeTimer.taskTitle ?? activeTimer.projectTitle}</p>
            <p className="font-mono text-sm text-foreground/70">{formatElapsed(elapsedMs)}</p>
          </div>
        </button>
      ) : null}

      {mode === 'mobile' ? (
        <>
          <ActionSheet
            open={startDialogOpen}
            onClose={() => {
              setStartDialogOpen(false);
              resetDraft();
            }}
            title="Ny tidrapportering"
            description="Välj projekt och uppgift, eller starta nytt direkt."
          >
            {startDialogBody}
          </ActionSheet>
          <ActionSheet open={controlsOpen} onClose={() => setControlsOpen(false)} title="Timer" description="Pausa eller stoppa tidrapporteringen.">
            {controlsBody}
          </ActionSheet>
        </>
      ) : (
        <>
          <Dialog
            open={startDialogOpen}
            onOpenChange={(nextOpen) => {
              setStartDialogOpen(nextOpen);
              if (!nextOpen) resetDraft();
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Ny tidrapportering</DialogTitle>
                <DialogDescription>Välj projekt och uppgift, eller starta nytt direkt.</DialogDescription>
              </DialogHeader>
              {startDialogBody}
            </DialogContent>
          </Dialog>
          <Dialog open={controlsOpen} onOpenChange={setControlsOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Timer</DialogTitle>
                <DialogDescription>Pausa eller stoppa tidrapporteringen.</DialogDescription>
              </DialogHeader>
              {controlsBody}
            </DialogContent>
          </Dialog>
        </>
      )}
    </TimeTrackerContext.Provider>
  );
}

export function useTimeTracker() {
  const context = useContext(TimeTrackerContext);
  if (!context) {
    throw new Error('useTimeTracker måste användas inom TimeTrackerProvider');
  }

  return context;
}
