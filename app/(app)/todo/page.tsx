'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BriefcaseBusiness, Camera, CheckCircle2, CheckSquare2, Clock3, FileWarning, FilePlus2, ReceiptText, ShieldAlert, Timer, Wallet } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canViewFinance } from '@/lib/auth/capabilities';
import { getPrimaryMobileQuickActions, getSecondaryMobileQuickActions } from '@/lib/mobile/quickActions';
import { createClient } from '@/lib/supabase/client';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

type ProjectRow = {
  id: string;
  title: string;
  updated_at: string;
  status: string | null;
  responsible_user_id: string | null;
  end_date: string | null;
};

type ProjectMemberRow = {
  project_id: string;
  user_id: string;
};

type ProjectTaskRow = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: string | null;
  assignee_user_id: string | null;
  created_by: string | null;
};

type ActiveTimerRow = {
  id: string;
  project_id: string;
  task_id: string | null;
  started_at: string;
};

type InvoiceRow = {
  id: string;
  invoice_no: string;
  due_date: string;
  total: number;
  status: string;
  currency: string;
};

type SupplierInvoiceRow = {
  id: string;
  supplier_invoice_no: string;
  due_date: string;
  open_amount: number;
  currency: string;
  status: string;
};

type VerificationRow = {
  id: string;
  description: string;
  status: string | null;
  attachment_path: string | null;
  fiscal_year: number | null;
  verification_no: number | null;
  verification_lines: Array<{ debit: number | null; credit: number | null }> | null;
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function dayDiff(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatMoney(value: number, currency = 'SEK') {
  return `${Number(value).toFixed(2)} ${currency}`;
}

function verificationNumberLabel(fiscalYear: number | null, verificationNo: number | null) {
  if (!fiscalYear || !verificationNo) return 'Verifikation';
  return `${fiscalYear}-${String(verificationNo).padStart(5, '0')}`;
}

export default function TodoPage() {
  const { companyId, role, capabilities } = useAppContext();
  const mode = useBreakpointMode();
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();
  const canReadFinance = canViewFinance(role, capabilities);
  const seesAllProjectSignals = role === 'admin';
  const seesAllFinanceSignals = role === 'admin' || role === 'finance';
  const supabase = useMemo(() => createClient(), []);
  const today = startOfToday();
  const now = new Date();

  const currentUserQuery = useQuery<string | null>({
    queryKey: ['todo-current-user', companyId],
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
  const currentUserId = currentUserQuery.data ?? null;

  const projectsQuery = useQuery<ProjectRow[]>({
    queryKey: ['todo-project-watch', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,updated_at,status,responsible_user_id,end_date')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: true })
        .limit(150)
        .returns<ProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectMembersQuery = useQuery<ProjectMemberRow[]>({
    queryKey: ['todo-project-members', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id,user_id')
        .eq('company_id', companyId)
        .returns<ProjectMemberRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['todo-customer-invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,due_date,total,status,currency')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(150)
        .returns<InvoiceRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const supplierInvoicesQuery = useQuery<SupplierInvoiceRow[]>({
    queryKey: ['todo-supplier-invoices', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: SupplierInvoiceRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from('supplier_invoices')
        .select('id,supplier_invoice_no,due_date,open_amount,currency,status')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const verificationsQuery = useQuery<VerificationRow[]>({
    queryKey: ['todo-verifications', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verifications')
        .select('id,description,status,attachment_path,fiscal_year,verification_no,verification_lines(debit,credit)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(120)
        .returns<VerificationRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const tasksQuery = useQuery<ProjectTaskRow[]>({
    queryKey: ['todo-project-tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,project_id,title,due_date,status,assignee_user_id,created_by')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200)
        .returns<ProjectTaskRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const activeTimersQuery = useQuery<ActiveTimerRow[]>({
    queryKey: ['todo-active-timers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_active_timers')
        .select('id,project_id,task_id,started_at')
        .eq('company_id', companyId)
        .returns<ActiveTimerRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectById = useMemo(
    () => new Map((projectsQuery.data ?? []).map((project) => [project.id, project])),
    [projectsQuery.data]
  );
  const projectMemberUserIdsByProjectId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const assignment of projectMembersQuery.data ?? []) {
      const current = map.get(assignment.project_id) ?? [];
      current.push(assignment.user_id);
      map.set(assignment.project_id, current);
    }
    return map;
  }, [projectMembersQuery.data]);
  const taskById = useMemo(
    () => new Map((tasksQuery.data ?? []).map((task) => [task.id, task])),
    [tasksQuery.data]
  );
  const userRelevantProjectIds = useMemo(() => {
    if (!currentUserId) return new Set<string>();
    const relevant = new Set<string>();

    for (const project of projectsQuery.data ?? []) {
      if (project.responsible_user_id === currentUserId) {
        relevant.add(project.id);
      }
    }

    for (const assignment of projectMembersQuery.data ?? []) {
      if (assignment.user_id === currentUserId) {
        relevant.add(assignment.project_id);
      }
    }

    for (const task of tasksQuery.data ?? []) {
      if (task.assignee_user_id === currentUserId || task.created_by === currentUserId) {
        relevant.add(task.project_id);
      }
    }

    return relevant;
  }, [currentUserId, projectMembersQuery.data, projectsQuery.data, tasksQuery.data]);
  const visibleProjects = useMemo(() => {
    return seesAllProjectSignals
      ? projectsQuery.data ?? []
      : (projectsQuery.data ?? []).filter((project) => userRelevantProjectIds.has(project.id));
  }, [projectsQuery.data, seesAllProjectSignals, userRelevantProjectIds]);
  const visibleTasks = useMemo(() => {
    return seesAllProjectSignals
      ? tasksQuery.data ?? []
      : (tasksQuery.data ?? []).filter(
          (task) =>
            task.assignee_user_id === currentUserId ||
            task.created_by === currentUserId ||
            userRelevantProjectIds.has(task.project_id)
        );
  }, [currentUserId, seesAllProjectSignals, tasksQuery.data, userRelevantProjectIds]);
  const visibleActiveTimers = useMemo(() => {
    return seesAllProjectSignals
      ? activeTimersQuery.data ?? []
      : (activeTimersQuery.data ?? []).filter((timer) => userRelevantProjectIds.has(timer.project_id));
  }, [activeTimersQuery.data, seesAllProjectSignals, userRelevantProjectIds]);

  const projectAlerts = useMemo(() => {
    return visibleProjects
      .filter((project) => project.status !== 'done')
      .map((project) => {
        const updatedAt = new Date(project.updated_at);
        const daysIdle = Math.max(0, dayDiff(updatedAt, today));
        return { ...project, daysIdle };
      })
      .filter((project) => project.daysIdle >= 7)
      .sort((a, b) => b.daysIdle - a.daysIdle)
      .slice(0, 8);
  }, [today, visibleProjects]);

  const projectMissingResponsibleAlerts = useMemo(() => {
    return visibleProjects
      .filter((project) => project.status !== 'done' && !project.responsible_user_id)
      .slice(0, 8);
  }, [visibleProjects]);

  const projectDeadlineAlerts = useMemo(() => {
    return visibleProjects
      .filter((project) => project.status !== 'done' && project.end_date)
      .map((project) => ({
        ...project,
        daysLate: Math.max(1, dayDiff(new Date(project.end_date as string), today))
      }))
      .filter((project) => new Date(project.end_date as string) < today)
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 8);
  }, [today, visibleProjects]);

  const overdueTaskAlerts = useMemo(() => {
    return visibleTasks
      .filter((task) => task.status !== 'done' && task.due_date && new Date(task.due_date) < today)
      .map((task) => ({
        ...task,
        projectTitle: projectById.get(task.project_id)?.title ?? 'Projekt',
        daysLate: Math.max(1, dayDiff(new Date(task.due_date as string), today))
      }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 8);
  }, [projectById, today, visibleTasks]);

  const unassignedTaskAlerts = useMemo(() => {
    return visibleTasks
      .filter((task) => task.status !== 'done' && !task.assignee_user_id)
      .map((task) => ({
        ...task,
        projectTitle: projectById.get(task.project_id)?.title ?? 'Projekt'
      }))
      .slice(0, 8);
  }, [projectById, visibleTasks]);

  const overdueCustomerInvoices = useMemo(() => {
    if (!seesAllFinanceSignals) return [];
    return (invoicesQuery.data ?? [])
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void' && new Date(invoice.due_date) < today)
      .map((invoice) => ({ ...invoice, daysOverdue: Math.max(1, dayDiff(new Date(invoice.due_date), today)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8);
  }, [invoicesQuery.data, seesAllFinanceSignals, today]);

  const overdueSupplierInvoices = useMemo(() => {
    if (!seesAllFinanceSignals) return [];
    return (supplierInvoicesQuery.data ?? [])
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void' && Number(invoice.open_amount) > 0 && new Date(invoice.due_date) < today)
      .map((invoice) => ({ ...invoice, daysOverdue: Math.max(1, dayDiff(new Date(invoice.due_date), today)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8);
  }, [seesAllFinanceSignals, supplierInvoicesQuery.data, today]);

  const verificationAlerts = useMemo(() => {
    if (!seesAllFinanceSignals) return [];
    return (verificationsQuery.data ?? [])
      .map((verification) => {
        const debit = (verification.verification_lines ?? []).reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
        const credit = (verification.verification_lines ?? []).reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
        const imbalance = Math.abs(debit - credit);
        const issues = [
          !verification.attachment_path ? 'Saknar bilaga' : null,
          imbalance > 0.005 ? `Obalans ${imbalance.toFixed(2)} kr` : null
        ].filter((issue): issue is string => Boolean(issue));

        return { ...verification, issues };
      })
      .filter((verification) => verification.status !== 'voided' && verification.issues.length > 0)
      .slice(0, 8);
  }, [seesAllFinanceSignals, verificationsQuery.data]);

  const longRunningTimerAlerts = useMemo(() => {
    return visibleActiveTimers
      .map((timer) => {
        const startedAt = new Date(timer.started_at);
        const runningHours = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60)));
        return {
          ...timer,
          runningHours,
          projectTitle: projectById.get(timer.project_id)?.title ?? 'Projekt',
          taskTitle: timer.task_id ? taskById.get(timer.task_id)?.title ?? 'Uppgift' : null
        };
      })
      .filter((timer) => timer.runningHours >= 12)
      .sort((a, b) => b.runningHours - a.runningHours)
      .slice(0, 8);
  }, [now, projectById, taskById, visibleActiveTimers]);

  const urgentCount =
    projectAlerts.length +
    projectMissingResponsibleAlerts.length +
    projectDeadlineAlerts.length +
    overdueTaskAlerts.length +
    unassignedTaskAlerts.length +
    longRunningTimerAlerts.length +
    overdueCustomerInvoices.length +
    overdueSupplierInvoices.length +
    verificationAlerts.length;
  const isLoading =
    projectsQuery.isLoading ||
    projectMembersQuery.isLoading ||
    tasksQuery.isLoading ||
    activeTimersQuery.isLoading ||
    currentUserQuery.isLoading ||
    (canReadFinance && (invoicesQuery.isLoading || supplierInvoicesQuery.isLoading || verificationsQuery.isLoading));
  const myActiveTasks = useMemo(() => {
    return visibleTasks
      .filter((task) => task.status !== 'done')
      .map((task) => ({
        ...task,
        projectTitle: projectById.get(task.project_id)?.title ?? 'Projekt',
        isOverdue: Boolean(task.due_date && new Date(task.due_date) < today)
      }))
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return a.title.localeCompare(b.title, 'sv');
      })
      .slice(0, 6);
  }, [projectById, today, visibleTasks]);
  const myProjects = useMemo(() => {
    return visibleProjects
      .map((project) => ({
        ...project,
        daysIdle: Math.max(0, dayDiff(new Date(project.updated_at), today))
      }))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);
  }, [today, visibleProjects]);
  const personalSignals = useMemo(
    () => [
      projectAlerts.length > 0 ? `${projectAlerts.length} stilla projekt` : null,
      overdueTaskAlerts.length > 0 ? `${overdueTaskAlerts.length} försenade uppgifter` : null,
      longRunningTimerAlerts.length > 0 ? `${longRunningTimerAlerts.length} långa timers` : null
    ].filter((item): item is string => Boolean(item)),
    [longRunningTimerAlerts.length, overdueTaskAlerts.length, projectAlerts.length]
  );
  const primaryQuickActions = getPrimaryMobileQuickActions(role, capabilities, hasActiveTimer);
  const secondaryQuickActions = getSecondaryMobileQuickActions(role, capabilities, hasActiveTimer);

  if (mode === 'mobile') {
    return (
      <section className="space-y-4">
        <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Hem</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Mitt nu</h1>
                <p className="text-sm text-foreground/65">
                  Snabb överblick över det som kräver uppmärksamhet, dina uppgifter och det du troligen behöver göra härnäst.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                  {urgentCount} signaler
                </Badge>
                <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                  {hasActiveTimer ? 'Timer pågår' : 'Ingen aktiv timer'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {primaryQuickActions.map((item) =>
                item.id === 'time' ? (
                  <QuickActionButton
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    onClick={() => (hasActiveTimer ? openControlsDialog() : openStartDialog())}
                  />
                ) : (
                  <QuickActionLink key={item.id} icon={item.icon} label={item.label} href={item.href as Route} />
                )
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Att hålla koll på nu</CardTitle>
            <p className="text-sm text-foreground/65">Automatiska signaler som rör dig just nu.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <p className="text-sm text-foreground/65">Laddar överblick...</p> : null}
            {!isLoading && personalSignals.length === 0 ? (
              <p className="text-sm text-foreground/65">Inget akut just nu.</p>
            ) : null}
            {projectAlerts.slice(0, 3).map((project) => (
              <TodoItem
                key={`mobile-stale-${project.id}`}
                href={`/projects/${project.id}` as Route}
                title={project.title}
                detail={`${project.daysIdle} dagar sedan senaste aktivitet`}
                badge={`${project.daysIdle} d`}
                tone="amber"
              />
            ))}
            {overdueTaskAlerts.slice(0, 3).map((task) => (
              <TodoItem
                key={`mobile-task-${task.id}`}
                href={`/projects/${task.project_id}?tab=tasks` as Route}
                title={task.title}
                detail={`${task.projectTitle} • förfallo ${task.due_date}`}
                badge={`${task.daysLate} d`}
                tone="rose"
              />
            ))}
            {longRunningTimerAlerts.slice(0, 2).map((timer) => (
              <TodoItem
                key={`mobile-timer-${timer.id}`}
                href={`/projects/${timer.project_id}?tab=time` as Route}
                title={timer.taskTitle ? timer.taskTitle : timer.projectTitle}
                detail={`${timer.projectTitle} • aktiv i ${timer.runningHours} timmar`}
                badge={`${timer.runningHours} h`}
                tone="amber"
              />
            ))}
            <Button asChild variant="ghost" className="w-full justify-between rounded-xl">
              <Link href={'/todo' as Route}>
                Visa hela att-göra
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mina uppgifter</CardTitle>
            <p className="text-sm text-foreground/65">Det du sannolikt ska ta tag i härnäst.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {myActiveTasks.length === 0 ? (
              <p className="text-sm text-foreground/65">Du har inga öppna uppgifter just nu.</p>
            ) : (
              myActiveTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/projects/${task.project_id}?tab=tasks` as Route}
                  className="block rounded-xl border border-border/70 bg-card/70 p-3 transition hover:border-primary/35 hover:bg-muted/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-sm text-foreground/65">{task.projectTitle}</p>
                    </div>
                    <Badge className={task.isOverdue ? 'border-rose-300/70 bg-rose-100/70 text-rose-900' : 'border-border/70 bg-muted/40 text-foreground/75'}>
                      {task.due_date ? task.due_date : 'Ingen deadline'}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mina projekt</CardTitle>
            <p className="text-sm text-foreground/65">Senaste aktivitet och status i det du jobbar med.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {myProjects.length === 0 ? (
              <p className="text-sm text-foreground/65">Inga projekt att visa just nu.</p>
            ) : (
              myProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}` as Route}
                  className="block rounded-xl border border-border/70 bg-card/70 p-3 transition hover:border-primary/35 hover:bg-muted/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{project.title}</p>
                      <p className="mt-1 text-sm text-foreground/65">
                        {project.daysIdle === 0 ? 'Uppdaterad idag' : `${project.daysIdle} dagar sedan aktivitet`}
                      </p>
                    </div>
                    <Badge className="border-border/70 bg-muted/40 text-foreground/75">
                      {project.status ?? 'Status saknas'}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
            <Button asChild variant="ghost" className="w-full justify-between rounded-xl">
              <Link href={'/projects' as Route}>
                Alla projekt
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {canReadFinance && secondaryQuickActions.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Snabbregistrering</CardTitle>
              <p className="text-sm text-foreground/65">Mobilvänliga genvägar för ekonomi och underlag.</p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {secondaryQuickActions.map((item) => (
                <QuickActionLink key={item.id} icon={item.icon} label={item.label} href={item.href as Route} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Att göra</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Det viktigaste just nu</h1>
                <p className="text-sm text-foreground/65">
                  Här samlas sådant som appen automatiskt bedömer behöver uppmärksamhet nu, i stället för att du ska leta i varje delvy.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {urgentCount} aktiva signaler
                  </Badge>
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {role === 'admin'
                      ? 'Visar allt'
                      : role === 'finance'
                        ? 'Visar ekonomi + ditt ansvar'
                        : 'Visar bara det som rör dig'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><Link href="/projects">Projekt</Link></Button>
              {canReadFinance ? <Button variant="outline" asChild><Link href="/finance">Ekonomi</Link></Button> : null}
              {canReadFinance ? <Button variant="outline" asChild><Link href="/invoices">Fakturor</Link></Button> : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TodoMetric
              title="Stilla projekt"
              value={String(projectAlerts.length)}
              detail="Inga uppdateringar på minst 7 dagar"
              icon={BriefcaseBusiness}
              tone="amber"
              href="#todo-stale-projects"
            />
            <TodoMetric
              title="Försenade uppgifter"
              value={String(overdueTaskAlerts.length)}
              detail="Uppgifter över förfallodatum"
              icon={ShieldAlert}
              tone="rose"
              href="#todo-overdue-tasks"
            />
            <TodoMetric
              title="Långa timers"
              value={String(longRunningTimerAlerts.length)}
              detail="Pågående längre än 12 timmar"
              icon={Clock3}
              tone="amber"
              href="#todo-long-timers"
            />
            {seesAllFinanceSignals ? (
              <TodoMetric
                title="Verifikationsflaggor"
                value={String(verificationAlerts.length)}
                detail="Saknat underlag eller obalans"
                icon={FileWarning}
                tone="blue"
                href="#todo-verification-alerts"
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-foreground/65">Laddar att-göra...</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <TodoSection
          id="todo-stale-projects"
          title="Projekt som tappat fart"
          description="Projekt utan uppdatering på minst en vecka."
          emptyText="Inga projekt ligger still just nu."
        >
          {projectAlerts.map((project) => (
            <TodoItem
              key={project.id}
              href={`/projects/${project.id}` as Route}
              title={project.title}
              detail={`${project.daysIdle} dagar sedan senaste aktivitet`}
              badge={`${project.daysIdle} d`}
              tone="amber"
            />
          ))}
        </TodoSection>

        <TodoSection
          id="todo-project-missing-responsible"
          title="Projekt utan ansvarig"
          description="Aktiva projekt som saknar utsedd ansvarig."
          emptyText="Alla aktiva projekt har ansvarig."
        >
          {projectMissingResponsibleAlerts.map((project) => (
            <TodoItem
              key={project.id}
              href={`/projects/${project.id}?tab=members` as Route}
              title={project.title}
              detail="Projektet saknar ansvarig användare."
              badge="Saknar ansvarig"
              tone="amber"
            />
          ))}
        </TodoSection>

        <TodoSection
          id="todo-overdue-projects"
          title="Projekt över slutdatum"
          description="Projekt som passerat sitt slutdatum utan att vara klara."
          emptyText="Inga projekt ligger över slutdatum."
        >
          {projectDeadlineAlerts.map((project) => (
            <TodoItem
              key={project.id}
              href={`/projects/${project.id}` as Route}
              title={project.title}
              detail={`${project.daysLate} dagar över slutdatum • ${project.end_date}`}
              badge={`${project.daysLate} d sena`}
              tone="rose"
            />
          ))}
        </TodoSection>

        <TodoSection
          id="todo-overdue-tasks"
          title="Försenade uppgifter"
          description="Öppna uppgifter som passerat sitt förfallodatum."
          emptyText="Inga uppgifter är försenade just nu."
        >
          {overdueTaskAlerts.map((task) => (
            <TodoItem
              key={task.id}
              href={`/projects/${task.project_id}?tab=tasks` as Route}
              title={task.title}
              detail={`${task.projectTitle} • ${task.daysLate} dagar sen • förfallo ${task.due_date}`}
              badge={`${task.daysLate} d`}
              tone="rose"
            />
          ))}
        </TodoSection>

        <TodoSection
          id="todo-unassigned-tasks"
          title="Uppgifter utan ansvarig"
          description="Öppna uppgifter som ännu inte är tilldelade någon."
          emptyText="Alla öppna uppgifter har ansvarig."
        >
          {unassignedTaskAlerts.map((task) => (
            <TodoItem
              key={task.id}
              href={`/projects/${task.project_id}?tab=tasks` as Route}
              title={task.title}
              detail={`${task.projectTitle} • ej tilldelad`}
              badge="Ej tilldelad"
              tone="amber"
            />
          ))}
        </TodoSection>

        {seesAllFinanceSignals ? (
          <TodoSection
            id="todo-overdue-customer-invoices"
            title="Kundfakturor som behöver följas upp"
            description="Fakturor som gått över betalningstiden."
            emptyText="Inga kundfakturor är förfallna."
          >
            {overdueCustomerInvoices.map((invoice) => (
              <TodoItem
                key={invoice.id}
                href={`/invoices/${invoice.id}` as Route}
                title={invoice.invoice_no || 'Faktura'}
                detail={`${invoice.daysOverdue} dagar sen • ${formatMoney(invoice.total, invoice.currency)}`}
                badge={`${invoice.daysOverdue} d`}
                tone="rose"
              />
            ))}
          </TodoSection>
        ) : null}

        <TodoSection
          id="todo-long-timers"
          title="Timers som verkar ha lämnats igång"
          description="Aktiva timers som rullat ovanligt länge utan stopp."
          emptyText="Inga timers ser fastnade ut."
        >
          {longRunningTimerAlerts.map((timer) => (
            <TodoItem
              key={timer.id}
              href={`/projects/${timer.project_id}?tab=time` as Route}
              title={timer.taskTitle ? `${timer.taskTitle}` : timer.projectTitle}
              detail={`${timer.projectTitle}${timer.taskTitle ? ' • aktiv uppgiftstimer' : ' • aktiv projekttimer'} i ${timer.runningHours} timmar`}
              badge={`${timer.runningHours} h`}
              tone="amber"
            />
          ))}
        </TodoSection>

        {seesAllFinanceSignals ? (
          <TodoSection
            id="todo-overdue-supplier-invoices"
            title="Leverantörsfakturor som riskerar att fastna"
            description="Öppna leverantörsfakturor som passerat förfallodagen."
            emptyText="Inga leverantörsfakturor är förfallna."
          >
            {overdueSupplierInvoices.map((invoice) => (
              <TodoItem
                key={invoice.id}
                href={'/payables' as Route}
                title={invoice.supplier_invoice_no || 'Leverantörsfaktura'}
                detail={`${invoice.daysOverdue} dagar sen • öppet ${formatMoney(invoice.open_amount, invoice.currency)}`}
                badge={`${invoice.daysOverdue} d`}
                tone="rose"
              />
            ))}
          </TodoSection>
        ) : null}

        {seesAllFinanceSignals ? (
          <TodoSection
            id="todo-verification-alerts"
            title="Verifikationer att kontrollera"
            description="Poster där appen hittar obalans eller saknat underlag."
            emptyText="Inga verifikationer kräver direkt kontroll."
          >
            {verificationAlerts.map((verification) => (
              <TodoItem
                key={verification.id}
                href={`/finance/verifications/${verification.id}` as Route}
                title={verificationNumberLabel(verification.fiscal_year, verification.verification_no)}
                detail={`${verification.description || 'Verifikation'} • ${verification.issues.join(' • ')}`}
                badge={verification.issues.length === 1 ? verification.issues[0] : `${verification.issues.length} flaggor`}
                tone="blue"
              />
            ))}
          </TodoSection>
        ) : null}
      </div>
    </section>
  );
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 flex-col items-start justify-between rounded-2xl border border-border/70 bg-card/80 p-3 text-left transition hover:border-primary/35 hover:bg-muted/15"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-muted/25 text-foreground/75">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </button>
  );
}

function QuickActionLink({
  icon: Icon,
  label,
  href
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: Route;
}) {
  return (
    <Link
      href={href}
      className="flex h-20 flex-col items-start justify-between rounded-2xl border border-border/70 bg-card/80 p-3 text-left transition hover:border-primary/35 hover:bg-muted/15"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-muted/25 text-foreground/75">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </Link>
  );
}

function TodoMetric({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
  href
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'amber' | 'rose';
  href?: string;
}) {
  const tones = {
    blue: 'border-sky-200/60 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20',
    amber: 'border-amber-200/60 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
    rose: 'border-rose-200/60 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
  } as const;

  const content = (
    <div className={`rounded-xl border p-4 ${tones[tone]} ${href ? 'transition hover:border-primary/35 hover:bg-muted/15' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-foreground/65">{detail}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground/70">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );

  if (href) {
    if (href.startsWith('#')) {
      return <a href={href} className="block">{content}</a>;
    }

    return (
      <Link href={href as Route} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

function TodoSection({
  id,
  title,
  description,
  emptyText,
  children
}: {
  id?: string;
  title: string;
  description: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;

  return (
    <Card id={id} className="scroll-mt-28">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-foreground/65">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {childCount > 0 ? children : <p className="text-sm text-foreground/65">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

function TodoItem({
  href,
  title,
  detail,
  badge,
  tone = 'blue'
}: {
  href: Route;
  title: string;
  detail: string;
  badge: string;
  tone?: 'blue' | 'amber' | 'rose';
}) {
  const badgeTone = {
    blue: 'border-sky-300/70 bg-sky-100/70 text-sky-900 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200',
    amber: 'border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200',
    rose: 'border-rose-300/70 bg-rose-100/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200'
  } as const;

  return (
    <Link href={href} className="block rounded-xl border border-border/70 bg-card/70 p-3 transition hover:border-primary/35 hover:bg-muted/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-foreground/65">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={badgeTone[tone]}>{badge}</Badge>
          <ArrowRight className="h-4 w-4 text-foreground/45" />
        </div>
      </div>
    </Link>
  );
}
