'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SimpleSelect from '@/components/ui/simple-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyMemberOptions } from '@/features/projects/projectQueries';
import { canViewFinance, canWriteFinance } from '@/lib/auth/capabilities';
import {
  buildInvoiceFollowupQueueReasons,
  buildOrderInvoicingQueueReasons,
  buildProjectInvoicingQueueReasons,
  getInvoiceReadinessLabel,
  getInvoiceReadinessOwner
} from '@/lib/finance/invoiceReadiness';
import { createInvoiceFromOrder } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

type InvoiceListRow = Pick<
  DbRow<'invoices'>,
  'id' | 'invoice_no' | 'kind' | 'status' | 'currency' | 'issue_date' | 'due_date' | 'total' | 'created_at' | 'project_id'
>;

type InvoiceTodoRow = {
  id: string;
  invoice_no: string;
  status: string;
  due_date: string;
  total: number;
  currency: string;
};

type InvoicingQueueStage =
  | 'ready_to_review'
  | 'waiting_for_approval'
  | 'approved_today'
  | 'sent'
  | 'awaiting_payment'
  | 'overdue';

type TimeGroupingMode = 'all' | 'person' | 'task';
type QueueFilter = 'all' | 'waiting_for_me' | 'overdue' | 'time_without_order' | 'completed_without_invoice';

type InvoicingQueueItem = {
  id: string;
  type: 'project' | 'order' | 'invoice';
  stage: InvoicingQueueStage;
  title: string;
  customerName: string;
  projectTitle: string;
  amount: number;
  statusLabel: string;
  nextStep: string;
  ownerLabel: string;
  href: Route;
  secondaryHref?: Route;
  meta: string;
  entityId: string;
  projectId?: string;
  reasons: string[];
  hasUnorderedBillableTime?: boolean;
  completedWithoutInvoice?: boolean;
};

type TimePreviewLine = {
  key: string;
  title: string;
  hours: number;
  unitPrice: number;
  total: number;
};

function fakturaStatusEtikett(status: string) {
  const map: Record<string, string> = {
    issued: 'Utfärdad',
    sent: 'Skickad',
    paid: 'Betald',
    void: 'Makulerad'
  };
  return map[status] ?? status;
}

function fakturaTypEtikett(kind: string) {
  return kind === 'credit_note' ? 'Kreditfaktura' : 'Faktura';
}

function stageLabel(stage: InvoicingQueueStage) {
  const map: Record<InvoicingQueueStage, string> = {
    ready_to_review: 'Redo att granska',
    waiting_for_approval: 'Väntar på fastställelse',
    approved_today: 'Fastställd',
    sent: 'Skickad',
    awaiting_payment: 'Väntar på betalning',
    overdue: 'Förfallen'
  };
  return map[stage];
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('sv-SE');
}

function money(value: number, currency = 'SEK') {
  return `${value.toFixed(2)} ${currency}`;
}

function queueFilterLabel(value: QueueFilter) {
  const map: Record<QueueFilter, string> = {
    all: 'Alla',
    waiting_for_me: 'Väntar på mig',
    overdue: 'Förfallna',
    time_without_order: 'Tid utan order',
    completed_without_invoice: 'Klara utan faktura'
  };
  return map[value];
}

function buildTimePreviewLines({
  entries,
  groupingMode,
  memberLabelByUserId,
  taskLabelById,
  inferredRate
}: {
  entries: Array<{ hours: number | null; user_id: string; task_id: string | null }>;
  groupingMode: TimeGroupingMode;
  memberLabelByUserId: Map<string, string>;
  taskLabelById: Map<string, string>;
  inferredRate: number;
}) {
  const totalHours = entries.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
  const grouped = new Map<string, { title: string; hours: number }>();

  for (const row of entries) {
    const hours = Number(row.hours ?? 0);
    if (hours <= 0) continue;

    let key = 'all';
    let title = `Fakturerbar tid ${totalHours.toFixed(2)} h`;

    if (groupingMode === 'person') {
      key = `person:${row.user_id}`;
      const label = memberLabelByUserId.get(row.user_id) ?? 'Okänd medlem';
      title = `Fakturerbar tid - ${label}`;
    } else if (groupingMode === 'task') {
      key = row.task_id ? `task:${row.task_id}` : 'task:none';
      const label = row.task_id ? taskLabelById.get(row.task_id) ?? 'Okänd uppgift' : 'Tid utan uppgift';
      title = `Fakturerbar tid - ${label}`;
    }

    const current = grouped.get(key) ?? { title, hours: 0 };
    current.hours += hours;
    current.title = title;
    grouped.set(key, current);
  }

  return Array.from(grouped.entries()).map(([key, group]) => ({
    key,
    title: groupingMode === 'all' ? `Fakturerbar tid ${group.hours.toFixed(2)} h` : `${group.title} ${group.hours.toFixed(2)} h`,
    hours: Math.round(group.hours * 100) / 100,
    unitPrice: inferredRate,
    total: Math.round(group.hours * inferredRate * 100) / 100
  }));
}

