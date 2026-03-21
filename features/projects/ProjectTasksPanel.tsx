'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Clock3, Link2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import type { Role } from '@/lib/types';
import type { ProjectMemberVisual } from './projectQueries';

type ProjectTaskRow = DbRow<'project_tasks'>;
type ProjectTaskSubtask = {
  id: string;
  title: string;
  completed: boolean;
};
type ProjectMilestoneOption = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
};

type TaskStatus = 'todo' | 'in_progress' | 'done';
type TaskPriority = 'low' | 'normal' | 'high';

function normalizeUserId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.user_id === 'string' && record.user_id.trim()) return record.user_id;
    if (typeof record.id === 'string' && record.id.trim()) return record.id;
  }
  return null;
}

function statusLabel(status: TaskStatus) {
  return (
    {
      todo: 'Att göra',
      in_progress: 'Pågår',
      done: 'Klar'
    } as const
  )[status];
}

function priorityLabel(priority: TaskPriority) {
  return (
    {
      low: 'Låg',
      normal: 'Normal',
      high: 'Hög'
    } as const
  )[priority];
}

function priorityTone(priority: TaskPriority) {
  return (
    {
      low: 'bg-muted text-foreground/75',
      normal: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
      high: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
    } as const
  )[priority];
}

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function canManageTasks(role: Role) {
  return role !== 'auditor';
}

function normalizeTaskSubtasks(value: ProjectTaskRow['subtasks']): ProjectTaskSubtask[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const completed = Boolean(record.completed);
      const id = typeof record.id === 'string' && record.id.trim() ? record.id : `subtask-${index}`;
      if (!title) return null;
      return { id, title, completed };
    })
    .filter((item): item is ProjectTaskSubtask => Boolean(item));
}

function serializeTaskSubtasks(subtasks: ProjectTaskSubtask[]) {
  return subtasks
    .map((subtask) => ({
      id: subtask.id,
      title: subtask.title.trim(),
      completed: Boolean(subtask.completed)
    }))
    .filter((subtask) => subtask.title);
}

