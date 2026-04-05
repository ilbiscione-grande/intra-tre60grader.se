'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, BriefcaseBusiness, Camera, CheckCircle2, CheckSquare2, Clock3, FileWarning, FilePlus2, ReceiptText, ShieldAlert, Timer, Wallet } from 'lucide-react';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

type FinancePipelineProjectRow = {
  id: string;
  title: string;
  status: string | null;
  customer_id: string | null;
  responsible_user_id: string | null;
  invoice_readiness_status: string | null;
};

type FinancePipelineOrderRow = {
  id: string;
  project_id: string;
  order_no: string | null;
  total: number;
  status: string | null;
  order_kind: string | null;
  invoice_readiness_status: string | null;
};

type CustomerNameRow = {
  id: string;
  name: string;
};

type MemberOptionRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type PipelineItem = {
  id: string;
  title: string;
  detail: string;
  badge: string;
  priority: 'high' | 'medium' | 'low';
  blockerLabel?: string;
  ownerLabel: string;
  ownerScope: 'project' | 'finance' | 'admin' | 'team';
  waitingOnCurrentUser: boolean;
  href: Route;
  tone: 'blue' | 'amber' | 'rose' | 'emerald';
};

type PipelineStageSummary = {
  id: string;
  title: string;
  description: string;
  count: number;
  items: PipelineItem[];
  emptyText: string;
  tone: 'blue' | 'amber' | 'rose' | 'emerald';
  href: Route;
  ctaLabel?: string;
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

function orderKindLabel(orderKind: string | null) {
  if (orderKind === 'change') return 'Ändringsorder';
  if (orderKind === 'supplement') return 'Tilläggsorder';
  return 'Huvudorder';
}

export default function TodoPage() {
  const { companyId, role, capabilities } = useAppContext();
  const queryClient = useQueryClient();
  const mode = useBreakpointMode();
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();
  const canReadFinance = canViewFinance(role, capabilities);
  const seesAllProjectSignals = role === 'admin';
  const seesAllFinanceSignals = role === 'admin' || role === 'finance';
  const supabase = useMemo(() => createClient(), []);
  const today = startOfToday();
  const now = new Date();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'waiting_for_me'>('all');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [updateContent, setUpdateContent] = useState('');
  const [submitting, setSubmitting] = useState<null | 'task' | 'update'>(null);

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

  const financePipelineProjectsQuery = useQuery<FinancePipelineProjectRow[]>({
    queryKey: ['todo-finance-pipeline-projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,status,customer_id,responsible_user_id,invoice_readiness_status')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false })
        .limit(150)
        .returns<FinancePipelineProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const financePipelineOrdersQuery = useQuery<FinancePipelineOrderRow[]>({
    queryKey: ['todo-finance-pipeline-orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,order_no,total,status,order_kind,invoice_readiness_status')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(150)
        .returns<FinancePipelineOrderRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const companyPriorityThresholdQuery = useQuery<number>({
    queryKey: ['todo-company-invoice-priority-threshold', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('invoice_priority_threshold')
        .eq('id', companyId)
        .maybeSingle<{ invoice_priority_threshold: number | null }>();

      if (error) throw error;
      return Number(data?.invoice_priority_threshold ?? 10000);
    },
    enabled: canReadFinance
  });

  const customersQuery = useQuery<CustomerNameRow[]>({
    queryKey: ['todo-finance-pipeline-customers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .returns<CustomerNameRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const memberOptionsQuery = useQuery<MemberOptionRow[]>({
    queryKey: ['todo-member-options', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_company_member_options', { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as MemberOptionRow[];
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
  const financePipelineProjectById = useMemo(
    () => new Map((financePipelineProjectsQuery.data ?? []).map((project) => [project.id, project])),
    [financePipelineProjectsQuery.data]
  );
  const customerNameById = useMemo(
    () => new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer.name])),
    [customersQuery.data]
  );
  const memberLabelByUserId = useMemo(
    () =>
      new Map(
        (memberOptionsQuery.data ?? []).map((member) => [
          member.user_id,
          member.display_name?.trim() || member.email?.trim() || member.user_id
        ])
      ),
    [memberOptionsQuery.data]
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

  const pipelineWorkItems = useMemo<PipelineItem[]>(() => {
    return [
      ...overdueTaskAlerts.slice(0, 3).map((task) => ({
        id: `work-task-${task.id}`,
        title: task.title,
        detail: `${task.projectTitle} • ${task.daysLate} dagar sen`,
        badge: `${task.daysLate} d`,
        priority: 'high' as const,
        blockerLabel: 'Försenad uppgift',
        ownerLabel:
          task.assignee_user_id && memberLabelByUserId.get(task.assignee_user_id)
            ? memberLabelByUserId.get(task.assignee_user_id) as string
            : 'Projektteam',
        ownerScope: task.assignee_user_id ? ('project' as const) : ('team' as const),
        waitingOnCurrentUser: Boolean(
          currentUserId && (task.assignee_user_id === currentUserId || task.created_by === currentUserId)
        ),
        href: `/projects/${task.project_id}?tab=tasks` as Route,
        tone: 'rose' as const
      })),
      ...projectDeadlineAlerts.slice(0, 3).map((project) => ({
        id: `work-project-${project.id}`,
        title: project.title,
        detail: `Över slutdatum med ${project.daysLate} dagar`,
        badge: `${project.daysLate} d`,
        priority: 'high' as const,
        blockerLabel: 'Projekt över slutdatum',
        ownerLabel:
          project.responsible_user_id && memberLabelByUserId.get(project.responsible_user_id)
            ? memberLabelByUserId.get(project.responsible_user_id) as string
            : 'Projektansvarig',
        ownerScope: 'project' as const,
        waitingOnCurrentUser: Boolean(currentUserId && project.responsible_user_id === currentUserId),
        href: `/projects/${project.id}` as Route,
        tone: 'rose' as const
      })),
      ...longRunningTimerAlerts.slice(0, 2).map((timer) => ({
        id: `work-timer-${timer.id}`,
        title: timer.taskTitle ?? timer.projectTitle,
        detail: `${timer.projectTitle} • timer aktiv i ${timer.runningHours} timmar`,
        badge: `${timer.runningHours} h`,
        priority: 'medium' as const,
        blockerLabel: 'Lång aktiv timer',
        ownerLabel: 'Projektteam',
        ownerScope: 'team' as const,
        waitingOnCurrentUser: false,
        href: `/projects/${timer.project_id}?tab=time` as Route,
        tone: 'amber' as const
      }))
    ];
  }, [currentUserId, longRunningTimerAlerts, memberLabelByUserId, overdueTaskAlerts, projectDeadlineAlerts]);

  const pipelinePreparationItems = useMemo<PipelineItem[]>(() => {
    if (!canReadFinance) return [];

    const activeInvoiceProjectIds = new Set(
      (financePipelineOrdersQuery.data ?? [])
        .filter((order) => order.status !== 'cancelled')
        .map((order) => order.project_id)
    );

    return (financePipelineProjectsQuery.data ?? [])
      .filter((project) => project.status === 'done')
      .filter((project) => !activeInvoiceProjectIds.has(project.id))
      .filter((project) => project.invoice_readiness_status === 'not_ready' || !project.invoice_readiness_status)
      .map((project) => ({
        id: `prep-${project.id}`,
        title: project.title,
        detail: `${project.customer_id ? customerNameById.get(project.customer_id) ?? 'Kund saknas' : 'Kund saknas'} • klart men inte redo för fakturering`,
        badge: 'Förbered underlag',
        priority: 'high' as const,
        blockerLabel: 'Projektet är klart men inte markerat redo',
        ownerLabel:
          project.responsible_user_id && memberLabelByUserId.get(project.responsible_user_id)
            ? memberLabelByUserId.get(project.responsible_user_id) as string
            : 'Projektansvarig',
        ownerScope: 'project' as const,
        waitingOnCurrentUser: Boolean(currentUserId && project.responsible_user_id === currentUserId),
        href: `/billing?queue=completed_without_invoice&blocker=Projektet%20%C3%A4r%20klart%20men%20inte%20markerat%20redo` as Route,
        tone: 'amber' as const
      }))
      ;
  }, [canReadFinance, currentUserId, customerNameById, financePipelineOrdersQuery.data, financePipelineProjectsQuery.data, memberLabelByUserId]);

  const pipelineApprovalItems = useMemo<PipelineItem[]>(() => {
    if (!canReadFinance) return [];

    return (financePipelineOrdersQuery.data ?? [])
      .filter((order) => order.invoice_readiness_status === 'ready_for_invoicing' || order.invoice_readiness_status === 'approved_for_invoicing')
      .map((order) => {
        const project = financePipelineProjectById.get(order.project_id);
        const customerName = project?.customer_id ? customerNameById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
        const typeLabel = orderKindLabel(order.order_kind);
        const invoicePriorityThreshold = Number(companyPriorityThresholdQuery.data ?? 10000);
        const isLargeVariantValue =
          (order.order_kind === 'change' || order.order_kind === 'supplement') &&
          Number(order.total ?? 0) >= invoicePriorityThreshold;
        const nextStep = order.invoice_readiness_status === 'approved_for_invoicing'
          ? (order.order_kind === 'change'
              ? 'Skapa ändringsfaktura'
              : order.order_kind === 'supplement'
                ? 'Skapa faktura för tillägg'
                : 'Färdig att fakturera')
          : (order.order_kind === 'change'
              ? 'Granska ändringen och fastställ'
              : order.order_kind === 'supplement'
                ? 'Granska tillägget och fastställ'
                : 'Väntar på fastställelse');

        return {
          id: `approval-${order.id}`,
          title: order.order_no ?? typeLabel,
          detail: `${typeLabel} • ${project?.title ?? 'Projekt'} • ${customerName}`,
          badge: isLargeVariantValue ? 'Hög prioritet' : nextStep,
          priority: isLargeVariantValue ? 'high' as const : order.invoice_readiness_status === 'approved_for_invoicing' ? 'medium' as const : 'high' as const,
          blockerLabel:
            order.invoice_readiness_status === 'approved_for_invoicing'
              ? undefined
              : 'Väntar på fastställelse',
          ownerLabel: order.invoice_readiness_status === 'approved_for_invoicing' ? 'Ekonomi / admin' : 'Ekonomi',
          ownerScope:
            order.invoice_readiness_status === 'approved_for_invoicing'
              ? (role === 'admin' ? ('admin' as const) : ('finance' as const))
              : ('finance' as const),
          waitingOnCurrentUser: role === 'admin' || role === 'finance',
          href:
            (order.invoice_readiness_status === 'approved_for_invoicing'
              ? '/billing?queue=waiting_for_me'
              : '/billing?queue=waiting_for_me&blocker=V%C3%A4ntar%20p%C3%A5%20fastst%C3%A4llelse') as Route,
          tone: isLargeVariantValue
            ? ('amber' as const)
            : order.invoice_readiness_status === 'approved_for_invoicing'
              ? ('emerald' as const)
              : ('blue' as const)
        };
      })
      .sort((a, b) => {
        const aHighPriority = a.badge === 'Hög prioritet' ? 1 : 0;
        const bHighPriority = b.badge === 'Hög prioritet' ? 1 : 0;
        if (aHighPriority !== bHighPriority) return bHighPriority - aHighPriority;
        const sourceA = financePipelineOrdersQuery.data?.find((order) => `approval-${order.id}` === a.id);
        const sourceB = financePipelineOrdersQuery.data?.find((order) => `approval-${order.id}` === b.id);
        return Number(sourceB?.total ?? 0) - Number(sourceA?.total ?? 0);
      })
      ;
  }, [canReadFinance, companyPriorityThresholdQuery.data, customerNameById, financePipelineOrdersQuery.data, financePipelineProjectById, role]);

  const pipelinePaymentItems = useMemo<PipelineItem[]>(() => {
    if (!canReadFinance) return [];

    const overdueItems = overdueCustomerInvoices.map((invoice) => ({
      id: `payment-overdue-${invoice.id}`,
      title: invoice.invoice_no || 'Faktura',
      detail: `${invoice.daysOverdue} dagar sen • ${formatMoney(invoice.total, invoice.currency)}`,
      badge: `${invoice.daysOverdue} d`,
      priority: 'high' as const,
      blockerLabel: 'Förfallen faktura',
      ownerLabel: 'Ekonomi / admin',
      ownerScope: role === 'admin' ? ('admin' as const) : ('finance' as const),
      waitingOnCurrentUser: role === 'admin' || role === 'finance',
      href: '/billing?queue=overdue&blocker=F%C3%B6rfallen%20faktura' as Route,
      tone: 'rose' as const
    }));

    const awaitingItems = (invoicesQuery.data ?? [])
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
      .filter((invoice) => new Date(invoice.due_date) >= today)
      .slice(0, 4)
      .map((invoice) => ({
        id: `payment-open-${invoice.id}`,
        title: invoice.invoice_no || 'Faktura',
        detail: `Förfaller ${invoice.due_date} • ${formatMoney(invoice.total, invoice.currency)}`,
        badge: 'Väntar på betalning',
        priority: 'medium' as const,
        ownerLabel: 'Ekonomi',
        ownerScope: 'finance' as const,
        waitingOnCurrentUser: role === 'admin' || role === 'finance',
        href: '/billing?queue=waiting_for_me' as Route,
        tone: 'blue' as const
      }));

    return [...overdueItems, ...awaitingItems];
  }, [canReadFinance, invoicesQuery.data, overdueCustomerInvoices, role, today]);

  const pipelineStages = useMemo<PipelineStageSummary[]>(
    () => [
      {
        id: 'work',
        title: '1. Arbete',
        description: 'Saker som måste bli klara innan underlaget kan lämnas över.',
        count: pipelineWorkItems.length,
        items: pipelineWorkItems,
        emptyText: 'Inget arbete blockerar flödet just nu.',
        tone: 'amber' as const,
        href: '/projects' as Route,
        ctaLabel: 'Öppna projekt'
      },
      {
        id: 'prep',
        title: '2. Underlag',
        description: 'Klara projekt som fortfarande behöver förberedas för fakturering.',
        count: pipelinePreparationItems.length,
        items: pipelinePreparationItems,
        emptyText: 'Inga klara projekt väntar på underlag just nu.',
        tone: 'blue' as const,
        href: '/billing?queue=completed_without_invoice&blocker=Projektet%20%C3%A4r%20klart%20men%20inte%20markerat%20redo' as Route,
        ctaLabel: 'Öppna i Fakturering'
      },
      {
        id: 'approval',
        title: '3. Fastställ / fakturera',
        description: 'Order som väntar på ekonomi eller redan är godkända för faktura.',
        count: pipelineApprovalItems.length,
        items: pipelineApprovalItems,
        emptyText: 'Ingen order väntar på fastställelse eller fakturering just nu.',
        tone: 'emerald' as const,
        href: '/billing?queue=waiting_for_me&blocker=V%C3%A4ntar%20p%C3%A5%20fastst%C3%A4llelse' as Route,
        ctaLabel: 'Öppna i Fakturering'
      },
      {
        id: 'payment',
        title: '4. Betalning',
        description: 'Fakturor som väntar på betalning eller redan är förfallna.',
        count: pipelinePaymentItems.length,
        items: pipelinePaymentItems,
        emptyText: 'Inga fakturor väntar på uppföljning just nu.',
        tone: 'rose' as const,
        href: '/billing?queue=overdue&blocker=F%C3%B6rfallen%20faktura' as Route,
        ctaLabel: 'Öppna i Fakturering'
      }
    ],
    [
      invoicesQuery.data,
      longRunningTimerAlerts.length,
      overdueCustomerInvoices.length,
      overdueTaskAlerts.length,
      pipelineApprovalItems,
      pipelinePaymentItems,
      pipelinePreparationItems,
      pipelineWorkItems,
      projectDeadlineAlerts.length,
      today
    ]
  );

  const filteredPipelineStages = useMemo(
    () =>
      pipelineStages.map((stage) => {
        const items = pipelineFilter === 'waiting_for_me'
          ? stage.items.filter((item) => item.waitingOnCurrentUser)
          : stage.items;

        return {
          ...stage,
          items,
          count: pipelineFilter === 'waiting_for_me' ? items.length : stage.count
        };
      }),
    [pipelineFilter, pipelineStages]
  );
  const myPipelineFocusItems = useMemo(() => {
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

    return pipelineStages
      .flatMap((stage) =>
        stage.items
          .filter((item) => item.waitingOnCurrentUser)
          .map((item) => ({
            ...item,
            stageTitle: stage.title,
            stageHref: stage.href
          }))
      )
      .sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.title.localeCompare(b.title, 'sv');
      })
      .slice(0, 6);
  }, [pipelineStages]);
  const myPipelineFocusSummary = useMemo(() => {
    return {
      project: myPipelineFocusItems.filter((item) => item.ownerScope === 'project').length,
      finance: myPipelineFocusItems.filter((item) => item.ownerScope === 'finance').length,
      admin: myPipelineFocusItems.filter((item) => item.ownerScope === 'admin').length,
      team: myPipelineFocusItems.filter((item) => item.ownerScope === 'team').length,
      high: myPipelineFocusItems.filter((item) => item.priority === 'high').length
    };
  }, [myPipelineFocusItems]);
  const invoicePriorityThreshold = Number(companyPriorityThresholdQuery.data ?? 10000);

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
  const projectOptions = visibleProjects.map((project) => ({
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

  function handleQuickAction(actionId: string, href?: Route) {
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
      window.location.href = href;
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

      await queryClient.invalidateQueries({ queryKey: ['todo-project-tasks', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
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

      await queryClient.invalidateQueries({ queryKey: ['todo-project-watch', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['project-updates', companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-updates-activity', companyId, selectedProjectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-activity-summaries', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
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
                <QuickActionButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => handleQuickAction(item.id, item.href as Route | undefined)}
                />
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
                <QuickActionButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => handleQuickAction(item.id, item.href as Route | undefined)}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </section>

      <ActionSheet open={taskDialogOpen} onClose={resetTaskDialog} title="Ny uppgift" description="Välj projekt och lägg till en uppgift direkt.">
        <div className="space-y-4">
          <ProjectSelectField projectOptions={projectOptions} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Titel</label>
            <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Vad ska göras?" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Beskrivning</label>
            <Textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Valfri beskrivning" rows={4} />
          </div>
          <Button type="button" onClick={submitTask} disabled={submitting === 'task' || projectOptions.length === 0} className="w-full">
            {submitting === 'task' ? 'Skapar...' : 'Skapa uppgift'}
          </Button>
        </div>
      </ActionSheet>

      <ActionSheet open={updateDialogOpen} onClose={resetUpdateDialog} title="Ny uppdatering" description="Välj projekt och skriv uppdateringen direkt här.">
        <div className="space-y-4">
          <ProjectSelectField projectOptions={projectOptions} selectedProjectId={selectedProjectId} setSelectedProjectId={setSelectedProjectId} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Uppdatering</label>
            <Textarea value={updateContent} onChange={(event) => setUpdateContent(event.target.value)} placeholder="Skriv en projektuppdatering" rows={5} />
          </div>
          <Button type="button" onClick={submitUpdate} disabled={submitting === 'update' || projectOptions.length === 0} className="w-full">
            {submitting === 'update' ? 'Sparar...' : 'Skapa uppdatering'}
          </Button>
        </div>
      </ActionSheet>
      </>
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
              {canReadFinance ? <Button variant="outline" asChild><Link href={'/billing' as Route}>Fakturering</Link></Button> : null}
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

      <Card className="border-border/70 bg-gradient-to-br from-card via-card to-muted/10">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Väntar på mig nu</CardTitle>
              <p className="mt-1 text-sm text-foreground/65">
                Personlig sammanställning över det som just nu väntar på ditt nästa steg i arbete, underlag, fastställelse eller betalning.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                {myPipelineFocusItems.length} prioriterade ärenden
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setPipelineFilter('waiting_for_me')}>
                Filtrera pipeline på mig
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
              {myPipelineFocusSummary.high} hög prioritet
            </Badge>
            {myPipelineFocusSummary.project > 0 ? (
              <Badge className="border-sky-300/70 bg-sky-100/70 text-sky-900 hover:bg-sky-100/70 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200">
                {myPipelineFocusSummary.project} projektansvar
              </Badge>
            ) : null}
            {myPipelineFocusSummary.finance > 0 ? (
              <Badge className="border-emerald-300/70 bg-emerald-100/70 text-emerald-900 hover:bg-emerald-100/70 dark:border-emerald-900/50 dark:bg-emerald-500/15 dark:text-emerald-200">
                {myPipelineFocusSummary.finance} ekonomi
              </Badge>
            ) : null}
            {myPipelineFocusSummary.admin > 0 ? (
              <Badge className="border-violet-300/70 bg-violet-100/70 text-violet-900 hover:bg-violet-100/70 dark:border-violet-900/50 dark:bg-violet-500/15 dark:text-violet-200">
                {myPipelineFocusSummary.admin} admin
              </Badge>
            ) : null}
            {myPipelineFocusSummary.team > 0 ? (
              <Badge className="border-amber-300/70 bg-amber-100/70 text-amber-900 hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200">
                {myPipelineFocusSummary.team} team
              </Badge>
            ) : null}
          </div>

          {myPipelineFocusItems.length > 0 ? (
            myPipelineFocusItems.map((item) => (
              <TodoItem
                key={item.id}
                href={item.href}
                title={item.title}
                detail={`${item.stageTitle} • ${item.detail} • Ägare: ${item.ownerLabel}`}
                badge={item.blockerLabel ?? item.badge}
                tone={item.tone}
                priority={item.priority}
              />
            ))
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
              <p className="text-sm text-foreground/70">Inget ligger explicit och väntar på dig just nu i pipelinen.</p>
            </div>
          )}

          <div>
            <Button asChild variant="ghost" className="w-full justify-between rounded-xl">
              <Link href={'/billing?queue=waiting_for_me' as Route}>
                Öppna min kö i Fakturering
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-gradient-to-br from-card via-card to-muted/10">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Projekt till betalning</CardTitle>
              <p className="mt-1 text-sm text-foreground/65">
                En sammanhållen pipeline från arbete till fakturering och betalningsuppföljning.
              </p>
              {canReadFinance ? (
                <p className="mt-1 text-xs text-foreground/55">
                  Hög prioritet för ändrings- och tilläggsordrar markeras från {formatMoney(invoicePriorityThreshold)}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={pipelineFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setPipelineFilter('all')}
              >
                Alla
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pipelineFilter === 'waiting_for_me' ? 'default' : 'outline'}
                onClick={() => setPipelineFilter('waiting_for_me')}
              >
                Väntar på mig
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-4">
          {filteredPipelineStages.map((stage) => (
            <PipelineStageCard
              key={stage.id}
              title={stage.title}
              description={stage.description}
              count={stage.count}
              items={stage.items}
              emptyText={stage.emptyText}
              tone={stage.tone}
              href={stage.href}
            />
          ))}
        </CardContent>
      </Card>

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

function PipelineStageCard({
  title,
  description,
  count,
  items,
  emptyText,
  tone,
  href,
  ctaLabel
}: {
  title: string;
  description: string;
  count: number;
  items: PipelineItem[];
  emptyText: string;
  tone: 'blue' | 'amber' | 'rose' | 'emerald';
  href: Route;
  ctaLabel?: string;
}) {
  const toneClasses = {
    blue: 'border-sky-200/60 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/15',
    amber: 'border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/15',
    rose: 'border-rose-200/60 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15',
    emerald: 'border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15'
  } as const;

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm text-foreground/65">{description}</p>
        </div>
        <Badge className="border-border/70 bg-card/80 text-foreground/85 hover:bg-card/80">{count}</Badge>
      </div>

      <div className="mt-4 space-y-2">
        {items.length > 0 ? (
          items.slice(0, 4).map((item) => (
            <TodoItem
              key={item.id}
              href={item.href}
              title={item.title}
              detail={`${item.detail} • Ägare: ${item.ownerLabel}`}
              badge={item.blockerLabel ?? item.badge}
              tone={item.tone}
              priority={item.priority}
            />
          ))
        ) : (
          <p className="text-sm text-foreground/65">{emptyText}</p>
        )}
      </div>

      <div className="mt-3">
        <Button asChild variant="ghost" className="w-full justify-between rounded-xl">
          <Link href={href}>
            {ctaLabel ?? (href.startsWith('/invoices') ? 'Öppna i fakturakö' : href.startsWith('/billing') ? 'Öppna i Fakturering' : 'Öppna steg')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
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
  tone = 'blue',
  priority = 'medium'
}: {
  href: Route;
  title: string;
  detail: string;
  badge: string;
  tone?: 'blue' | 'amber' | 'rose' | 'emerald';
  priority?: 'high' | 'medium' | 'low';
}) {
  const badgeTone = {
    blue: 'border-sky-300/70 bg-sky-100/70 text-sky-900 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200',
    amber: 'border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200',
    rose: 'border-rose-300/70 bg-rose-100/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200',
    emerald: 'border-emerald-300/70 bg-emerald-100/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-500/15 dark:text-emerald-200'
  } as const;
  const priorityTone = {
    high: 'border-rose-300/70 bg-rose-100/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200',
    medium: 'border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200',
    low: 'border-slate-300/70 bg-slate-100/70 text-slate-900 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200'
  } as const;
  const priorityLabel = priority === 'high' ? 'Hög prioritet' : priority === 'medium' ? 'Nästa steg' : 'Översikt';

  return (
    <Link href={href} className="block rounded-xl border border-border/70 bg-card/70 p-3 transition hover:border-primary/35 hover:bg-muted/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-foreground/65">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={priorityTone[priority]}>{priorityLabel}</Badge>
          <Badge className={badgeTone[tone]}>{badge}</Badge>
          <ArrowRight className="h-4 w-4 text-foreground/45" />
        </div>
      </div>
    </Link>
  );
}