export default function InvoicesPage() {
  const { companyId, role, capabilities } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const canReadFinance = canViewFinance(role, capabilities);
  const canEditFinance = canWriteFinance(role, capabilities);
  const todayIso = new Date().toISOString().slice(0, 10);
  const memberOptionsQuery = useCompanyMemberOptions(companyId);
  const currentUserQuery = useQuery({
    queryKey: ['current-user-identity'],
    queryFn: async () => {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();
      if (error) throw error;
      return {
        id: user?.id ?? '',
        email: user?.email ?? null
      };
    },
    staleTime: 1000 * 60 * 10
  });
  const [timeDialogProjectId, setTimeDialogProjectId] = useState<string | null>(null);
  const [timeGroupingMode, setTimeGroupingMode] = useState<TimeGroupingMode>('all');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

  const query = useQuery<InvoiceListRow[]>({
    queryKey: ['invoices', companyId, 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,kind,status,currency,issue_date,due_date,total,created_at,project_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<InvoiceListRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoiceTodoQuery = useQuery<InvoiceTodoRow[]>({
    queryKey: ['finance-invoice-todo', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,status,due_date,total,currency')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(300)
        .returns<InvoiceTodoRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingProjectsQuery = useQuery({
    queryKey: ['finance-invoicing-projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,status,customer_id,responsible_user_id,invoice_readiness_status,updated_at')
        .eq('company_id', companyId)
        .in('invoice_readiness_status', ['ready_for_invoicing', 'approved_for_invoicing'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const completedProjectsQuery = useQuery({
    queryKey: ['finance-completed-projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,status,customer_id,responsible_user_id,invoice_readiness_status,updated_at')
        .eq('company_id', companyId)
        .eq('status', 'done')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingOrderLinesQuery = useQuery({
    queryKey: ['finance-invoicing-order-lines', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_lines')
        .select('order_id,total')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const billableTimeQuery = useQuery({
    queryKey: ['finance-billable-time-unordered', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('project_id,order_id,hours,is_billable,user_id,task_id')
        .eq('company_id', companyId)
        .eq('is_billable', true);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoiceSourcesQuery = useQuery({
    queryKey: ['finance-invoice-sources', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('project_id')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const financePlansQuery = useQuery({
    queryKey: ['finance-project-plans', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_finance_plans')
        .select('project_id,budget_hours,budget_revenue')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const projectTasksQuery = useQuery({
    queryKey: ['finance-project-tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,project_id,title')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingOrdersQuery = useQuery({
    queryKey: ['finance-invoicing-orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,order_no,status,invoice_readiness_status,total,created_at')
        .eq('company_id', companyId)
        .in('invoice_readiness_status', ['ready_for_invoicing', 'approved_for_invoicing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingCustomersQuery = useQuery({
    queryKey: ['finance-invoicing-customers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const approveOrderMutation = useMutation({
    mutationFn: async ({ orderId, projectId }: { orderId: string; projectId: string | null }) => {
      const { error: orderError } = await supabase
        .from('orders')
        .update({ invoice_readiness_status: 'approved_for_invoicing' })
        .eq('company_id', companyId)
        .eq('id', orderId);

      if (orderError) throw orderError;

      if (projectId) {
        const { error: projectError } = await supabase
          .from('projects')
          .update({ invoice_readiness_status: 'approved_for_invoicing' })
          .eq('company_id', companyId)
          .eq('id', projectId);

        if (projectError) throw projectError;
      }
    },
    onSuccess: async () => {
      toast.success('Order fastställd för fakturering');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte fastställa ordern')
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => createInvoiceFromOrder(orderId),
    onSuccess: async () => {
      toast.success('Faktura skapad');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura')
  });

  const markProjectReadyMutation = useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const { error } = await supabase
        .from('projects')
        .update({ invoice_readiness_status: 'ready_for_invoicing' })
        .eq('company_id', companyId)
        .eq('id', projectId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Projekt markerat redo för fakturering');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte markera projektet som redo')
  });

  const createOrderLineFromTimeMutation = useMutation({
    mutationFn: async ({ projectId, groupingMode }: { projectId: string; groupingMode: TimeGroupingMode }) => {
      const { data, error } = await supabase.rpc('create_order_lines_from_billable_time', {
        p_project_id: projectId,
        p_grouping_mode: groupingMode
      });

      if (error) throw error;

      const payload = (data ?? {}) as {
        order_id?: string;
        total_hours?: number;
        unit_price?: number;
        group_count?: number;
      };

      return {
        orderId: payload.order_id ?? '',
        totalHours: Number(payload.total_hours ?? 0),
        inferredRate: Number(payload.unit_price ?? 0),
        lineCount: Number(payload.group_count ?? 0)
      };
    },
    onSuccess: async ({ totalHours, inferredRate, lineCount }) => {
      toast.success(
        inferredRate > 0
          ? `${lineCount} orderrad(er) skapade från ${totalHours.toFixed(2)} h`
          : `${lineCount} orderrad(er) skapade från ${totalHours.toFixed(2)} h. Sätt pris innan fakturering.`
      );
      setTimeDialogProjectId(null);
      setTimeGroupingMode('all');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-order-lines', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-billable-time-unordered', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa orderrad från tid')
  });

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Fakturor är endast tillgängliga för ekonomi, admin eller revisor.</p>;
  }

  const rows = query.data ?? [];
  const issuedCount = rows.filter((row) => row.status === 'issued' || row.status === 'sent').length;
  const paidCount = rows.filter((row) => row.status === 'paid').length;
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const memberLabelByUserId = useMemo(
    () => new Map((memberOptionsQuery.data ?? []).map((member) => [member.user_id, member.display_name ?? member.email ?? member.user_id])),
    [memberOptionsQuery.data]
  );
  const currentUserId = currentUserQuery.data?.id ?? '';
  const taskLabelById = useMemo(
    () => new Map((projectTasksQuery.data ?? []).map((task) => [task.id, task.title])),
    [projectTasksQuery.data]
  );
  const timePreview = useMemo(() => {
    if (!timeDialogProjectId) {
      return { totalHours: 0, inferredRate: 0, lines: [] as TimePreviewLine[] };
    }

    const plan = (financePlansQuery.data ?? []).find((row) => row.project_id === timeDialogProjectId);
    const budgetHours = Number(plan?.budget_hours ?? 0);
    const budgetRevenue = Number(plan?.budget_revenue ?? 0);
    const inferredRate = budgetHours > 0 && budgetRevenue > 0 ? Math.round((budgetRevenue / budgetHours) * 100) / 100 : 0;
    const entries = (billableTimeQuery.data ?? []).filter(
      (row) => row.project_id === timeDialogProjectId && !row.order_id && row.is_billable
    );
    const totalHours = entries.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
    const lines = buildTimePreviewLines({
      entries,
      groupingMode: timeGroupingMode,
      memberLabelByUserId,
      taskLabelById,
      inferredRate
    });

    return { totalHours, inferredRate, lines };
  }, [billableTimeQuery.data, financePlansQuery.data, memberLabelByUserId, taskLabelById, timeDialogProjectId, timeGroupingMode]);

  const invoicingQueue = useMemo<InvoicingQueueItem[]>(() => {
    const customersById = new Map((invoicingCustomersQuery.data ?? []).map((customer) => [customer.id, customer.name]));
    const mergedProjects = [...(invoicingProjectsQuery.data ?? []), ...(completedProjectsQuery.data ?? [])];
    const projectsById = new Map(mergedProjects.map((project) => [project.id, project]));
    const queuedProjectIds = new Set((invoicingOrdersQuery.data ?? []).map((order) => order.project_id));
    const invoicedProjectIds = new Set((invoiceSourcesQuery.data ?? []).map((item) => item.project_id));
    const orderLineStats = (invoicingOrderLinesQuery.data ?? []).reduce(
      (map, row) => {
        const current = map.get(row.order_id) ?? { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(row.total ?? 0);
        map.set(row.order_id, current);
        return map;
      },
      new Map<string, { count: number; total: number }>()
    );
    const unorderedBillableHoursByProject = (billableTimeQuery.data ?? []).reduce((map, row) => {
      const shouldCount = !row.order_id;
      if (!shouldCount) return map;
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + Number(row.hours ?? 0));
      return map;
    }, new Map<string, number>());

    const projectItems = (invoicingProjectsQuery.data ?? [])
      .filter((project) => project.invoice_readiness_status === 'ready_for_invoicing' && !queuedProjectIds.has(project.id))
      .map((project) => {
        const unorderedBillableHours = unorderedBillableHoursByProject.get(project.id) ?? 0;
        const reasons = buildProjectInvoicingQueueReasons({
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? null : null,
          responsibleLabel: project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) ?? null : null,
          unorderedBillableHours
        });

        return {
          id: `project-${project.id}`,
          type: 'project' as const,
          stage: 'ready_to_review' as const,
          title: project.title,
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund',
          projectTitle: project.title,
          amount: 0,
          statusLabel: getInvoiceReadinessLabel(project.invoice_readiness_status),
          nextStep: 'Säkerställ orderunderlag',
          ownerLabel:
            (project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) : null)
            ?? getInvoiceReadinessOwner(project.invoice_readiness_status),
          href: `/projects/${project.id}?tab=economy` as Route,
          meta: 'Projekt • Redo att ses över',
          entityId: project.id,
          projectId: project.id,
          reasons,
          hasUnorderedBillableTime: unorderedBillableHours > 0,
          completedWithoutInvoice: false
        };
      });

    const completedNotReadyItems = (completedProjectsQuery.data ?? [])
      .filter((project) => !queuedProjectIds.has(project.id))
      .filter((project) => !invoicedProjectIds.has(project.id))
      .filter((project) => project.invoice_readiness_status === 'not_ready' || !project.invoice_readiness_status)
      .map((project) => {
        const unorderedBillableHours = unorderedBillableHoursByProject.get(project.id) ?? 0;
        const reasons = buildProjectInvoicingQueueReasons({
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? null : null,
          responsibleLabel: project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) ?? null : null,
          unorderedBillableHours,
          completedButNotReady: true
        });

        return {
          id: `completed-project-${project.id}`,
          type: 'project' as const,
          stage: 'ready_to_review' as const,
          title: project.title,
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund',
          projectTitle: project.title,
          amount: 0,
          statusLabel: 'Inte redo',
          nextStep: 'Markera redo eller bygg orderunderlag',
          ownerLabel:
            (project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) : null)
            ?? 'Projektansvarig',
          href: `/projects/${project.id}?tab=economy` as Route,
          meta: 'Projekt • Klart men ej förberett för fakturering',
          entityId: project.id,
          projectId: project.id,
          reasons,
          hasUnorderedBillableTime: unorderedBillableHours > 0,
          completedWithoutInvoice: true
        };
      });

    const orderItems = (invoicingOrdersQuery.data ?? []).map((order) => {
      const project = projectsById.get(order.project_id);
      const projectTitle = project?.title ?? 'Projekt';
      const customerName = project?.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
      const stage: InvoicingQueueStage =
        order.invoice_readiness_status === 'approved_for_invoicing' ? 'approved_today' : 'waiting_for_approval';
      const lineStats = orderLineStats.get(order.id) ?? { count: 0, total: 0 };
      const reasons = buildOrderInvoicingQueueReasons({
        customerName,
        lineCount: lineStats.count,
        orderTotal: Number(order.total ?? 0),
        waitingForApproval: stage === 'waiting_for_approval'
      });

      return {
        id: `order-${order.id}`,
        type: 'order' as const,
        stage,
        title: order.order_no ?? 'Order',
        customerName,
        projectTitle,
        amount: Number(order.total ?? 0),
        statusLabel: getInvoiceReadinessLabel(order.invoice_readiness_status),
        nextStep: stage === 'approved_today' ? 'Skapa faktura' : 'Granska och fastställ',
        ownerLabel: getInvoiceReadinessOwner(order.invoice_readiness_status),
        href: `/orders/${order.id}` as Route,
        secondaryHref: `/projects/${order.project_id}` as Route,
        meta: `Order • ${projectTitle}`,
        entityId: order.id,
        projectId: order.project_id,
        reasons,
        completedWithoutInvoice: false
      };
    });

    const invoiceItems = (invoiceTodoQuery.data ?? []).map((invoice) => {
      const overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date < todayIso;
      const unpaid = invoice.status !== 'paid' && invoice.status !== 'void';
      const stage: InvoicingQueueStage = overdue ? 'overdue' : unpaid ? 'awaiting_payment' : 'sent';
      const reasons = buildInvoiceFollowupQueueReasons({
        status: invoice.status,
        dueDate: invoice.due_date,
        todayIso
      });

      return {
        id: `invoice-${invoice.id}`,
        type: 'invoice' as const,
        stage,
        title: invoice.invoice_no,
        customerName: 'Kund via faktura',
        projectTitle: 'Faktura',
        amount: Number(invoice.total ?? 0),
        statusLabel: fakturaStatusEtikett(invoice.status),
        nextStep: overdue ? 'Följ upp betalning' : unpaid ? 'Vänta eller registrera betalning' : 'Ingen åtgärd',
        ownerLabel: overdue ? 'Ekonomi / admin' : unpaid ? 'Ekonomi' : 'Kund / ekonomi',
        href: `/invoices/${invoice.id}` as Route,
        meta: `Faktura • Förfallo ${formatDate(invoice.due_date)}`,
        entityId: invoice.id,
        reasons,
        completedWithoutInvoice: false
      };
    });

    return [...projectItems, ...completedNotReadyItems, ...orderItems, ...invoiceItems].sort((a, b) => b.amount - a.amount);
  }, [
    billableTimeQuery.data,
    completedProjectsQuery.data,
    invoiceSourcesQuery.data,
    invoiceTodoQuery.data,
    invoicingCustomersQuery.data,
    invoicingOrderLinesQuery.data,
    invoicingOrdersQuery.data,
    invoicingProjectsQuery.data,
    todayIso
  ]);

  const invoicingQueueByStage = useMemo(() => {
    const initial: Record<InvoicingQueueStage, InvoicingQueueItem[]> = {
      ready_to_review: [],
      waiting_for_approval: [],
      approved_today: [],
      sent: [],
      awaiting_payment: [],
      overdue: []
    };

    const filteredQueue = invoicingQueue.filter((item) => {
      if (queueFilter === 'all') return true;
      if (queueFilter === 'overdue') return item.stage === 'overdue';
      if (queueFilter === 'time_without_order') return item.type === 'project' && Boolean(item.hasUnorderedBillableTime);
      if (queueFilter === 'completed_without_invoice') return item.type === 'project' && Boolean(item.completedWithoutInvoice);
      if (queueFilter === 'waiting_for_me') {
        if (item.type === 'project') {
          if (!currentUserId) return item.stage === 'ready_to_review';
          return item.stage === 'ready_to_review' && item.projectId
            ? (invoicingProjectsQuery.data ?? []).some(
                (project) => project.id === item.projectId && project.responsible_user_id === currentUserId
              ) || (completedProjectsQuery.data ?? []).some(
                (project) => project.id === item.projectId && project.responsible_user_id === currentUserId
              )
            : false;
        }
        if (item.type === 'order') return item.stage === 'waiting_for_approval' || item.stage === 'approved_today';
        return item.stage === 'awaiting_payment' || item.stage === 'overdue';
      }
      return true;
    });

    for (const item of filteredQueue) initial[item.stage].push(item);
    return initial;
  }, [completedProjectsQuery.data, currentUserId, invoicingProjectsQuery.data, invoicingQueue, queueFilter]);

  const queueFilterOptions: Array<{ value: QueueFilter; label: string }> = [
    { value: 'all', label: 'Alla' },
    { value: 'waiting_for_me', label: 'Väntar på mig' },
    { value: 'overdue', label: 'Förfallna' },
    { value: 'time_without_order', label: 'Tid utan order' },
    { value: 'completed_without_invoice', label: 'Klara utan faktura' }
  ];

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <Receipt className="h-3.5 w-3.5" />
                <span>Fakturor</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Fakturaöversikt och faktureringskö</h1>
                <p className="text-sm text-foreground/65">
                  Här samlas både färdiga fakturor och sådant som väntar på fastställelse, fakturering eller betalningsuppföljning.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link href="/reports">Rapporter</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={'/help/fakturor-och-statusar' as Route}>Hjälp om fakturor</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <InvoiceMetricCard icon={Wallet} label="Totalt fakturavärde" value={`${totalValue.toFixed(2)} SEK`} />
            <InvoiceMetricCard icon={FileText} label="Öppna/utfärdade" value={String(issuedCount)} />
            <InvoiceMetricCard icon={Receipt} label="Betalda" value={String(paidCount)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Faktureringskö</CardTitle>
            <p className="text-sm text-foreground/60">Projekt, order och fakturor som kräver nästa steg i kundfakturaflödet.</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {queueFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={queueFilter === option.value ? 'default' : 'outline'}
                onClick={() => setQueueFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {queueFilter !== 'all' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-sm text-foreground/70">
                Visar filtrerad kö: <span className="font-medium text-foreground">{queueFilterLabel(queueFilter)}</span>
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setQueueFilter('all')}>
                Rensa filter
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'sent', 'awaiting_payment', 'overdue'] as InvoicingQueueStage[]).map((stage) => (
            <InvoiceMetricCard
              key={stage}
              icon={Wallet}
              label={stageLabel(stage)}
              value={String(invoicingQueueByStage[stage].length)}
            />
          ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'awaiting_payment', 'overdue', 'sent'] as InvoicingQueueStage[]).map((stage) => (
          <Card key={stage}>
            <CardHeader className="pb-3">
              <CardTitle>{stageLabel(stage)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoicingQueueByStage[stage].length === 0 ? (
                <p className="text-sm text-foreground/70">Inga ärenden i denna kolumn.</p>
              ) : (
                invoicingQueueByStage[stage].map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-muted/15 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-foreground/55">{item.meta}</p>
                      </div>
                      <Badge>{item.statusLabel}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <p><span className="text-foreground/55">Kund:</span> {item.customerName}</p>
                      <p><span className="text-foreground/55">Projekt:</span> {item.projectTitle}</p>
                      <p><span className="text-foreground/55">Belopp:</span> {money(item.amount)}</p>
                      <p><span className="text-foreground/55">Ägare nu:</span> {item.ownerLabel}</p>
                      <p><span className="text-foreground/55">Nästa steg:</span> {item.nextStep}</p>
                    </div>
                    {item.reasons.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.reasons.map((reason) => (
                          <Badge
                            key={reason}
                            className="border-border/70 bg-muted/40 text-foreground/75 hover:bg-muted/40"
                          >
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.type === 'project' && item.statusLabel === 'Inte redo' && canEditFinance ? (
                        <Button
                          size="sm"
                          onClick={() => markProjectReadyMutation.mutate({ projectId: item.entityId })}
                          disabled={markProjectReadyMutation.isPending}
                        >
                          Markera redo
                        </Button>
                      ) : null}
                      {item.type === 'order' && item.stage === 'waiting_for_approval' && canEditFinance ? (
                        <Button
                          size="sm"
                          onClick={() => approveOrderMutation.mutate({ orderId: item.entityId, projectId: item.projectId ?? null })}
                          disabled={approveOrderMutation.isPending}
                        >
                          Fastställ
                        </Button>
                      ) : null}
                      {item.type === 'order' && item.stage === 'approved_today' && canEditFinance ? (
                        <Button
                          size="sm"
                          onClick={() => createInvoiceMutation.mutate({ orderId: item.entityId })}
                          disabled={createInvoiceMutation.isPending}
                        >
                          Skapa faktura
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="secondary">
                        <Link href={item.href}>Öppna</Link>
                      </Button>
                      {item.type === 'project' ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/projects/${item.entityId}?tab=economy` as Route}>Öppna ekonomi</Link>
                        </Button>
                      ) : null}
                      {item.type === 'project' && item.hasUnorderedBillableTime ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setTimeDialogProjectId(item.entityId);
                            setTimeGroupingMode('all');
                          }}
                          disabled={createOrderLineFromTimeMutation.isPending}
                        >
                          Skapa orderrad från tid
                        </Button>
                      ) : null}
                      {item.type === 'project' && item.hasUnorderedBillableTime ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/projects/${item.entityId}?tab=time` as Route}>Gå till tid</Link>
                        </Button>
                      ) : null}
                      {item.secondaryHref ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={item.secondaryHref}>Projekt</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle>Senaste fakturor</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Fakturanr</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fakturadatum</TableHead>
                <TableHead>Förfallodatum</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Projekt</TableHead>
                <TableHead className="text-right">Åtgärder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !query.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-foreground/70">
                    Inga fakturor hittades.
                  </TableCell>
                </TableRow>
              )}

              {rows.map((row) => (
                <TableRow key={row.id} className="transition-colors hover:bg-muted/20">
                  <TableCell className="font-medium">{row.invoice_no}</TableCell>
                  <TableCell>
                    <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                      {fakturaTypEtikett(row.kind)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                      {fakturaStatusEtikett(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(row.issue_date).toLocaleDateString('sv-SE')}</TableCell>
                  <TableCell>{new Date(row.due_date).toLocaleDateString('sv-SE')}</TableCell>
                  <TableCell className="font-medium">
                    {Number(row.total).toFixed(2)} {row.currency}
                  </TableCell>
                  <TableCell>
                    <Link href={`/projects/${row.project_id}`} className="underline underline-offset-2">
                      Öppna projekt
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/invoices/${row.id}`}>Öppna</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/invoices/${row.id}/export?compact=1`}>JSON</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ActionSheet
        open={Boolean(timeDialogProjectId)}
        onClose={() => {
          setTimeDialogProjectId(null);
          setTimeGroupingMode('all');
        }}
        title="Skapa orderrad från tid"
        description="Välj hur den okopplade fakturerbara tiden ska grupperas till orderrader."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Grouping</p>
            <SimpleSelect
              value={timeGroupingMode}
              onValueChange={(value) => setTimeGroupingMode(value as TimeGroupingMode)}
              options={[
                { value: 'all', label: 'En rad för all tid' },
                { value: 'person', label: 'En rad per medlem' },
                { value: 'task', label: 'En rad per uppgift' }
              ]}
            />
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm text-foreground/75">
            {timeGroupingMode === 'all'
              ? 'All okopplad fakturerbar tid läggs i en enda orderrad.'
              : timeGroupingMode === 'person'
                ? 'Tiden delas upp i separata orderrader per medlem.'
                : 'Tiden delas upp i separata orderrader per uppgift. Tid utan uppgift får en egen rad.'}
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Förhandsvisning</p>
              <p className="text-xs text-foreground/60">
                {timePreview.totalHours.toFixed(2)} h • {money(timePreview.inferredRate)}/h
              </p>
            </div>
            {timePreview.lines.length === 0 ? (
              <p className="mt-3 text-sm text-foreground/65">Ingen okopplad fakturerbar tid hittades för projektet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {timePreview.lines.map((line) => (
                  <div key={line.key} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{line.title}</p>
                        <p className="text-xs text-foreground/60">
                          {line.hours.toFixed(2)} h × {money(line.unitPrice)}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium">{money(line.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (!timeDialogProjectId) return;
                createOrderLineFromTimeMutation.mutate({ projectId: timeDialogProjectId, groupingMode: timeGroupingMode });
              }}
              disabled={createOrderLineFromTimeMutation.isPending || !timeDialogProjectId || timePreview.lines.length === 0}
            >
              Skapa orderrader
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setTimeDialogProjectId(null);
                setTimeGroupingMode('all');
              }}
            >
              Avbryt
            </Button>
          </div>
        </div>
      </ActionSheet>
    </section>
  );
}

function InvoiceMetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-foreground/65">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
