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
import SimpleSelect from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import type { Role } from '@/lib/types';
import type { ProjectMemberVisual } from './projectQueries';

type ProjectTaskRow = DbRow<'project_tasks'>;
type ProjectTaskMemberRow = DbRow<'project_task_members'>;
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
type TaskVisibleMemberBadge = ProjectMemberVisual & {
  label: string;
  isResponsible?: boolean;
};

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

function buildTaskVisibleMemberBadges(assignee: ProjectMemberVisual | null, taskMembers: ProjectMemberVisual[]) {
  const ordered: TaskVisibleMemberBadge[] = [];
  const seenUserIds = new Set<string>();

  if (assignee) {
    ordered.push({
      ...assignee,
      label: getUserDisplayName({
        displayName: assignee.display_name,
        email: assignee.email,
        handle: assignee.handle,
        userId: assignee.user_id
      }),
      isResponsible: true
    });
    seenUserIds.add(assignee.user_id);
  }

  for (const member of taskMembers) {
    if (seenUserIds.has(member.user_id)) continue;
    ordered.push({
      ...member,
      label: getUserDisplayName({
        displayName: member.display_name,
        email: member.email,
        handle: member.handle,
        userId: member.user_id
      })
    });
    seenUserIds.add(member.user_id);
  }

  return ordered;
}

