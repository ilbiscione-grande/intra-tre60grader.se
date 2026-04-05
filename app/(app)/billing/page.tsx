'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare2, FileText, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import SimpleSelect from '@/components/ui/simple-select';
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

type InvoicingQueueStage =
  | 'ready_to_review'
  | 'waiting_for_approval'
  | 'approved_today'
  | 'sent'
  | 'awaiting_payment'
  | 'overdue';

type QueueFilter = 'all' | 'waiting_for_me' | 'completed_without_invoice' | 'overdue';
type OrderKind = 'primary' | 'change' | 'supplement';
type PriorityLevel = 'high' | 'medium' | 'low';
type TimeGroupingMode = 'all' | 'person' | 'task';

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
  blockers?: string[];
  waitingOn?: string[];
  readySignals?: string[];
  infoSignals?: string[];
  orderKind?: string | null;
  hasUnorderedBillableTime?: boolean;
  completedWithoutInvoice?: boolean;
};

type InvoiceTodoRow = {
  id: string;
  invoice_no: string;
  status: string;
  due_date: string;
  total: number;
  currency: string;
};

type TimePreviewLine = {
  key: string;
  title: string;
  hours: number;
  unitPrice: number;
  total: number;
};

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

function money(value: number, currency = 'SEK') {
  return `${value.toFixed(2)} ${currency}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('sv-SE');
}

function queueFilterLabel(value: QueueFilter) {
  const map: Record<QueueFilter, string> = {
    all: 'Alla',
    waiting_for_me: 'Väntar på mig',
    completed_without_invoice: 'Klara utan faktura',
    overdue: 'Förfallna'
  };
  return map[value];
}

function toFilterKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function orderKindLabel(kind?: string | null) {
  if (kind === 'change') return 'Ändringsorder';
  if (kind === 'supplement') return 'Tilläggsorder';
  if (kind === 'primary') return 'Huvudorder';
  return 'Order';
}

function orderKindBadgeClass(kind?: string | null) {
  if (kind === 'change') {
    return 'border-violet-200/80 bg-violet-100/80 text-violet-900 hover:bg-violet-100/80 dark:border-violet-900/70 dark:bg-violet-950/60 dark:text-violet-200';
  }
  if (kind === 'supplement') {
    return 'border-cyan-200/80 bg-cyan-100/80 text-cyan-900 hover:bg-cyan-100/80 dark:border-cyan-900/70 dark:bg-cyan-950/60 dark:text-cyan-200';
  }
  return 'border-slate-200/80 bg-slate-100/80 text-slate-800 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

function orderKindQueueReason(kind?: string | null, stage?: InvoicingQueueStage) {
  if (kind === 'change') {
    return stage === 'approved_today'
      ? 'Ändringsorder fastställd och redo att faktureras'
      : 'Ändringsorder väntar på granskning och fastställelse';
  }
  if (kind === 'supplement') {
    return stage === 'approved_today'
      ? 'Tilläggsorder fastställd och redo att faktureras'
      : 'Tilläggsorder väntar på granskning och fastställelse';
  }
  return null;
}

function classifyReason(reason: string): 'blocker' | 'waiting' | 'ready' | 'info' {
  const normalized = reason.toLowerCase();

  if (
    normalized.includes('saknas') ||
    normalized.includes('värde är 0') ||
    normalized.includes('klart men inte markerat redo')
  ) {
    return 'blocker';
  }

  if (
    normalized.includes('väntar') ||
    normalized.includes('obetald') ||
    normalized.includes('fakturerbar tid')
  ) {
    return 'waiting';
  }

  if (
    normalized.includes('kan nu') ||
    normalized.includes('fastställd') ||
    normalized.includes('redo att faktureras')
  ) {
    return 'ready';
  }

  return 'info';
}

function reasonBadgeClass(kind: 'blocker' | 'waiting' | 'ready' | 'info') {
  const map = {
    blocker: 'border-rose-300/80 bg-rose-100/80 text-rose-900 hover:bg-rose-100/80 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200',
    waiting: 'border-amber-300/80 bg-amber-100/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200',
    ready: 'border-emerald-300/80 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200',
    info: 'border-border/70 bg-muted/40 text-foreground/75 hover:bg-muted/40'
  } as const;

  return map[kind];
}

function splitReasons(reasons: string[]) {
  return reasons.reduce(
    (acc, reason) => {
      const kind = classifyReason(reason);
      if (kind === 'blocker') acc.blockers.push(reason);
      else if (kind === 'waiting') acc.waiting.push(reason);
      else if (kind === 'ready') acc.ready.push(reason);
      else acc.info.push(reason);
      return acc;
    },
    {
      blockers: [] as string[],
      waiting: [] as string[],
      ready: [] as string[],
      info: [] as string[]
    }
  );
}

function getItemPriority(item: InvoicingQueueItem): PriorityLevel {
  if (item.stage === 'overdue' || (item.blockers?.length ?? 0) > 0) return 'high';
  if (item.stage === 'waiting_for_approval' || item.stage === 'approved_today' || (item.waitingOn?.length ?? 0) > 0) {
    return 'medium';
  }
  return 'low';
}

function priorityLabel(priority: PriorityLevel) {
  if (priority === 'high') return 'Hög prioritet';
  if (priority === 'medium') return 'Nästa steg';
  return 'Översikt';
}

function priorityBadgeClass(priority: PriorityLevel) {
  if (priority === 'high') {
    return 'border-rose-300/80 bg-rose-100/80 text-rose-900 hover:bg-rose-100/80 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200';
  }
  if (priority === 'medium') {
    return 'border-amber-300/80 bg-amber-100/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200';
  }
  return 'border-slate-200/80 bg-slate-100/80 text-slate-800 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

function buildTimePreviewLines({
  entries,
  groupingMode,
  memberLabelByUserId,
  memberHourlyRateByUserId,
  taskLabelById,
  taskHourlyRateById,
  inferredRate,
  lineUnitPriceOverrides
}: {
  entries: Array<{ hours: number | null; user_id: string; task_id: string | null }>;
  groupingMode: TimeGroupingMode;
  memberLabelByUserId: Map<string, string>;
  memberHourlyRateByUserId: Map<string, number>;
  taskLabelById: Map<string, string>;
  taskHourlyRateById: Map<string, number>;
  inferredRate: number;
  lineUnitPriceOverrides?: Record<string, number>;
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

  return Array.from(grouped.entries()).map(([key, group]) => {
    const defaultUnitPrice =
      groupingMode === 'person'
        ? memberHourlyRateByUserId.get(key.replace('person:', '')) ?? inferredRate
        : groupingMode === 'task'
          ? taskHourlyRateById.get(key.replace('task:', '')) ?? inferredRate
          : inferredRate;
    const unitPrice = lineUnitPriceOverrides?.[key] ?? defaultUnitPrice;
    return {
      key,
      title: groupingMode === 'all' ? `Fakturerbar tid ${group.hours.toFixed(2)} h` : `${group.title} ${group.hours.toFixed(2)} h`,
      hours: Math.round(group.hours * 100) / 100,
      unitPrice,
      total: Math.round(group.hours * unitPrice * 100) / 100
    };
  });
}

export default function BillingPage() {
  const { role, companyId, capabilities } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const canReadFinance = canViewFinance(role, capabilities);
  const canEditFinance = canWriteFinance(role, capabilities);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [blockerFilter, setBlockerFilter] = useState<string>('all');
  const [timeDialogProjectId, setTimeDialogProjectId] = useState<string | null>(null);
  const [timeGroupingMode, setTimeGroupingMode] = useState<TimeGroupingMode>('all');
  const [timeUnitPrice, setTimeUnitPrice] = useState('');
  const [timeLineUnitPriceOverrides, setTimeLineUnitPriceOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    const nextQueue = searchParams.get('queue');
    if (
      nextQueue === 'all' ||
      nextQueue === 'waiting_for_me' ||
      nextQueue === 'completed_without_invoice' ||
      nextQueue === 'overdue'
    ) {
      setQueueFilter(nextQueue);
    }
    const nextBlocker = searchParams.get('blocker');
    setBlockerFilter(nextBlocker ? toFilterKey(nextBlocker) : 'all');
  }, [searchParams]);

  const memberOptionsQuery = useCompanyMemberOptions(companyId);
  const currentUserQuery = useQuery({
    queryKey: ['billing-current-user', companyId],
    queryFn: async () => {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    },
    enabled: canReadFinance
  });

  const invoiceTodoQuery = useQuery<InvoiceTodoRow[]>({
    queryKey: ['billing-invoice-todo', companyId],
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
    queryKey: ['billing-invoicing-projects', companyId],
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
    queryKey: ['billing-completed-projects', companyId],
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

  const invoicingOrdersQuery = useQuery({
    queryKey: ['billing-invoicing-orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,order_no,status,order_kind,invoice_readiness_status,total,created_at')
        .eq('company_id', companyId)
        .in('invoice_readiness_status', ['ready_for_invoicing', 'approved_for_invoicing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingCustomersQuery = useQuery({
    queryKey: ['billing-invoicing-customers', companyId],
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

  const invoiceSourcesQuery = useQuery({
    queryKey: ['billing-invoice-sources', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id,project_id,order_id')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const invoicingOrderLinesQuery = useQuery({
    queryKey: ['billing-invoicing-order-lines', companyId],
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
    queryKey: ['billing-billable-time-unordered', companyId],
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

  const financePlansQuery = useQuery({
    queryKey: ['billing-project-plans', companyId],
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

  const memberRatesQuery = useQuery({
    queryKey: ['billing-member-rates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_members')
        .select('user_id,default_hourly_rate')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const projectTasksQuery = useQuery({
    queryKey: ['billing-project-tasks', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,project_id,title,hourly_rate')
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
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte fastställa ordern')
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => createInvoiceFromOrder(orderId),
    onSuccess: async () => {
      toast.success('Faktura skapad');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoicing-projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura')
  });

  const createOrderLineFromTimeMutation = useMutation({
    mutationFn: async ({
      projectId,
      groupingMode,
      unitPrice,
      lineConfigs
    }: {
      projectId: string;
      groupingMode: TimeGroupingMode;
      unitPrice: number;
      lineConfigs: Array<{ group_key: string; unit_price: number }>;
    }) => {
      const { data, error } = await supabase.rpc('create_order_lines_from_billable_time', {
        p_project_id: projectId,
        p_grouping_mode: groupingMode,
        p_unit_price_override: unitPrice,
        p_line_configs: lineConfigs
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
      setTimeUnitPrice('');
      setTimeLineUnitPriceOverrides({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-order-lines', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-billable-time-unordered', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa orderunderlag från tid')
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
        queryClient.invalidateQueries({ queryKey: ['billing-invoicing-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-completed-projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte markera projektet som redo')
  });

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Fakturering är endast tillgängligt för ekonomi, admin eller revisor.</p>;
  }

  const currentUserId = currentUserQuery.data?.id ?? '';
  const todayIso = new Date().toISOString().slice(0, 10);
  const memberLabelByUserId = new Map(
    (memberOptionsQuery.data ?? []).map((member) => [member.user_id, member.display_name ?? member.email ?? member.user_id])
  );
  const customersById = new Map((invoicingCustomersQuery.data ?? []).map((customer) => [customer.id, customer.name]));
  const mergedProjects = [...(invoicingProjectsQuery.data ?? []), ...(completedProjectsQuery.data ?? [])];
  const projectsById = new Map(mergedProjects.map((project) => [project.id, project]));
  const queuedProjectIds = new Set((invoicingOrdersQuery.data ?? []).map((order) => order.project_id));
  const invoicedProjectIds = new Set((invoiceSourcesQuery.data ?? []).map((item) => item.project_id));
  const orderLineStats = (invoicingOrderLinesQuery.data ?? []).reduce((map, row) => {
    const current = map.get(row.order_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.total ?? 0);
    map.set(row.order_id, current);
    return map;
  }, new Map<string, { count: number; total: number }>());
  const unorderedBillableHoursByProject = (billableTimeQuery.data ?? []).reduce((map, row) => {
    if (!row.order_id) {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + Number(row.hours ?? 0));
    }
    return map;
  }, new Map<string, number>());
  const taskLabelById = useMemo(
    () => new Map((projectTasksQuery.data ?? []).map((task) => [task.id, task.title])),
    [projectTasksQuery.data]
  );
  const memberHourlyRateByUserId = useMemo(
    () => new Map((memberRatesQuery.data ?? []).map((member) => [member.user_id, Number(member.default_hourly_rate ?? 0)])),
    [memberRatesQuery.data]
  );
  const taskHourlyRateById = useMemo(
    () => new Map((projectTasksQuery.data ?? []).map((task) => [task.id, Number(task.hourly_rate ?? 0)])),
    [projectTasksQuery.data]
  );
  const suggestedTimeUnitPrice = useMemo(() => {
    if (!timeDialogProjectId) return 0;
    const plan = (financePlansQuery.data ?? []).find((row) => row.project_id === timeDialogProjectId);
    const budgetHours = Number(plan?.budget_hours ?? 0);
    const budgetRevenue = Number(plan?.budget_revenue ?? 0);
    return budgetHours > 0 && budgetRevenue > 0 ? Math.round((budgetRevenue / budgetHours) * 100) / 100 : 0;
  }, [financePlansQuery.data, timeDialogProjectId]);
  const selectedTimeUnitPrice = useMemo(() => {
    const parsed = Number(timeUnitPrice);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : suggestedTimeUnitPrice;
  }, [suggestedTimeUnitPrice, timeUnitPrice]);

  useEffect(() => {
    if (!timeDialogProjectId) {
      setTimeUnitPrice('');
      setTimeLineUnitPriceOverrides({});
      return;
    }

    setTimeUnitPrice(String(suggestedTimeUnitPrice));
    setTimeLineUnitPriceOverrides({});
  }, [suggestedTimeUnitPrice, timeDialogProjectId]);

  const timePreview = useMemo(() => {
    if (!timeDialogProjectId) {
      return { totalHours: 0, inferredRate: 0, lines: [] as TimePreviewLine[] };
    }

    const entries = (billableTimeQuery.data ?? []).filter(
      (row) => row.project_id === timeDialogProjectId && !row.order_id && row.is_billable
    );
    const totalHours = entries.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
    const lines = buildTimePreviewLines({
      entries,
      groupingMode: timeGroupingMode,
      memberLabelByUserId,
      memberHourlyRateByUserId,
      taskLabelById,
      taskHourlyRateById,
      inferredRate: selectedTimeUnitPrice,
      lineUnitPriceOverrides: timeLineUnitPriceOverrides
    });

    return { totalHours, inferredRate: selectedTimeUnitPrice, lines };
  }, [
    billableTimeQuery.data,
    memberHourlyRateByUserId,
    memberLabelByUserId,
    selectedTimeUnitPrice,
    taskHourlyRateById,
    taskLabelById,
    timeDialogProjectId,
    timeGroupingMode,
    timeLineUnitPriceOverrides
  ]);

  const projectItems: InvoicingQueueItem[] = (invoicingProjectsQuery.data ?? [])
    .filter((project) => project.invoice_readiness_status === 'ready_for_invoicing' && !queuedProjectIds.has(project.id))
    .map((project) => {
      const customerName = project.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
      const responsibleLabel = project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) ?? null : null;
      const unorderedBillableHours = unorderedBillableHoursByProject.get(project.id) ?? 0;
      const hasQueuedOrder = queuedProjectIds.has(project.id);

      return {
        id: `project-${project.id}`,
        type: 'project',
        stage: 'ready_to_review',
        title: project.title,
        customerName,
        projectTitle: project.title,
        amount: 0,
        statusLabel: getInvoiceReadinessLabel(project.invoice_readiness_status),
        nextStep: 'Säkerställ orderunderlag',
        ownerLabel: responsibleLabel ?? 'Projektansvarig',
        href: `/projects/${project.id}` as Route,
        secondaryHref: `/projects/${project.id}?tab=economy` as Route,
        meta: 'Projekt • Redo att ses över',
        entityId: project.id,
        projectId: project.id,
        reasons: buildProjectInvoicingQueueReasons({
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? null : null,
          responsibleLabel,
          unorderedBillableHours,
          completedButNotReady: false
        }),
        blockers: [
          !project.customer_id ? 'Kund saknas' : null,
          !responsibleLabel ? 'Projektansvarig saknas' : null,
          !hasQueuedOrder ? 'Orderunderlag saknas i kön' : null
        ].filter((value): value is string => Boolean(value)),
        waitingOn: [unorderedBillableHours > 0 ? 'Fakturerbar tid väntar på orderkoppling' : null].filter(
          (value): value is string => Boolean(value)
        ),
        readySignals: [project.invoice_readiness_status === 'ready_for_invoicing' ? 'Projektet är markerat redo' : null].filter(
          (value): value is string => Boolean(value)
        ),
        hasUnorderedBillableTime: unorderedBillableHours > 0,
        completedWithoutInvoice: false
      };
    });

  const completedNotReadyItems: InvoicingQueueItem[] = (completedProjectsQuery.data ?? [])
    .filter((project) => !queuedProjectIds.has(project.id))
    .filter((project) => !invoicedProjectIds.has(project.id))
    .filter((project) => project.invoice_readiness_status === 'not_ready' || !project.invoice_readiness_status)
    .map((project) => {
      const unorderedBillableHours = unorderedBillableHoursByProject.get(project.id) ?? 0;
      return {
        id: `completed-project-${project.id}`,
        type: 'project',
        stage: 'ready_to_review',
        title: project.title,
        customerName: project.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund',
        projectTitle: project.title,
        amount: 0,
        statusLabel: 'Inte redo',
        nextStep: 'Markera redo eller bygg orderunderlag',
        ownerLabel:
          (project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) : null)
          ?? 'Projektansvarig',
        href: `/projects/${project.id}` as Route,
        secondaryHref: `/projects/${project.id}?tab=economy` as Route,
        meta: 'Projekt • Klart men ej förberett för fakturering',
        entityId: project.id,
        projectId: project.id,
        reasons: buildProjectInvoicingQueueReasons({
          customerName: project.customer_id ? customersById.get(project.customer_id) ?? null : null,
          responsibleLabel: project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) ?? null : null,
          unorderedBillableHours,
          completedButNotReady: true
        }),
        blockers: [
          'Projektet är klart men inte markerat redo',
          !project.customer_id ? 'Kund saknas' : null,
          !(project.responsible_user_id ? memberLabelByUserId.get(project.responsible_user_id) ?? null : null)
            ? 'Projektansvarig saknas'
            : null
        ].filter((value): value is string => Boolean(value)),
        waitingOn: [unorderedBillableHours > 0 ? 'Fakturerbar tid väntar på orderunderlag' : null].filter(
          (value): value is string => Boolean(value)
        ),
        hasUnorderedBillableTime: unorderedBillableHours > 0,
        completedWithoutInvoice: true
      };
    });

  const orderItems: InvoicingQueueItem[] = (invoicingOrdersQuery.data ?? []).map((order) => {
    const project = projectsById.get(order.project_id);
    const projectTitle = project?.title ?? 'Projekt';
    const customerName = project?.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
    const lineCount = orderLineStats.get(order.id)?.count ?? 0;
    const orderTotal = Number(order.total ?? 0);
    const stage: InvoicingQueueStage =
      order.invoice_readiness_status === 'approved_for_invoicing' ? 'approved_today' : 'waiting_for_approval';
    const reasons = buildOrderInvoicingQueueReasons({
      customerName,
      lineCount,
      orderTotal,
      waitingForApproval: stage === 'waiting_for_approval'
    });
    const orderKindReason = orderKindQueueReason(order.order_kind, stage);

    return {
      id: `order-${order.id}`,
      type: 'order',
      stage,
      title: order.order_no ?? 'Order',
      customerName,
      projectTitle,
      amount: orderTotal,
      statusLabel: getInvoiceReadinessLabel(order.invoice_readiness_status),
      nextStep: stage === 'approved_today' ? 'Skapa faktura' : 'Granska och fastställ',
      ownerLabel: getInvoiceReadinessOwner(order.invoice_readiness_status),
      href: `/orders/${order.id}` as Route,
      secondaryHref: `/projects/${order.project_id}` as Route,
      meta: `${orderKindLabel(order.order_kind)} • ${projectTitle}`,
      entityId: order.id,
      projectId: order.project_id,
      reasons: orderKindReason ? [orderKindReason, ...reasons] : reasons,
      blockers: [
        lineCount === 0 ? 'Orderrader saknas' : null,
        orderTotal <= 0 ? 'Ordervärdet är 0' : null,
        !project?.customer_id ? 'Kund saknas' : null
      ].filter((value): value is string => Boolean(value)),
      waitingOn: [stage === 'waiting_for_approval' ? 'Väntar på fastställelse' : null].filter(
        (value): value is string => Boolean(value)
      ),
      readySignals: [stage === 'approved_today' ? 'Fastställd och klar för faktura' : null].filter(
        (value): value is string => Boolean(value)
      ),
      orderKind: order.order_kind
    };
  });

  const invoiceItems: InvoicingQueueItem[] = (invoiceTodoQuery.data ?? []).map((invoice) => {
    const overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date < todayIso;
    const unpaid = invoice.status !== 'paid' && invoice.status !== 'void';
    const stage: InvoicingQueueStage = overdue ? 'overdue' : unpaid ? 'awaiting_payment' : 'sent';

    return {
      id: `invoice-${invoice.id}`,
      type: 'invoice',
      stage,
      title: invoice.invoice_no,
      customerName: 'Kund via faktura',
      projectTitle: 'Faktura',
      amount: Number(invoice.total ?? 0),
      statusLabel: invoice.status === 'paid' ? 'Betald' : invoice.status === 'void' ? 'Makulerad' : 'Skickad',
      nextStep: overdue ? 'Följ upp betalning' : unpaid ? 'Vänta eller registrera betalning' : 'Ingen åtgärd',
      ownerLabel: overdue ? 'Ekonomi / admin' : unpaid ? 'Ekonomi' : 'Kund / ekonomi',
      href: `/invoices/${invoice.id}` as Route,
      meta: `Faktura • Förfallo ${formatDate(invoice.due_date)}`,
      entityId: invoice.id,
      blockers: [overdue ? `Förfallen sedan ${formatDate(invoice.due_date)}` : null].filter(
        (value): value is string => Boolean(value)
      ),
      waitingOn: [!overdue && unpaid ? `Obetald med förfallodatum ${formatDate(invoice.due_date)}` : null].filter(
        (value): value is string => Boolean(value)
      ),
      infoSignals: [!overdue && !unpaid ? 'Skickad och väntar på kundens hantering' : null].filter(
        (value): value is string => Boolean(value)
      ),
      reasons: buildInvoiceFollowupQueueReasons({
        status: invoice.status,
        dueDate: invoice.due_date,
        todayIso
      })
    };
  });

  const invoicingQueue = [...projectItems, ...completedNotReadyItems, ...orderItems, ...invoiceItems];
  const blockerOptions = Array.from(
    invoicingQueue.reduce((map, item) => {
      for (const blocker of item.blockers ?? []) {
        const key = toFilterKey(blocker);
        map.set(key, {
          key,
          label: blocker,
          count: (map.get(key)?.count ?? 0) + 1
        });
      }
      return map;
    }, new Map<string, { key: string; label: string; count: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'));

  const filteredQueue = invoicingQueue.filter((item) => {
    if (queueFilter === 'all') return true;
    if (queueFilter === 'overdue') return item.stage === 'overdue';
    if (queueFilter === 'completed_without_invoice') return item.type === 'project' && Boolean(item.completedWithoutInvoice);
    if (queueFilter === 'waiting_for_me') {
      if (item.type === 'project') {
        return Boolean(
          currentUserId &&
          item.projectId &&
          mergedProjects.some((project) => project.id === item.projectId && project.responsible_user_id === currentUserId)
        );
      }
      if (item.type === 'order') return item.stage === 'waiting_for_approval' || item.stage === 'approved_today';
      return item.stage === 'awaiting_payment' || item.stage === 'overdue';
    }
    return true;
  }).filter((item) => {
    if (blockerFilter === 'all') return true;
    return (item.blockers ?? []).some((blocker) => toFilterKey(blocker) === blockerFilter);
  });

  const prioritizedQueue = [...filteredQueue].sort((a, b) => {
    const priorityOrder: Record<PriorityLevel, number> = {
      high: 0,
      medium: 1,
      low: 2
    };
    const priorityDiff = priorityOrder[getItemPriority(a)] - priorityOrder[getItemPriority(b)];
    if (priorityDiff !== 0) return priorityDiff;

    const stageOrder: Record<InvoicingQueueStage, number> = {
      overdue: 0,
      waiting_for_approval: 1,
      approved_today: 2,
      ready_to_review: 3,
      awaiting_payment: 4,
      sent: 5
    };
    const stageDiff = stageOrder[a.stage] - stageOrder[b.stage];
    if (stageDiff !== 0) return stageDiff;

    return b.amount - a.amount;
  });

  const queueByStage = prioritizedQueue.reduce(
    (acc, item) => {
      acc[item.stage].push(item);
      return acc;
    },
    {
      ready_to_review: [] as InvoicingQueueItem[],
      waiting_for_approval: [] as InvoicingQueueItem[],
      approved_today: [] as InvoicingQueueItem[],
      sent: [] as InvoicingQueueItem[],
      awaiting_payment: [] as InvoicingQueueItem[],
      overdue: [] as InvoicingQueueItem[]
    }
  );

  const queueFilterOptions: Array<{ value: QueueFilter; label: string }> = [
    { value: 'all', label: 'Alla' },
    { value: 'waiting_for_me', label: 'Väntar på mig' },
    { value: 'completed_without_invoice', label: 'Klara utan faktura' },
    { value: 'overdue', label: 'Förfallna' }
  ];
  const queueFilterDescriptions: Record<QueueFilter, string> = {
    all: 'Visar hela kedjan från underlag till betalningsuppföljning.',
    waiting_for_me: 'Fokuserar på det som väntar på ekonomi eller den som är inloggad.',
    completed_without_invoice: 'Visar klara projekt som fortfarande saknar färdigt fakturaunderlag.',
    overdue: 'Visar fakturor där betalningsuppföljning behöver ske nu.'
  };

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <CheckSquare2 className="h-3.5 w-3.5" />
                <span>Fakturering</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Arbetsyta för fastställelse, faktura och uppföljning</h1>
                <p className="text-sm text-foreground/65">
                  Här jobbar ekonomi och admin vidare med det som är redo att granskas, fastställas, faktureras eller följas upp.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link href="/invoices">Fakturalista</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/receivables">Kundreskontra</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/finance">Ekonomi</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'sent', 'awaiting_payment', 'overdue'] as InvoicingQueueStage[]).map((stage) => (
              <MetricCard
                key={stage}
                icon={stage === 'overdue' ? Wallet : stage === 'approved_today' ? Receipt : FileText}
                label={stageLabel(stage)}
                value={String(queueByStage[stage].length)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Faktureringskö</CardTitle>
            <p className="text-sm text-foreground/60">Canonical arbetsyta för nästa steg i kundfakturaflödet.</p>
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

          {blockerOptions.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Filtrera på blockerare</p>
                <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                  {blockerOptions.reduce((sum, option) => sum + option.count, 0)} träffar
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={blockerFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setBlockerFilter('all')}
                >
                  Alla blockerare
                </Button>
                {blockerOptions.slice(0, 8).map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    size="sm"
                    variant={blockerFilter === option.key ? 'default' : 'outline'}
                    onClick={() => setBlockerFilter(option.key)}
                  >
                    {option.label} ({option.count})
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {queueFilter !== 'all' || blockerFilter !== 'all' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-sm text-foreground/70">
                Visar filtrerad kö:
                {' '}
                <span className="font-medium text-foreground">{queueFilterLabel(queueFilter)}</span>
                {blockerFilter !== 'all'
                  ? (
                    <>
                      {' '}• blockerare{' '}
                      <span className="font-medium text-foreground">
                        {blockerOptions.find((option) => option.key === blockerFilter)?.label ?? blockerFilter}
                      </span>
                    </>
                  )
                  : null}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQueueFilter('all');
                  setBlockerFilter('all');
                }}
              >
                Rensa filter
              </Button>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground/70">
            <span className="font-medium text-foreground">Fokus nu:</span> {queueFilterDescriptions[queueFilter]}
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
              {queueByStage[stage].length === 0 ? (
                <p className="text-sm text-foreground/70">Inga ärenden i denna kolumn.</p>
              ) : (
                queueByStage[stage].map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-muted/15 p-3">
                    {(() => {
                      const derivedReasons = splitReasons(item.reasons);
                      const priority = getItemPriority(item);
                      const groupedReasons = {
                        blockers: [...(item.blockers ?? []), ...derivedReasons.blockers],
                        waiting: [...(item.waitingOn ?? []), ...derivedReasons.waiting],
                        ready: [...(item.readySignals ?? []), ...derivedReasons.ready],
                        info: [...(item.infoSignals ?? []), ...derivedReasons.info]
                      };

                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-foreground/55">{item.meta}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.type === 'order' ? (
                          <Badge className={orderKindBadgeClass(item.orderKind)}>
                            {orderKindLabel(item.orderKind)}
                          </Badge>
                        ) : null}
                        <Badge className={priorityBadgeClass(priority)}>{priorityLabel(priority)}</Badge>
                        <Badge>{item.statusLabel}</Badge>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-sm">
                      <p><span className="text-foreground/55">Kund:</span> {item.customerName}</p>
                      <p><span className="text-foreground/55">Projekt:</span> {item.projectTitle}</p>
                      <p><span className="text-foreground/55">Belopp:</span> {money(item.amount)}</p>
                      <p><span className="text-foreground/55">Ägare nu:</span> {item.ownerLabel}</p>
                      <p><span className="text-foreground/55">Nästa steg:</span> {item.nextStep}</p>
                    </div>

                    {item.reasons.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {groupedReasons.blockers.length > 0 ? (
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                              Blockerar nu
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {groupedReasons.blockers.map((reason) => (
                                <Badge key={reason} className={reasonBadgeClass('blocker')}>
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {groupedReasons.waiting.length > 0 ? (
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                              Väntar på
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {groupedReasons.waiting.map((reason) => (
                                <Badge key={reason} className={reasonBadgeClass('waiting')}>
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {groupedReasons.ready.length > 0 ? (
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                              Redo
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {groupedReasons.ready.map((reason) => (
                                <Badge key={reason} className={reasonBadgeClass('ready')}>
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {groupedReasons.info.length > 0 ? (
                          <div>
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">
                              Bra att veta
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {groupedReasons.info.map((reason) => (
                                <Badge key={reason} className={reasonBadgeClass('info')}>
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
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
                      {item.secondaryHref ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={item.secondaryHref}>{item.type === 'order' ? 'Projekt' : 'Ekonomi'}</Link>
                        </Button>
                      ) : null}
                      {item.type === 'project' && item.hasUnorderedBillableTime ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTimeDialogProjectId(item.entityId);
                            setTimeGroupingMode('all');
                            setTimeLineUnitPriceOverrides({});
                            const plan = (financePlansQuery.data ?? []).find((row) => row.project_id === item.entityId);
                            const budgetHours = Number(plan?.budget_hours ?? 0);
                            const budgetRevenue = Number(plan?.budget_revenue ?? 0);
                            const suggestedRate = budgetHours > 0 && budgetRevenue > 0 ? Math.round((budgetRevenue / budgetHours) * 100) / 100 : 0;
                            setTimeUnitPrice(String(suggestedRate));
                          }}
                          disabled={createOrderLineFromTimeMutation.isPending}
                        >
                          Skapa underlag från tid
                        </Button>
                      ) : null}
                      {item.type === 'project' && item.hasUnorderedBillableTime ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/projects/${item.entityId}?tab=time` as Route}>Öppna tid</Link>
                        </Button>
                      ) : null}
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ActionSheet
        open={Boolean(timeDialogProjectId)}
        onClose={() => {
          setTimeDialogProjectId(null);
          setTimeGroupingMode('all');
          setTimeUnitPrice('');
          setTimeLineUnitPriceOverrides({});
        }}
        title="Skapa orderunderlag från tid"
        description="Gör om okopplad fakturerbar tid till orderrader direkt i faktureringsflödet."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Hur ska tiden grupperas?</p>
            <SimpleSelect
              value={timeGroupingMode}
              onValueChange={(value) => setTimeGroupingMode(value as TimeGroupingMode)}
              options={[
                { value: 'all', label: 'Samlad rad' },
                { value: 'person', label: 'Rad per person' },
                { value: 'task', label: 'Rad per uppgift' }
              ]}
            />
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm text-foreground/75">
            {timeGroupingMode === 'all'
              ? 'All okopplad fakturerbar tid läggs i en samlad orderrad.'
              : timeGroupingMode === 'person'
                ? 'Tiden delas upp i separata orderrader per person.'
                : 'Tiden delas upp i separata orderrader per uppgift. Tid utan uppgift får en egen rad.'}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm text-foreground/75">
              <p className="font-medium text-foreground">Prislogik</p>
              <p className="mt-1">
                {suggestedTimeUnitPrice > 0
                  ? `Förvalt timpris hämtas från projektbudget: ${money(suggestedTimeUnitPrice)}/h. Du kan justera det innan orderraderna skapas.`
                  : 'Ingen prisnivå kunde räknas fram från projektbudget. Ange timpris manuellt innan orderraderna skapas.'}
              </p>
            </div>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Pris per timme</span>
              <Input
                value={timeUnitPrice}
                onChange={(event) => setTimeUnitPrice(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </label>
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 sm:flex-1">
                        <p className="truncate font-medium">{line.title}</p>
                        <p className="text-xs text-foreground/60">
                          {line.hours.toFixed(2)} h × {money(line.unitPrice)}
                        </p>
                      </div>
                      <div className="flex items-end gap-3 sm:shrink-0">
                        {timeGroupingMode !== 'all' ? (
                          <label className="space-y-1">
                            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Pris/h</span>
                            <Input
                              className="h-9 w-28"
                              value={String(timeLineUnitPriceOverrides[line.key] ?? line.unitPrice)}
                              onChange={(event) =>
                                setTimeLineUnitPriceOverrides((current) => ({
                                  ...current,
                                  [line.key]: Math.max(0, Number(event.target.value || 0))
                                }))
                              }
                              type="number"
                              min="0"
                              step="0.01"
                            />
                          </label>
                        ) : null}
                        <p className="shrink-0 font-medium">{money(line.total)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
            När underlaget skapas kopplas den okopplade fakturerbara tiden till en order och projektet markeras redo för nästa steg i faktureringen.
          </div>
          <Button
            className="w-full"
            onClick={() =>
              createOrderLineFromTimeMutation.mutate({
                projectId: timeDialogProjectId ?? '',
                groupingMode: timeGroupingMode,
                unitPrice: selectedTimeUnitPrice,
                lineConfigs: timePreview.lines.map((line) => ({
                  group_key: line.key,
                  unit_price: timeLineUnitPriceOverrides[line.key] ?? line.unitPrice
                }))
              })
            }
            disabled={createOrderLineFromTimeMutation.isPending || timePreview.lines.length === 0}
          >
            {createOrderLineFromTimeMutation.isPending ? 'Skapar underlag...' : 'Skapa orderunderlag från tid'}
          </Button>
        </div>
      </ActionSheet>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/35 p-2">
          <Icon className="h-4 w-4 text-foreground/70" />
        </div>
      </div>
    </div>
  );
}