function message(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

export default function ProjectTasksPanel({
  companyId,
  projectId,
  role,
  members,
  milestones
}: {
  companyId: string;
  projectId: string;
  role: Role;
  members: ProjectMemberVisual[];
  milestones: ProjectMilestoneOption[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState<string>('none');
  const [milestoneId, setMilestoneId] = useState<string>('none');
  const [subtasks, setSubtasks] = useState<ProjectTaskSubtask[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskDraftByTaskId, setSubtaskDraftByTaskId] = useState<Record<string, string>>({});
  const [view, setView] = useState<'list' | 'board'>('list');
  const [createOpen, setCreateOpen] = useState(false);
  const mode = useBreakpointMode();

  const currentUserQuery = useQuery<string | null>({
    queryKey: ['current-user-auth-id'],
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

  const tasksQuery = useQuery<ProjectTaskRow[]>({
    queryKey: ['project-tasks', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,company_id,project_id,title,description,status,priority,due_date,assignee_user_id,created_by,created_at,updated_at,milestone_id,subtasks')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('status', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .returns<ProjectTaskRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const normalizedMembers = useMemo(
    () =>
      members
        .map((member) => {
          const userId = normalizeUserId(member.user_id);
          if (!userId) return null;
          return { ...member, user_id: userId };
        })
        .filter((member): member is ProjectMemberVisual => Boolean(member)),
    [members]
  );
  const assigneeByUserId = useMemo(() => new Map(normalizedMembers.map((member) => [member.user_id, member])), [normalizedMembers]);
  const milestoneById = useMemo(() => new Map(milestones.map((milestone) => [milestone.id, milestone])), [milestones]);
  const tasks = tasksQuery.data ?? [];
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const overdueTasks = openTasks.filter((task) => task.due_date && task.due_date < todayIso());
  const myTasks = useMemo(
    () => {
      const currentUserId = normalizeUserId(currentUserQuery.data);
      return currentUserId ? tasks.filter((task) => task.assignee_user_id === currentUserId && task.status !== 'done') : [];
    },
    [currentUserQuery.data, tasks]
  );
  const boardColumns = useMemo(
    () => ({
      todo: openTasks.filter((task) => task.status === 'todo'),
      in_progress: openTasks.filter((task) => task.status === 'in_progress'),
      done: doneTasks
    }),
    [doneTasks, openTasks]
  );

  function addDraftSubtask() {
    const nextTitle = subtaskDraft.trim();
    if (!nextTitle) return;
    setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), title: nextTitle, completed: false }]);
    setSubtaskDraft('');
  }

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const nextTitle = title.trim();
      if (!nextTitle) throw new Error('Titel krävs');

      let currentUserId = normalizeUserId(currentUserQuery.data);
      if (!currentUserId) {
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        currentUserId = user?.id ?? null;
      }

      if (!currentUserId) throw new Error('Kunde inte identifiera användaren');

      const { error } = await supabase.from('project_tasks').insert({
        company_id: companyId,
        project_id: projectId,
        title: nextTitle,
        description: description.trim() || null,
        status: 'todo',
        priority,
        due_date: dueDate || null,
        assignee_user_id: assigneeUserId === 'none' ? null : normalizeUserId(assigneeUserId),
        milestone_id: milestoneId === 'none' ? null : milestoneId,
        subtasks: serializeTaskSubtasks(subtasks),
        created_by: currentUserId
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      setPriority('normal');
      setDueDate('');
      setAssigneeUserId('none');
      setMilestoneId('none');
      setSubtasks([]);
      setSubtaskDraft('');
      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, projectId] });
      toast.success('Uppgift skapad');
    },
    onError: (error) => {
      toast.error(message(error, 'Kunde inte skapa uppgift'));
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      patch
    }: {
      taskId: string;
      patch: Partial<Pick<ProjectTaskRow, 'status' | 'priority' | 'due_date' | 'assignee_user_id' | 'milestone_id' | 'subtasks'>>;
    }) => {
      const { error } = await supabase.from('project_tasks').update(patch).eq('company_id', companyId).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, projectId] });
    },
    onError: (error) => {
      toast.error(message(error, 'Kunde inte uppdatera uppgift'));
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('project_tasks').delete().eq('company_id', companyId).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, projectId] });
      toast.success('Uppgift borttagen');
    },
    onError: (error) => {
      toast.error(message(error, 'Kunde inte ta bort uppgift'));
    }
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Öppna uppgifter</p>
          <p className="mt-1 font-medium">{openTasks.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Försenade</p>
          <p className="mt-1 font-medium">{overdueTasks.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Klara</p>
          <p className="mt-1 font-medium">{doneTasks.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Tilldelade medlemmar</p>
          <p className="mt-1 font-medium">{members.length}</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-sm font-medium">Visa uppgifter</p>
            <p className="text-xs text-foreground/60">Byt mellan lista och enkel board-vy.</p>
          </div>
          <div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`rounded-full px-3 py-1.5 text-sm transition ${view === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className={`rounded-full px-3 py-1.5 text-sm transition ${view === 'board' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
            >
              Board
            </button>
          </div>
        </CardContent>
      </Card>

      {currentUserQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle>Mina uppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myTasks.length === 0 ? <p className="text-sm text-foreground/65">Du har inga öppna uppgifter i projektet just nu.</p> : null}
            {myTasks.slice(0, 4).map((task) => (
              <div key={`mine-${task.id}`} className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{task.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={priorityTone(task.priority as TaskPriority)}>{priorityLabel(task.priority as TaskPriority)}</Badge>
                    <Badge>{statusLabel(task.status as TaskStatus)}</Badge>
                  </div>
                </div>
                {task.due_date ? (
                  <p className="mt-1 text-xs text-foreground/60">Deadline {new Date(task.due_date).toLocaleDateString('sv-SE')}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canManageTasks(role) ? (
        mode === 'mobile' ? (
          <>
            <Button type="button" className="w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ny uppgift
            </Button>
            <ActionSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Ny uppgift" description="Lägg till uppgift, ansvarig och checklista">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Titel</span>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Vad behöver göras?" />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Beskrivning</span>
                    <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Valfri beskrivning eller nästa steg" rows={3} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm">Prioritet</span>
                    <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Låg</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Hög</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm">Deadline</span>
                    <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Ansvarig</span>
                    <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                      <SelectTrigger><SelectValue placeholder="Välj medlem" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen ansvarig ännu</SelectItem>
                        {normalizedMembers.map((member) => (
                          <SelectItem key={member.id} value={member.user_id}>
                            {getUserDisplayName({
                              displayName: member.display_name,
                              email: member.email,
                              handle: member.handle,
                              userId: member.user_id
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Koppla till delmål</span>
                    <Select value={milestoneId} onValueChange={setMilestoneId}>
                      <SelectTrigger><SelectValue placeholder="Välj delmål" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Inget delmål</SelectItem>
                        {milestones.map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id}>
                            {milestone.title || 'Namnlöst delmål'}{milestone.date ? ` • ${milestone.date}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Checklista</p>
                      <p className="text-xs text-foreground/60">Bryt ner uppgiften i mindre steg.</p>
                    </div>
                    <Badge>{subtasks.length} delsteg</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={subtaskDraft}
                      onChange={(event) => setSubtaskDraft(event.target.value)}
                      placeholder="Lägg till delsteg"
                      className="min-w-[220px] flex-1"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addDraftSubtask();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addDraftSubtask}>Lägg till delsteg</Button>
                  </div>
                  {subtasks.length > 0 ? (
                    <div className="space-y-2">
                      {subtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left"
                            onClick={() =>
                              setSubtasks((prev) => prev.map((item) => (item.id === subtask.id ? { ...item, completed: !item.completed } : item)))
                            }
                          >
                            {subtask.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-foreground/45" />}
                            <span className={`truncate text-sm ${subtask.completed ? 'text-foreground/50 line-through' : 'text-foreground'}`}>{subtask.title}</span>
                          </button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSubtasks((prev) => prev.filter((item) => item.id !== subtask.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => createTaskMutation.mutate(undefined, { onSuccess: () => setCreateOpen(false) })}
                  disabled={createTaskMutation.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createTaskMutation.isPending ? 'Skapar...' : 'Lägg till uppgift'}
                </Button>
              </div>
            </ActionSheet>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Ny uppgift</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Titel</span>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Vad behöver göras?" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Beskrivning</span>
                <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Valfri beskrivning eller nästa steg" rows={3} />
              </label>
              <label className="space-y-1">
                <span className="text-sm">Prioritet</span>
                <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Låg</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Hög</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm">Deadline</span>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Ansvarig</span>
                <Select value={assigneeUserId} onValueChange={setAssigneeUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj medlem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen ansvarig ännu</SelectItem>
                        {normalizedMembers.map((member) => (
                          <SelectItem key={member.id} value={member.user_id}>
                            {getUserDisplayName({
                              displayName: member.display_name,
                              email: member.email,
                              handle: member.handle,
                              userId: member.user_id
                            })}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Koppla till delmål</span>
                <Select value={milestoneId} onValueChange={setMilestoneId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj delmål" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Inget delmål</SelectItem>
                    {milestones.map((milestone) => (
                      <SelectItem key={milestone.id} value={milestone.id}>
                        {milestone.title || 'Namnlöst delmål'}{milestone.date ? ` • ${milestone.date}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Checklista</p>
                  <p className="text-xs text-foreground/60">Bryt ner uppgiften i mindre steg.</p>
                </div>
                <Badge>{subtasks.length} delsteg</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={subtaskDraft}
                  onChange={(event) => setSubtaskDraft(event.target.value)}
                  placeholder="Lägg till delsteg"
                  className="min-w-[220px] flex-1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addDraftSubtask();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addDraftSubtask}>
                  Lägg till delsteg
                </Button>
              </div>
              {subtasks.length > 0 ? (
                <div className="space-y-2">
                  {subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left"
                        onClick={() =>
                          setSubtasks((prev) =>
                            prev.map((item) => (item.id === subtask.id ? { ...item, completed: !item.completed } : item))
                          )
                        }
                      >
                        {subtask.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-foreground/45" />}
                        <span className={`truncate text-sm ${subtask.completed ? 'text-foreground/50 line-through' : 'text-foreground'}`}>{subtask.title}</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSubtasks((prev) => prev.filter((item) => item.id !== subtask.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <Button type="button" onClick={() => createTaskMutation.mutate()} disabled={createTaskMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createTaskMutation.isPending ? 'Skapar...' : 'Lägg till uppgift'}
            </Button>
          </CardContent>
          </Card>
        )
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{view === 'board' ? 'Board' : 'Aktiva uppgifter'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasksQuery.isLoading ? <p className="text-sm text-foreground/65">Laddar uppgifter...</p> : null}
          {!tasksQuery.isLoading && view === 'list' && openTasks.length === 0 ? <p className="text-sm text-foreground/65">Inga uppgifter ännu.</p> : null}

          {view === 'board' ? (
            <div className={mode === 'mobile' ? 'flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory' : 'grid gap-3 xl:grid-cols-3'}>
              {(['todo', 'in_progress', 'done'] as const).map((column) => (
                <div key={column} className={`space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-3 ${mode === 'mobile' ? 'w-[86vw] shrink-0 snap-start' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{statusLabel(column)}</p>
                      <p className="text-xs text-foreground/60">{boardColumns[column].length} uppgifter</p>
                    </div>
                    <Badge>{boardColumns[column].length}</Badge>
                  </div>
                  {boardColumns[column].length === 0 ? <p className="text-sm text-foreground/55">Tom kolumn.</p> : null}
                  {boardColumns[column].map((task) => {
                    const assignee = task.assignee_user_id ? assigneeByUserId.get(task.assignee_user_id) ?? null : null;
                    const isOverdue = Boolean(task.due_date && task.due_date < todayIso() && task.status !== 'done');
                    const linkedMilestone = task.milestone_id ? milestoneById.get(task.milestone_id) ?? null : null;
                    const taskSubtasks = normalizeTaskSubtasks(task.subtasks);
                    const completedSubtasks = taskSubtasks.filter((subtask) => subtask.completed).length;

                    return (
                      <div
                        key={`board-${task.id}`}
                        className={`rounded-xl border p-3 ${isOverdue ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10' : 'border-border bg-background'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{task.title}</p>
                          <Badge className={priorityTone(task.priority as TaskPriority)}>{priorityLabel(task.priority as TaskPriority)}</Badge>
                        </div>
                        {task.description ? <p className="mt-1 text-sm text-foreground/70">{task.description}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {task.due_date ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                              <Clock3 className="h-3.5 w-3.5" />
                              {new Date(task.due_date).toLocaleDateString('sv-SE')}
                            </span>
                          ) : null}
                          {linkedMilestone ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                              <Link2 className="h-3.5 w-3.5" />
                              <span className="max-w-[140px] truncate">{linkedMilestone.title || 'Kopplat delmål'}</span>
                            </span>
                          ) : null}
                          {taskSubtasks.length > 0 ? <Badge>{completedSubtasks}/{taskSubtasks.length} delsteg</Badge> : null}
                        </div>
                        {assignee ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs">
                            <ProfileBadge
                              label={assignee.display_name ?? assignee.email ?? assignee.user_id}
                              color={assignee.color}
                              avatarUrl={assignee.avatar_url}
                              emoji={assignee.emoji}
                              className="h-5 w-5 shrink-0"
                              textClassName="text-[9px] font-semibold text-white"
                            />
                            <span className="max-w-[140px] truncate">
                              {getUserDisplayName({
                                displayName: assignee.display_name,
                                email: assignee.email,
                                handle: assignee.handle,
                                userId: assignee.user_id
                              })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <>
          {openTasks.map((task) => {
            const assignee = task.assignee_user_id ? assigneeByUserId.get(task.assignee_user_id) ?? null : null;
            const isOverdue = Boolean(task.due_date && task.due_date < todayIso());
            const linkedMilestone = task.milestone_id ? milestoneById.get(task.milestone_id) ?? null : null;
            const taskSubtasks = normalizeTaskSubtasks(task.subtasks);
            const completedSubtasks = taskSubtasks.filter((subtask) => subtask.completed).length;
            const taskSubtaskDraft = subtaskDraftByTaskId[task.id] ?? '';

            return (
              <div
                key={task.id}
                className={`rounded-xl border p-3 ${isOverdue ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10' : 'border-border bg-background'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{task.title}</p>
                    {task.description ? <p className="mt-1 text-sm text-foreground/70">{task.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={priorityTone(task.priority as TaskPriority)}>{priorityLabel(task.priority as TaskPriority)}</Badge>
                    {canManageTasks(role) ? (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteTaskMutation.mutate(task.id)} disabled={deleteTaskMutation.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge>{statusLabel(task.status as TaskStatus)}</Badge>
                  {task.due_date ? (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isOverdue ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200' : 'bg-muted text-foreground/70'}`}>
                      <Clock3 className="h-3.5 w-3.5" />
                      {new Date(task.due_date).toLocaleDateString('sv-SE')}
                    </span>
                  ) : null}
                  {assignee ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-xs">
                      <ProfileBadge
                        label={assignee.display_name ?? assignee.email ?? assignee.user_id}
                        color={assignee.color}
                        avatarUrl={assignee.avatar_url}
                        emoji={assignee.emoji}
                        className="h-5 w-5 shrink-0"
                        textClassName="text-[9px] font-semibold text-white"
                      />
                      <span className="max-w-[140px] truncate">
                        {getUserDisplayName({
                          displayName: assignee.display_name,
                          email: assignee.email,
                          handle: assignee.handle,
                          userId: assignee.user_id
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                      <Circle className="h-3.5 w-3.5" />
                      Ej tilldelad
                    </span>
                  )}
                  {linkedMilestone ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="max-w-[160px] truncate">{linkedMilestone.title || 'Kopplat delmål'}</span>
                    </span>
                  ) : null}
                  {taskSubtasks.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {completedSubtasks}/{taskSubtasks.length} delsteg
                    </span>
                  ) : null}
                </div>

                {taskSubtasks.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                    {taskSubtasks.map((subtask) => (
                      <div key={subtask.id} className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-2 text-left"
                          onClick={() =>
                            updateTaskMutation.mutate({
                              taskId: task.id,
                              patch: {
                                subtasks: serializeTaskSubtasks(
                                  taskSubtasks.map((item) => (item.id === subtask.id ? { ...item, completed: !item.completed } : item))
                                )
                              }
                            })
                          }
                        >
                          {subtask.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> : <Circle className="h-4 w-4 text-foreground/45" />}
                          <span className={`text-sm ${subtask.completed ? 'text-foreground/50 line-through' : 'text-foreground/80'}`}>{subtask.title}</span>
                        </button>
                        {canManageTasks(role) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              updateTaskMutation.mutate({
                                taskId: task.id,
                                patch: { subtasks: serializeTaskSubtasks(taskSubtasks.filter((item) => item.id !== subtask.id)) }
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {canManageTasks(role) ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Input
                          value={taskSubtaskDraft}
                          onChange={(event) =>
                            setSubtaskDraftByTaskId((prev) => ({
                              ...prev,
                              [task.id]: event.target.value
                            }))
                          }
                          placeholder="Lägg till delsteg på uppgiften"
                          className="min-w-[220px] flex-1"
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            const nextTitle = taskSubtaskDraft.trim();
                            if (!nextTitle) return;
                            updateTaskMutation.mutate({
                              taskId: task.id,
                              patch: {
                                subtasks: serializeTaskSubtasks([
                                  ...taskSubtasks,
                                  { id: crypto.randomUUID(), title: nextTitle, completed: false }
                                ])
                              }
                            });
                            setSubtaskDraftByTaskId((prev) => ({ ...prev, [task.id]: '' }));
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const nextTitle = taskSubtaskDraft.trim();
                            if (!nextTitle) return;
                            updateTaskMutation.mutate({
                              taskId: task.id,
                              patch: {
                                subtasks: serializeTaskSubtasks([
                                  ...taskSubtasks,
                                  { id: crypto.randomUUID(), title: nextTitle, completed: false }
                                ])
                              }
                            });
                            setSubtaskDraftByTaskId((prev) => ({ ...prev, [task.id]: '' }));
                          }}
                        >
                          Lägg till delsteg
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {canManageTasks(role) ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <Select
                      value={task.status}
                      onValueChange={(value) => updateTaskMutation.mutate({ taskId: task.id, patch: { status: value as TaskStatus } })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">Att göra</SelectItem>
                        <SelectItem value="in_progress">Pågår</SelectItem>
                        <SelectItem value="done">Klar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.priority}
                      onValueChange={(value) => updateTaskMutation.mutate({ taskId: task.id, patch: { priority: value as TaskPriority } })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Låg</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Hög</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.assignee_user_id ?? 'none'}
                      onValueChange={(value) =>
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          patch: { assignee_user_id: value === 'none' ? null : normalizeUserId(value) }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen ansvarig</SelectItem>
                        {normalizedMembers.map((member) => (
                          <SelectItem key={member.id} value={member.user_id}>
                            {getUserDisplayName({
                              displayName: member.display_name,
                              email: member.email,
                              handle: member.handle,
                              userId: member.user_id
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={task.milestone_id ?? 'none'}
                      onValueChange={(value) =>
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          patch: { milestone_id: value === 'none' ? null : value }
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Inget delmål</SelectItem>
                        {milestones.map((milestone) => (
                          <SelectItem key={milestone.id} value={milestone.id}>
                            {milestone.title || 'Namnlöst delmål'}{milestone.date ? ` • ${milestone.date}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            );
          })}
            </>
          )}
        </CardContent>
      </Card>

      {view === 'list' && doneTasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Klara uppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doneTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                    <p className="truncate font-medium">{task.title}</p>
                  </div>
                  {task.description ? <p className="mt-1 text-foreground/65">{task.description}</p> : null}
                </div>
                {task.due_date ? <span className="shrink-0 text-xs text-foreground/55">{new Date(task.due_date).toLocaleDateString('sv-SE')}</span> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