function TaskMemberBadges({
  members,
  activeMemberKey,
  onToggle
}: {
  members: TaskVisibleMemberBadge[];
  activeMemberKey: string | null;
  onToggle: (key: string) => void;
}) {
  if (members.length === 0) return null;

  return (
    <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
      {members.map((member) => {
        const key = `${member.id}-${member.user_id}`;
        const tooltipLabel = member.isResponsible ? `Ansvarig: ${member.label}` : member.label;
        const isActive = activeMemberKey === key;

        return (
          <div key={key} className="group/member relative">
            <button
              type="button"
              className="rounded-full"
              aria-label={tooltipLabel}
              title={tooltipLabel}
              onClick={() => onToggle(key)}
            >
              <ProfileBadge
                label={member.label}
                color={member.color}
                avatarUrl={member.avatar_url}
                emoji={member.emoji}
                className={`h-7 w-7 border shadow-sm transition group-hover/member:scale-[1.03] ${
                  member.isResponsible ? 'border-primary ring-2 ring-primary/25' : 'border-background'
                }`}
                textClassName="text-[10px] font-semibold text-white"
              />
            </button>
            <div
              className={`pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-foreground shadow-md transition ${
                isActive
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-0 group-hover/member:translate-y-0 group-hover/member:opacity-100 group-focus-within/member:translate-y-0 group-focus-within/member:opacity-100'
              }`}
            >
              {tooltipLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskMemberPicker({
  members,
  selectedUserIds,
  onChange
}: {
  members: ProjectMemberVisual[];
  selectedUserIds: string[];
  onChange: (nextUserIds: string[]) => void;
}) {
  const selectedUserIdSet = new Set(selectedUserIds);

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-foreground/60">Välj en eller flera medlemmar som ska vara kopplade till uppgiften.</p>
        <Badge>{selectedUserIds.length} valda</Badge>
      </div>
      <div className="flex flex-wrap gap-3">
        {members.map((member) => {
          const selected = selectedUserIdSet.has(member.user_id);
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
              className={`flex w-[72px] flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center transition ${
                selected ? 'bg-primary/8 text-foreground' : 'text-foreground/80 hover:bg-muted/40'
              }`}
              onClick={() => {
                const next = new Set(selectedUserIds);
                if (selected) next.delete(member.user_id);
                else next.add(member.user_id);
                onChange(Array.from(next));
              }}
              title={label}
            >
              <div className="relative">
                <ProfileBadge
                  label={label}
                  color={member.color}
                  avatarUrl={member.avatar_url}
                  emoji={member.emoji}
                  className={`h-11 w-11 shrink-0 ring-2 transition ${
                    selected ? 'ring-primary' : 'ring-transparent'
                  }`}
                  textClassName="text-xs font-semibold text-white"
                />
                <span
                  className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background text-[10px] font-semibold ${
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/55'
                  }`}
                >
                  {selected ? '✓' : '+'}
                </span>
              </div>
              <span className="line-clamp-2 text-[11px] font-medium leading-tight">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const [memberUserIds, setMemberUserIds] = useState<string[]>([]);
  const [milestoneId, setMilestoneId] = useState<string>('none');
  const [subtasks, setSubtasks] = useState<ProjectTaskSubtask[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtaskDraftByTaskId, setSubtaskDraftByTaskId] = useState<Record<string, string>>({});
  const [view, setView] = useState<'list' | 'board'>('list');
  const [mobileScope, setMobileScope] = useState<'mine' | 'overdue' | 'all'>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTaskMemberKey, setActiveTaskMemberKey] = useState<string | null>(null);
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
  const taskMembersQuery = useQuery<ProjectTaskMemberRow[]>({
    queryKey: ['project-task-members', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_task_members')
        .select('id,company_id,project_id,task_id,user_id,created_by,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .returns<ProjectTaskMemberRow[]>();

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
  const taskMemberUserIdsByTaskId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of taskMembersQuery.data ?? []) {
      const current = map.get(assignment.task_id) ?? [];
      current.push(assignment.user_id);
      map.set(assignment.task_id, current);
    }
    return map;
  }, [taskMembersQuery.data]);
  const milestoneById = useMemo(() => new Map(milestones.map((milestone) => [milestone.id, milestone])), [milestones]);
  const tasks = tasksQuery.data ?? [];
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const overdueTasks = openTasks.filter((task) => task.due_date && task.due_date < todayIso());
  const myTasks = useMemo(
    () => {
      const currentUserId = normalizeUserId(currentUserQuery.data);
      return currentUserId
        ? tasks.filter((task) => {
            const taskMemberUserIds = taskMemberUserIdsByTaskId.get(task.id) ?? [];
            return (task.assignee_user_id === currentUserId || taskMemberUserIds.includes(currentUserId)) && task.status !== 'done';
          })
        : [];
    },
    [currentUserQuery.data, taskMemberUserIdsByTaskId, tasks]
  );
  const boardColumns = useMemo(
    () => ({
      todo: openTasks.filter((task) => task.status === 'todo'),
      in_progress: openTasks.filter((task) => task.status === 'in_progress'),
      done: doneTasks
    }),
    [doneTasks, openTasks]
  );
  const visibleOpenTasks = useMemo(() => {
    if (mode !== 'mobile') return openTasks;
    if (mobileScope === 'mine') return myTasks;
    if (mobileScope === 'overdue') return overdueTasks;
    return openTasks;
  }, [mobileScope, mode, myTasks, openTasks, overdueTasks]);
  const visibleDoneTasks = useMemo(() => {
    if (mode !== 'mobile' || mobileScope === 'all') return doneTasks;
    return [];
  }, [doneTasks, mobileScope, mode]);

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
      const res = await fetch('/api/project-tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId,
          projectId,
          title: nextTitle,
          description: description.trim() || null,
          priority,
          dueDate: dueDate || null,
          assigneeUserId: assigneeUserId === 'none' ? null : normalizeUserId(assigneeUserId),
          memberUserIds,
          milestoneId: milestoneId === 'none' ? null : milestoneId,
          subtasks: serializeTaskSubtasks(subtasks)
        })
      });

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Kunde inte skapa uppgift');
    },
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      setPriority('normal');
      setDueDate('');
      setAssigneeUserId('none');
      setMemberUserIds([]);
      setMilestoneId('none');
      setSubtasks([]);
      setSubtaskDraft('');
      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-task-members', companyId, projectId] });
      toast.success('Uppgift skapad');
    },
    onError: (error) => {
      toast.error(message(error, 'Kunde inte skapa uppgift'));
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      patch,
      memberUserIds
    }: {
      taskId: string;
      patch: Partial<Pick<ProjectTaskRow, 'status' | 'priority' | 'due_date' | 'assignee_user_id' | 'milestone_id' | 'subtasks'>>;
      memberUserIds?: string[];
    }) => {
      const res = await fetch('/api/project-tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, taskId, patch, memberUserIds })
      });
      const body = (await res.json().catch(() => null)) as { error?: string; taskMembers?: ProjectTaskMemberRow[] } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Kunde inte uppdatera uppgift');
      return { body, taskId, memberUserIds };
    },
    onSuccess: async ({ body, taskId, memberUserIds }) => {
      const nextTaskMembers = Array.isArray(body?.taskMembers) ? body.taskMembers : null;
      if (Array.isArray(memberUserIds) && nextTaskMembers) {
        queryClient.setQueryData<ProjectTaskMemberRow[]>(['project-task-members', companyId, projectId], (current) => {
          const rest = (current ?? []).filter((assignment) => assignment.task_id !== taskId);
          return [...rest, ...nextTaskMembers];
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['project-tasks', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-task-members', companyId, projectId] });
      if (Array.isArray(memberUserIds)) {
        toast.success('Uppgiftsmedlemmar uppdaterade');
      }
    },
    onError: (error) => {
      toast.error(message(error, 'Kunde inte uppdatera uppgift'));
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/project-tasks?companyId=${companyId}&taskId=${taskId}`, {
        method: 'DELETE'
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Kunde inte ta bort uppgift');
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
      {mode === 'mobile' ? (
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Uppgifter</p>
                <p className="text-xs text-foreground/60">Fokusera på det som är ditt eller kräver uppmärksamhet nu.</p>
              </div>
              <Badge>{visibleOpenTasks.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMobileScope('mine')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${mobileScope === 'mine' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'}`}
              >
                Mina {myTasks.length}
              </button>
              <button
                type="button"
                onClick={() => setMobileScope('overdue')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${mobileScope === 'overdue' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'}`}
              >
                Försenade {overdueTasks.length}
              </button>
              <button
                type="button"
                onClick={() => setMobileScope('all')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${mobileScope === 'all' ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'}`}
              >
                Alla {openTasks.length}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border/70 bg-muted/10 px-2 py-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Öppna</p>
                <p className="mt-1 text-sm font-semibold">{openTasks.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/10 px-2 py-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Försenade</p>
                <p className="mt-1 text-sm font-semibold">{overdueTasks.length}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/10 px-2 py-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">Klara</p>
                <p className="mt-1 text-sm font-semibold">{doneTasks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
      )}

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
              <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
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
                    <SimpleSelect
                      value={priority}
                      onValueChange={(value) => setPriority(value as TaskPriority)}
                      options={[
                        { value: 'low', label: 'Låg' },
                        { value: 'normal', label: 'Normal' },
                        { value: 'high', label: 'Hög' }
                      ]}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm">Deadline</span>
                    <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Ansvarig</span>
                    <SimpleSelect
                      value={assigneeUserId}
                      onValueChange={setAssigneeUserId}
                      options={[
                        { value: 'none', label: 'Ingen ansvarig ännu' },
                        ...normalizedMembers.map((member) => ({
                          value: member.user_id,
                          label: getUserDisplayName({
                            displayName: member.display_name,
                            email: member.email,
                            handle: member.handle,
                            userId: member.user_id
                          })
                        }))
                      ]}
                    />
                  </label>
                  <div className="space-y-2 md:col-span-2">
                    <span className="text-sm">Medlemmar på uppgiften</span>
                    <TaskMemberPicker members={normalizedMembers} selectedUserIds={memberUserIds} onChange={setMemberUserIds} />
                  </div>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Koppla till delmål</span>
                    <SimpleSelect
                      value={milestoneId}
                      onValueChange={setMilestoneId}
                      options={[
                        { value: 'none', label: 'Inget delmål' },
                        ...milestones.map((milestone) => ({
                          value: milestone.id,
                          label: `${milestone.title || 'Namnlöst delmål'}${milestone.date ? ` • ${milestone.date}` : ''}`
                        }))
                      ]}
                    />
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
                <SimpleSelect
                  value={priority}
                  onValueChange={(value) => setPriority(value as TaskPriority)}
                  options={[
                    { value: 'low', label: 'Låg' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'high', label: 'Hög' }
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm">Deadline</span>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Ansvarig</span>
                <SimpleSelect
                  value={assigneeUserId}
                  onValueChange={setAssigneeUserId}
                  options={[
                    { value: 'none', label: 'Ingen ansvarig ännu' },
                    ...normalizedMembers.map((member) => ({
                      value: member.user_id,
                      label: getUserDisplayName({
                        displayName: member.display_name,
                        email: member.email,
                        handle: member.handle,
                        userId: member.user_id
                      })
                    }))
                  ]}
                />
              </label>
              <div className="space-y-2 md:col-span-2">
                <span className="text-sm">Medlemmar på uppgiften</span>
                <TaskMemberPicker members={normalizedMembers} selectedUserIds={memberUserIds} onChange={setMemberUserIds} />
              </div>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Koppla till delmål</span>
                <SimpleSelect
                  value={milestoneId}
                  onValueChange={setMilestoneId}
                  options={[
                    { value: 'none', label: 'Inget delmål' },
                    ...milestones.map((milestone) => ({
                      value: milestone.id,
                      label: `${milestone.title || 'Namnlöst delmål'}${milestone.date ? ` • ${milestone.date}` : ''}`
                    }))
                  ]}
                />
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
          <CardTitle>
            {view === 'board'
              ? 'Board'
              : mode === 'mobile'
                ? mobileScope === 'mine'
                  ? 'Mina uppgifter'
                  : mobileScope === 'overdue'
                    ? 'Försenade uppgifter'
                    : 'Alla öppna uppgifter'
                : 'Aktiva uppgifter'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasksQuery.isLoading ? <p className="text-sm text-foreground/65">Laddar uppgifter...</p> : null}
          {!tasksQuery.isLoading && view === 'list' && visibleOpenTasks.length === 0 ? (
            <p className="text-sm text-foreground/65">
              {mode === 'mobile' && mobileScope === 'mine'
                ? 'Du har inga öppna uppgifter i projektet just nu.'
                : mode === 'mobile' && mobileScope === 'overdue'
                  ? 'Inga uppgifter är försenade just nu.'
                  : 'Inga uppgifter ännu.'}
            </p>
          ) : null}

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
                    const taskMembers = (taskMemberUserIdsByTaskId.get(task.id) ?? [])
                      .map((userId) => assigneeByUserId.get(userId) ?? null)
                      .filter((member): member is ProjectMemberVisual => Boolean(member));
                    const visibleTaskMemberBadges = buildTaskVisibleMemberBadges(assignee, taskMembers);
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
                        <TaskMemberBadges
                          members={visibleTaskMemberBadges}
                          activeMemberKey={activeTaskMemberKey}
                          onToggle={(key) => setActiveTaskMemberKey((current) => (current === key ? null : key))}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <>
          {visibleOpenTasks.map((task) => {
            const assignee = task.assignee_user_id ? assigneeByUserId.get(task.assignee_user_id) ?? null : null;
            const taskMemberUserIds = taskMemberUserIdsByTaskId.get(task.id) ?? [];
            const taskMembers = taskMemberUserIds
              .map((userId) => assigneeByUserId.get(userId) ?? null)
              .filter((member): member is ProjectMemberVisual => Boolean(member));
            const visibleTaskMemberBadges = buildTaskVisibleMemberBadges(assignee, taskMembers);
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
                  {visibleTaskMemberBadges.length === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                      <Circle className="h-3.5 w-3.5" />
                      Ej tilldelad
                    </span>
                  ) : null}
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
                <TaskMemberBadges
                  members={visibleTaskMemberBadges}
                  activeMemberKey={activeTaskMemberKey}
                  onToggle={(key) => setActiveTaskMemberKey((current) => (current === key ? null : key))}
                />

                {canManageTasks(role) ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 md:grid-cols-4">
                    <SimpleSelect
                      value={task.status}
                      onValueChange={(value) => updateTaskMutation.mutate({ taskId: task.id, patch: { status: value as TaskStatus } })}
                      options={[
                        { value: 'todo', label: 'Att göra' },
                        { value: 'in_progress', label: 'Pågår' },
                        { value: 'done', label: 'Klar' }
                      ]}
                    />
                    <SimpleSelect
                      value={task.priority}
                      onValueChange={(value) => updateTaskMutation.mutate({ taskId: task.id, patch: { priority: value as TaskPriority } })}
                      options={[
                        { value: 'low', label: 'Låg' },
                        { value: 'normal', label: 'Normal' },
                        { value: 'high', label: 'Hög' }
                      ]}
                    />
                    <SimpleSelect
                      value={task.assignee_user_id ?? 'none'}
                      onValueChange={(value) =>
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          patch: { assignee_user_id: value === 'none' ? null : normalizeUserId(value) }
                        })
                      }
                      options={[
                        { value: 'none', label: 'Ingen ansvarig' },
                        ...normalizedMembers.map((member) => ({
                          value: member.user_id,
                          label: getUserDisplayName({
                            displayName: member.display_name,
                            email: member.email,
                            handle: member.handle,
                            userId: member.user_id
                          })
                        }))
                      ]}
                    />
                    <SimpleSelect
                      value={task.milestone_id ?? 'none'}
                      onValueChange={(value) =>
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          patch: { milestone_id: value === 'none' ? null : value }
                        })
                      }
                      options={[
                        { value: 'none', label: 'Inget delmål' },
                        ...milestones.map((milestone) => ({
                          value: milestone.id,
                          label: `${milestone.title || 'Namnlöst delmål'}${milestone.date ? ` • ${milestone.date}` : ''}`
                        }))
                      ]}
                    />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-foreground/70">Medlemmar på uppgiften</p>
                      <TaskMemberPicker
                        members={normalizedMembers}
                        selectedUserIds={taskMemberUserIds}
                        onChange={(nextUserIds) =>
                          updateTaskMutation.mutate({
                            taskId: task.id,
                            patch: {},
                            memberUserIds: nextUserIds
                          })
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
            </>
          )}
        </CardContent>
      </Card>

      {view === 'list' && visibleDoneTasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Klara uppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleDoneTasks.map((task) => (
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
