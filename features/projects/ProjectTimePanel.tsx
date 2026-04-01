'use client';

import { useMemo, useState } from 'react';
import { Clock3, Pause, Play, Plus, Square, TimerReset, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import type { Role } from '@/lib/types';
import type { ProjectMemberVisual } from './projectQueries';

type ProjectTaskRow = DbRow<'project_tasks'>;
type ProjectTimeEntryRow = DbRow<'project_time_entries'>;

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function getWeekRangeIso(referenceDate: string) {
  const selected = new Date(referenceDate);
  const day = selected.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(selected);
  start.setDate(selected.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startIso: start.toLocaleDateString('sv-CA'),
    endIso: end.toLocaleDateString('sv-CA')
  };
}

function canManageOthers(role: Role) {
  return role === 'admin' || role === 'finance';
}

export default function ProjectTimePanel({
  companyId,
  projectId,
  role,
  members,
  orderId
}: {
  companyId: string;
  projectId: string;
  role: Role;
  members: ProjectMemberVisual[];
  orderId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [entryDate, setEntryDate] = useState(todayIso());
  const [hours, setHours] = useState('1');
  const [note, setNote] = useState('');
  const [taskId, setTaskId] = useState<string>('none');
  const [userId, setUserId] = useState<string>('self');
  const [orderValue, setOrderValue] = useState<string>('none');
  const [entryKind, setEntryKind] = useState<'billable' | 'internal'>('billable');
  const [periodView, setPeriodView] = useState<'day' | 'week'>('week');
  const [referenceDate, setReferenceDate] = useState(todayIso());
  const [createOpen, setCreateOpen] = useState(false);
  const mode = useBreakpointMode();
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();

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
    queryKey: ['project-time-tasks', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,title,status,priority,project_id,company_id,created_at,updated_at,created_by,description,due_date,assignee_user_id,milestone_id,subtasks')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .returns<ProjectTaskRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const timeEntriesQuery = useQuery<ProjectTimeEntryRow[]>({
    queryKey: ['project-time-entries', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('id,company_id,project_id,task_id,user_id,entry_date,hours,note,created_at,updated_at,order_id,is_billable')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .returns<ProjectTimeEntryRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const memberByUserId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const taskById = useMemo(() => new Map((tasksQuery.data ?? []).map((task) => [task.id, task])), [tasksQuery.data]);
  const currentUserId = currentUserQuery.data;
  const effectiveUserId = canManageOthers(role) ? (userId === 'self' ? currentUserId : userId) : currentUserId;
  const myEntries = useMemo(
    () => (currentUserId ? (timeEntriesQuery.data ?? []).filter((entry) => entry.user_id === currentUserId) : []),
    [currentUserId, timeEntriesQuery.data]
  );
  const totalHours = useMemo(
    () => (timeEntriesQuery.data ?? []).reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0),
    [timeEntriesQuery.data]
  );
  const myHours = useMemo(() => myEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0), [myEntries]);
  const myTodayHours = useMemo(() => {
    const today = todayIso();
    return myEntries.reduce((sum, entry) => sum + (entry.entry_date === today ? Number(entry.hours ?? 0) : 0), 0);
  }, [myEntries]);
  const myWeekHours = useMemo(() => {
    const { startIso, endIso } = getWeekRangeIso(todayIso());
    return myEntries.reduce(
      (sum, entry) => sum + (entry.entry_date >= startIso && entry.entry_date <= endIso ? Number(entry.hours ?? 0) : 0),
      0
    );
  }, [myEntries]);
  const billableHours = useMemo(
    () => (timeEntriesQuery.data ?? []).reduce((sum, entry) => sum + (entry.is_billable ? Number(entry.hours ?? 0) : 0), 0),
    [timeEntriesQuery.data]
  );
  const internalHours = useMemo(
    () => (timeEntriesQuery.data ?? []).reduce((sum, entry) => sum + (!entry.is_billable ? Number(entry.hours ?? 0) : 0), 0),
    [timeEntriesQuery.data]
  );
  const hoursByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of timeEntriesQuery.data ?? []) {
      map.set(entry.user_id, (map.get(entry.user_id) ?? 0) + Number(entry.hours ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [timeEntriesQuery.data]);
  const filteredEntries = useMemo(() => {
    const allEntries = timeEntriesQuery.data ?? [];
    if (!referenceDate) return allEntries;
    if (periodView === 'day') return allEntries.filter((entry) => entry.entry_date === referenceDate);

    const { startIso, endIso } = getWeekRangeIso(referenceDate);
    return allEntries.filter((entry) => entry.entry_date >= startIso && entry.entry_date <= endIso);
  }, [periodView, referenceDate, timeEntriesQuery.data]);
  const filteredBillableHours = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + (entry.is_billable ? Number(entry.hours ?? 0) : 0), 0),
    [filteredEntries]
  );
  const filteredInternalHours = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + (!entry.is_billable ? Number(entry.hours ?? 0) : 0), 0),
    [filteredEntries]
  );
  const filteredHoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of filteredEntries) {
      map.set(entry.entry_date, (map.get(entry.entry_date) ?? 0) + Number(entry.hours ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);
  const mobileProjectFeed = useMemo(() => filteredEntries.slice(0, 6), [filteredEntries]);

  const createEntryMutation = useMutation({
    mutationFn: async () => {
      const nextHours = Number(hours);
      if (!effectiveUserId) throw new Error('Kunde inte identifiera användaren');
      if (!Number.isFinite(nextHours) || nextHours <= 0) throw new Error('Ange antal timmar större än 0');

      const { error } = await supabase.from('project_time_entries').insert({
        company_id: companyId,
        project_id: projectId,
        task_id: taskId === 'none' ? null : taskId,
        user_id: effectiveUserId,
        order_id: orderValue === 'none' ? null : orderValue,
        is_billable: entryKind === 'billable',
        entry_date: entryDate || todayIso(),
        hours: Math.round(nextHours * 100) / 100,
        note: note.trim() || null
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setEntryDate(todayIso());
      setHours('1');
      setNote('');
      setTaskId('none');
      setOrderValue('none');
      setEntryKind('billable');
      if (canManageOthers(role)) setUserId('self');
      await queryClient.invalidateQueries({ queryKey: ['project-time-entries', companyId, projectId] });
      toast.success('Tid rapporterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte rapportera tid');
    }
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('project_time_entries').delete().eq('company_id', companyId).eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-time-entries', companyId, projectId] });
      toast.success('Tidspost borttagen');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort tidspost');
    }
  });

  return (
    <div className="space-y-4">
      {mode === 'mobile' ? (
        <div className="space-y-3">
          <Card className="border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tid på mobilen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-primary/15 bg-background/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-foreground/45">
                  {hasActiveTimer ? 'Aktiv timer' : 'Ingen aktiv timer'}
                </p>
                <p className="mt-2 text-sm text-foreground/70">
                  {hasActiveTimer
                    ? 'Timern fortsätter i bakgrunden och kan pausas eller stoppas direkt härifrån.'
                    : 'Starta tid snabbt för projektet eller lägg in en manuell tidspost.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {hasActiveTimer ? (
                  <Button type="button" onClick={openControlsDialog} className="w-full">
                    <Pause className="mr-2 h-4 w-4" />
                    Öppna timer
                  </Button>
                ) : (
                  <Button type="button" onClick={openStartDialog} className="w-full">
                    <Play className="mr-2 h-4 w-4" />
                    Starta timer
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setCreateOpen(true)} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Rapportera tid
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">Idag</p>
              <p className="mt-1 text-base font-semibold">{myTodayHours.toFixed(2)} h</p>
            </div>
            <div className="rounded-xl border bg-card px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">Denna vecka</p>
              <p className="mt-1 text-base font-semibold">{myWeekHours.toFixed(2)} h</p>
            </div>
            <div className="rounded-xl border bg-card px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">Projektet</p>
              <p className="mt-1 text-base font-semibold">{totalHours.toFixed(2)} h</p>
            </div>
          </div>

          {currentUserId ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mina senaste tidsposter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {myEntries.length === 0 ? <p className="text-sm text-foreground/65">Du har inte rapporterat tid i projektet ännu.</p> : null}
                {myEntries.slice(0, 4).map((entry) => (
                  <div key={`mine-mobile-${entry.id}`} className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TimerReset className="h-4 w-4 text-primary" />
                        <p className="font-medium">{Number(entry.hours).toFixed(2)} h</p>
                      </div>
                      <Badge>{new Date(entry.entry_date).toLocaleDateString('sv-SE')}</Badge>
                    </div>
                    {entry.task_id ? <p className="mt-1 text-sm text-foreground/70">{taskById.get(entry.task_id)?.title ?? 'Kopplad uppgift'}</p> : null}
                    {entry.note ? <p className="mt-1 text-sm text-foreground/60">{entry.note}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Projektets tid just nu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
                  <button
                    type="button"
                    onClick={() => setPeriodView('day')}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${periodView === 'day' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
                  >
                    Dag
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodView('week')}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${periodView === 'week' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
                  >
                    Vecka
                  </button>
                </div>
                <div className="w-[148px]">
                  <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">Fakturerbar</p>
                  <p className="mt-1 font-semibold">{filteredBillableHours.toFixed(2)} h</p>
                </div>
                <div className="rounded-xl border px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-foreground/45">Intern</p>
                  <p className="mt-1 font-semibold">{filteredInternalHours.toFixed(2)} h</p>
                </div>
              </div>

              <div className="space-y-2">
                {mobileProjectFeed.length === 0 ? <p className="text-sm text-foreground/65">Inga tidsposter i vald period.</p> : null}
                {mobileProjectFeed.map((entry) => {
                  const member = memberByUserId.get(entry.user_id) ?? null;
                  const task = entry.task_id ? taskById.get(entry.task_id) ?? null : null;
                  const canDelete = canManageOthers(role) || entry.user_id === currentUserId;
                  const memberLabel = getUserDisplayName({
                    displayName: member?.display_name,
                    email: member?.email,
                    handle: member?.handle,
                    userId: entry.user_id
                  });

                  return (
                    <div key={`project-mobile-${entry.id}`} className="rounded-xl border px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{Number(entry.hours).toFixed(2)} h</Badge>
                            <Badge>{new Date(entry.entry_date).toLocaleDateString('sv-SE')}</Badge>
                            <Badge>{entry.is_billable ? 'Fakturerbar' : 'Intern'}</Badge>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <ProfileBadge
                              label={memberLabel}
                              color={member?.color}
                              avatarUrl={member?.avatar_url}
                              emoji={member?.emoji}
                              className="h-6 w-6 shrink-0"
                              textClassName="text-[10px] font-semibold text-white"
                            />
                            <p className="truncate text-sm font-medium">{memberLabel}</p>
                          </div>
                          {task ? <p className="text-sm text-foreground/70">{task.title}</p> : null}
                          {entry.note ? <p className="text-sm text-foreground/60">{entry.note}</p> : null}
                        </div>
                        {canDelete ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => deleteEntryMutation.mutate(entry.id)}
                            disabled={deleteEntryMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Totala timmar</p>
          <p className="mt-1 font-medium">{totalHours.toFixed(2)} h</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Mina timmar</p>
          <p className="mt-1 font-medium">{myHours.toFixed(2)} h</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Tidsposter</p>
          <p className="mt-1 font-medium">{timeEntriesQuery.data?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-foreground/70">Fakturerbar / intern</p>
          <p className="mt-1 font-medium">{billableHours.toFixed(2)} h / {internalHours.toFixed(2)} h</p>
        </div>
      </div>

        <Card>
          <CardHeader>
            <CardTitle>Rapportera tid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm">Datum</span>
              <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Timmar</span>
              <Input type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </label>
            <label className="space-y-1 xl:col-span-2">
              <span className="text-sm">Uppgift</span>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj uppgift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen kopplad uppgift</SelectItem>
                  {(tasksQuery.data ?? []).map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
              </label>
            <label className="space-y-1">
              <span className="text-sm">Tidstyp</span>
              <Select value={entryKind} onValueChange={(value) => setEntryKind(value as 'billable' | 'internal')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billable">Fakturerbar</SelectItem>
                  <SelectItem value="internal">Intern</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Order</span>
              <Select value={orderValue} onValueChange={setOrderValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen order</SelectItem>
                  {orderId ? <SelectItem value={orderId}>Projektets order</SelectItem> : null}
                </SelectContent>
              </Select>
            </label>
            {canManageOthers(role) ? (
              <label className="space-y-1 xl:col-span-4">
                <span className="text-sm">Rapportera för medlem</span>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj medlem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Mig själv</SelectItem>
                      {members.map((member) => (
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
            ) : null}
            <label className="space-y-1 md:col-span-2 xl:col-span-4">
              <span className="text-sm">Anteckning</span>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vad gjordes?" rows={3} />
            </label>
          </div>
          <Button type="button" onClick={() => createEntryMutation.mutate()} disabled={createEntryMutation.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {createEntryMutation.isPending ? 'Sparar...' : 'Lägg till tidspost'}
          </Button>
          </CardContent>
        </Card>
        </>
      )}

      <ActionSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Rapportera tid" description="Lägg till tid, uppgift och anteckning">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm">Datum</span>
              <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Timmar</span>
              <Input type="number" min="0.25" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Uppgift</span>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger><SelectValue placeholder="Välj uppgift" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen kopplad uppgift</SelectItem>
                  {(tasksQuery.data ?? []).map((task) => (
                    <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Tidstyp</span>
              <Select value={entryKind} onValueChange={(value) => setEntryKind(value as 'billable' | 'internal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="billable">Fakturerbar</SelectItem>
                  <SelectItem value="internal">Intern</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Order</span>
              <Select value={orderValue} onValueChange={setOrderValue}>
                <SelectTrigger><SelectValue placeholder="Välj order" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen order</SelectItem>
                  {orderId ? <SelectItem value={orderId}>Projektets order</SelectItem> : null}
                </SelectContent>
              </Select>
            </label>
            {canManageOthers(role) ? (
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Rapportera för medlem</span>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger><SelectValue placeholder="Välj medlem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Mig själv</SelectItem>
                    {members.map((member) => (
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
            ) : null}
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Anteckning</span>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Vad gjordes?" rows={3} />
            </label>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => createEntryMutation.mutate(undefined, { onSuccess: () => setCreateOpen(false) })}
            disabled={createEntryMutation.isPending}
          >
            <Square className="mr-2 h-4 w-4" />
            {createEntryMutation.isPending ? 'Sparar...' : 'Lägg till tidspost'}
          </Button>
        </div>
      </ActionSheet>

      {mode === 'desktop' ? (
      <Card>
        <CardHeader>
          <CardTitle>Vy för tidrapportering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => setPeriodView('day')}
                className={`rounded-full px-3 py-1.5 text-sm transition ${periodView === 'day' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
              >
                Dag
              </button>
              <button
                type="button"
                onClick={() => setPeriodView('week')}
                className={`rounded-full px-3 py-1.5 text-sm transition ${periodView === 'week' ? 'bg-background text-foreground shadow-sm' : 'text-foreground/65'}`}
              >
                Vecka
              </button>
            </div>
            <div className="w-full max-w-[220px]">
              <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-sm text-foreground/70">Vald period</p>
              <p className="mt-1 font-medium">{periodView === 'day' ? 'Dagvy' : 'Veckovy'}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-foreground/70">Fakturerbar tid</p>
              <p className="mt-1 font-medium">{filteredBillableHours.toFixed(2)} h</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-sm text-foreground/70">Intern tid</p>
              <p className="mt-1 font-medium">{filteredInternalHours.toFixed(2)} h</p>
            </div>
          </div>

          <div className="space-y-2">
            {filteredHoursByDate.length === 0 ? <p className="text-sm text-foreground/65">Inga tidsposter i vald period.</p> : null}
            {filteredHoursByDate.map(([date, total]) => (
              <div key={`period-${date}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-foreground/55" />
                  <p className="text-sm font-medium">{new Date(date).toLocaleDateString('sv-SE')}</p>
                </div>
                <Badge>{total.toFixed(2)} h</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      ) : null}

      {mode === 'desktop' && currentUserId ? (
        <Card>
          <CardHeader>
            <CardTitle>Mina senaste tidsposter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myEntries.length === 0 ? <p className="text-sm text-foreground/65">Du har inte rapporterat tid i projektet ännu.</p> : null}
            {myEntries.slice(0, 4).map((entry) => (
              <div key={`mine-${entry.id}`} className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TimerReset className="h-4 w-4 text-primary" />
                    <p className="font-medium">{Number(entry.hours).toFixed(2)} h</p>
                  </div>
                  <Badge>{new Date(entry.entry_date).toLocaleDateString('sv-SE')}</Badge>
                </div>
                {entry.task_id ? <p className="mt-1 text-sm text-foreground/70">{taskById.get(entry.task_id)?.title ?? 'Kopplad uppgift'}</p> : null}
                {entry.note ? <p className="mt-1 text-sm text-foreground/60">{entry.note}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {mode === 'desktop' ? (
      <Card>
        <CardHeader>
          <CardTitle>Timmar per medlem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {hoursByMember.length === 0 ? <p className="text-sm text-foreground/65">Inga timmar ännu.</p> : null}
          {hoursByMember.map(([memberUserId, memberHours]) => {
            const member = memberByUserId.get(memberUserId) ?? null;
            const memberLabel = getUserDisplayName({
              displayName: member?.display_name,
              email: member?.email,
              handle: member?.handle,
              userId: memberUserId
            });
            return (
              <div key={`hours-${memberUserId}`} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProfileBadge
                    label={memberLabel}
                    color={member?.color}
                    avatarUrl={member?.avatar_url}
                    emoji={member?.emoji}
                    className="h-6 w-6 shrink-0"
                    textClassName="text-[10px] font-semibold text-white"
                  />
                  <p className="truncate text-sm font-medium">{memberLabel}</p>
                </div>
                <Badge>{memberHours.toFixed(2)} h</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{mode === 'mobile' ? 'Fler tidsposter' : 'Tidsposter i projektet'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {timeEntriesQuery.isLoading ? <p className="text-sm text-foreground/65">Laddar tidsposter...</p> : null}
          {!timeEntriesQuery.isLoading && filteredEntries.length === 0 ? <p className="text-sm text-foreground/65">Inga tidsposter i vald period.</p> : null}
          {(mode === 'mobile' ? filteredEntries.slice(6, 12) : filteredEntries).map((entry) => {
            const member = memberByUserId.get(entry.user_id) ?? null;
            const task = entry.task_id ? taskById.get(entry.task_id) ?? null : null;
            const canDelete = canManageOthers(role) || entry.user_id === currentUserId;
            const memberLabel = getUserDisplayName({
              displayName: member?.display_name,
              email: member?.email,
              handle: member?.handle,
              userId: entry.user_id
            });

            return (
              <div key={entry.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/70">
                        <Clock3 className="h-3.5 w-3.5" />
                        {Number(entry.hours).toFixed(2)} h
                      </span>
                      <Badge>{new Date(entry.entry_date).toLocaleDateString('sv-SE')}</Badge>
                      {task ? <Badge>{task.title}</Badge> : null}
                      <Badge>{entry.is_billable ? 'Fakturerbar' : 'Intern'}</Badge>
                      {entry.order_id ? <Badge>Order</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <ProfileBadge
                        label={memberLabel}
                        color={member?.color}
                        avatarUrl={member?.avatar_url}
                        emoji={member?.emoji}
                        className="h-6 w-6 shrink-0"
                        textClassName="text-[10px] font-semibold text-white"
                      />
                      <p className="text-sm font-medium">{memberLabel}</p>
                    </div>
                    {entry.note ? <p className="text-sm text-foreground/70">{entry.note}</p> : null}
                  </div>
                  {canDelete ? (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteEntryMutation.mutate(entry.id)} disabled={deleteEntryMutation.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
