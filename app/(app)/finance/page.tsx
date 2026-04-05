'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, ClipboardList, FileText, Filter, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFinanceOverview } from '@/features/finance/financeQueries';
import { canViewFinance, canWriteFinance } from '@/lib/auth/capabilities';
import { getInvoiceReadinessLabel } from '@/lib/finance/invoiceReadiness';
import { createInvoiceFromOrder, vatReport } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import BankReconciliationCard from '@/features/finance/BankReconciliationCard';

type StatusFilter = 'all' | 'booked' | 'voided';
type SourceFilter = 'all' | 'mobile' | 'desktop' | 'offline';
type AttachmentFilter = 'all' | 'with' | 'without';
type FinanceView = 'overview' | 'verifications' | 'invoicing';
type VerificationLayout = 'compact' | 'review';
type InvoicingQueueStage =
  | 'ready_to_review'
  | 'waiting_for_approval'
  | 'approved_today'
  | 'sent'
  | 'awaiting_payment'
  | 'overdue';

type InvoicingQueueItem = {
  id: string;
  type: 'order' | 'invoice';
  stage: InvoicingQueueStage;
  title: string;
  customerName: string;
  projectTitle: string;
  amount: number;
  statusLabel: string;
  nextStep: string;
  href: Route;
  secondaryHref?: Route;
  meta: string;
  entityId: string;
  projectId?: string;
};
type OrderKind = 'primary' | 'change' | 'supplement';

type InvoiceTodoRow = {
  id: string;
  invoice_no: string;
  status: string;
  due_date: string;
  total: number;
  currency: string;
  booking_verification_id: string | null;
};
type TodoCardKey = 'unbooked_invoices' | 'overdue_invoices' | 'verifications_without_attachment';
type DismissedMap = Record<TodoCardKey, boolean>;
type DismissedAtMap = Record<TodoCardKey, string | null>;

type TodoPreference = {
  date: string;
  dismissed: DismissedMap;
  dismissed_at: DismissedAtMap;
};

const TODO_PREF_KEY = 'finance_todo_dismissed_v1';

const DEFAULT_DISMISSED: DismissedMap = {
  unbooked_invoices: false,
  overdue_invoices: false,
  verifications_without_attachment: false
};

const DEFAULT_DISMISSED_AT: DismissedAtMap = {
  unbooked_invoices: null,
  overdue_invoices: null,
  verifications_without_attachment: null
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('sv-SE');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sourceLabel(source: string | null) {
  if (source === 'mobile') return 'Mobil';
  if (source === 'desktop') return 'Desktop';
  if (source === 'offline') return 'Offline';
  return '-';
}

function statusLabel(status: string | null) {
  if (status === 'voided') return 'Makulerad';
  return 'Bokförd';
}

function verificationRowTone(status: string | null) {
  if (status === 'voided') {
    return 'bg-rose-50/70 hover:bg-rose-100/70 dark:bg-rose-950/15 dark:hover:bg-rose-950/25';
  }

  return 'bg-emerald-50/45 hover:bg-emerald-100/50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20';
}

function verificationStatusBadgeTone(status: string | null) {
  if (status === 'voided') {
    return 'border-rose-300/70 bg-rose-100/80 text-rose-900 hover:bg-rose-100/80 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200';
  }

  return 'border-emerald-300/70 bg-emerald-100/80 text-emerald-900 hover:bg-emerald-100/80 dark:border-emerald-900/50 dark:bg-emerald-500/15 dark:text-emerald-200';
}

function verificationNumberLabel(fiscalYear: number | null, verificationNo: number | null) {
  if (!fiscalYear || !verificationNo) return '-';
  return `${fiscalYear}-${String(verificationNo).padStart(5, '0')}`;
}

function money(value: number) {
  return `${value.toFixed(2)} kr`;
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

function orderKindLabel(kind: OrderKind) {
  if (kind === 'change') return 'Ändringsordrar';
  if (kind === 'supplement') return 'Tilläggsordrar';
  return 'Huvudorder';
}

function share(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function normalizeTodoPreference(value: unknown, today: string): TodoPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { date: today, dismissed: { ...DEFAULT_DISMISSED }, dismissed_at: { ...DEFAULT_DISMISSED_AT } };
  }

  const obj = value as Record<string, unknown>;
  const date = typeof obj.date === 'string' ? obj.date : today;

  const rawDismissed = obj.dismissed && typeof obj.dismissed === 'object' && !Array.isArray(obj.dismissed)
    ? (obj.dismissed as Record<string, unknown>)
    : {};

  const rawDismissedAt = obj.dismissed_at && typeof obj.dismissed_at === 'object' && !Array.isArray(obj.dismissed_at)
    ? (obj.dismissed_at as Record<string, unknown>)
    : {};

  const dismissed: DismissedMap = {
    unbooked_invoices: Boolean(rawDismissed.unbooked_invoices),
    overdue_invoices: Boolean(rawDismissed.overdue_invoices),
    verifications_without_attachment: Boolean(rawDismissed.verifications_without_attachment)
  };

  const dismissed_at: DismissedAtMap = {
    unbooked_invoices: typeof rawDismissedAt.unbooked_invoices === 'string' ? rawDismissedAt.unbooked_invoices : null,
    overdue_invoices: typeof rawDismissedAt.overdue_invoices === 'string' ? rawDismissedAt.overdue_invoices : null,
    verifications_without_attachment:
      typeof rawDismissedAt.verifications_without_attachment === 'string' ? rawDismissedAt.verifications_without_attachment : null
  };

  if (date !== today) {
    return { date: today, dismissed: { ...DEFAULT_DISMISSED }, dismissed_at: { ...DEFAULT_DISMISSED_AT } };
  }

  return { date, dismissed, dismissed_at };
}

export default function FinancePage() {
  const { role, companyId, capabilities } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const query = useFinanceOverview(companyId);
  const mode = useBreakpointMode();
  const searchParams = useSearchParams();
  const canReadFinance = canViewFinance(role, capabilities);
  const canEditFinance = canWriteFinance(role, capabilities);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [attachmentFilter, setAttachmentFilter] = useState<AttachmentFilter>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<FinanceView>('overview');
  const [verificationLayout, setVerificationLayout] = useState<VerificationLayout>('compact');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<DismissedMap>({ ...DEFAULT_DISMISSED });
  const [dismissedAt, setDismissedAt] = useState<DismissedAtMap>({ ...DEFAULT_DISMISSED_AT });

  const monthRange = useMemo(() => currentMonthRange(), []);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const nextView = searchParams.get('view');
    const nextAttachment = searchParams.get('attachment');

    if (nextView === 'overview' || nextView === 'verifications') {
      setView(nextView);
    }

    if (nextAttachment === 'all' || nextAttachment === 'with' || nextAttachment === 'without') {
      setAttachmentFilter(nextAttachment);
    }
  }, [searchParams]);

  const monthVatQuery = useQuery({
    queryKey: ['finance-month-vat', companyId, monthRange.start, monthRange.end],
    queryFn: () => vatReport(companyId, monthRange.start, monthRange.end),
    enabled: canReadFinance
  });

  const invoiceTodoQuery = useQuery<InvoiceTodoRow[]>({
    queryKey: ['finance-invoice-todo', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,status,due_date,total,currency,booking_verification_id:rpc_result->>booking_verification_id')
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
        .select('id,title,customer_id,invoice_readiness_status,responsible_user_id,updated_at')
        .eq('company_id', companyId)
        .in('invoice_readiness_status', ['ready_for_invoicing', 'approved_for_invoicing'])
        .order('updated_at', { ascending: false });

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
        .select('id,project_id,order_no,order_kind,status,invoice_readiness_status,total,created_at')
        .eq('company_id', companyId)
        .in('invoice_readiness_status', ['ready_for_invoicing', 'approved_for_invoicing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const financeOrderMixOrdersQuery = useQuery({
    queryKey: ['finance-order-mix-orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,order_kind,total')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Array<{ id: string; project_id: string | null; order_kind: OrderKind; total: number | null }>;
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
        queryClient.invalidateQueries({ queryKey: ['finance-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-overview', companyId] }),
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
        queryClient.invalidateQueries({ queryKey: ['finance-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-overview', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura')
  });

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Ekonomi är endast tillgängligt för ekonomi, admin eller revisor.</p>;
  }

  useEffect(() => {
    let active = true;

    async function loadTodoPreferences() {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setCurrentUserId(null);
        setDismissed({ ...DEFAULT_DISMISSED });
        setDismissedAt({ ...DEFAULT_DISMISSED_AT });
        return;
      }

      setCurrentUserId(user.id);

      const { data } = await supabase
        .from('user_company_preferences')
        .select('preference_value')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .eq('preference_key', TODO_PREF_KEY)
        .maybeSingle();

      if (!active) return;

      const normalized = normalizeTodoPreference(data?.preference_value, todayIso);
      setDismissed(normalized.dismissed);
      setDismissedAt(normalized.dismissed_at);

      const storedDate =
        data?.preference_value && typeof data.preference_value === 'object' && !Array.isArray(data.preference_value)
          ? (data.preference_value as Record<string, unknown>).date
          : null;

      if (normalized.date !== storedDate) {
        void persistDismissedPreference(normalized.dismissed, normalized.dismissed_at, user.id, todayIso);
      }
    }

    void loadTodoPreferences();

    return () => {
      active = false;
    };
  }, [companyId, supabase, todayIso]);

  async function persistDismissedPreference(next: DismissedMap, nextDismissedAt: DismissedAtMap, userId: string, date: string) {
    await supabase.from('user_company_preferences').upsert(
      {
        company_id: companyId,
        user_id: userId,
        preference_key: TODO_PREF_KEY,
        preference_value: { date, dismissed: next, dismissed_at: nextDismissedAt }
      },
      { onConflict: 'company_id,user_id,preference_key' }
    );
  }

  function markTodoDone(key: TodoCardKey) {
    const now = new Date().toISOString();

    setDismissed((prevDismissed) => {
      const nextDismissed = { ...prevDismissed, [key]: true };

      setDismissedAt((prevDismissedAt) => {
        const nextDismissedAt = { ...prevDismissedAt, [key]: now };
        if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
        return nextDismissedAt;
      });

      return nextDismissed;
    });
  }

  function undoTodoDone(key: TodoCardKey) {
    setDismissed((prevDismissed) => {
      const nextDismissed = { ...prevDismissed, [key]: false };

      setDismissedAt((prevDismissedAt) => {
        const nextDismissedAt = { ...prevDismissedAt, [key]: null };
        if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
        return nextDismissedAt;
      });

      return nextDismissed;
    });
  }

  function resetAllTodoCards() {
    const nextDismissed = { ...DEFAULT_DISMISSED };
    const nextDismissedAt = { ...DEFAULT_DISMISSED_AT };

    setDismissed(nextDismissed);
    setDismissedAt(nextDismissedAt);

    if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
  }

  const rows = query.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (attachmentFilter === 'with' && !row.attachment_path) return false;
      if (attachmentFilter === 'without' && row.attachment_path) return false;

      if (!normalizedSearch) return true;
      const haystack = [
        row.description,
        row.id,
        verificationNumberLabel(row.fiscal_year, row.verification_no),
        row.source ?? '',
        row.status ?? ''
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [rows, statusFilter, sourceFilter, attachmentFilter, normalizedSearch]);

  const stats = useMemo(() => {
    const booked = filteredRows.filter((row) => row.status !== 'voided');
    const voided = filteredRows.filter((row) => row.status === 'voided');
    const withAttachment = filteredRows.filter((row) => Boolean(row.attachment_path));
    const withoutAttachment = filteredRows.filter((row) => !row.attachment_path);
    const totalBooked = booked.reduce((sum, row) => sum + Number(row.total), 0);
    const latest = filteredRows[0] ?? null;
    const sourceCounts = {
      mobile: filteredRows.filter((row) => row.source === 'mobile').length,
      desktop: filteredRows.filter((row) => row.source === 'desktop').length,
      offline: filteredRows.filter((row) => row.source === 'offline').length
    };

    return {
      allCount: filteredRows.length,
      bookedCount: booked.length,
      voidedCount: voided.length,
      withAttachmentCount: withAttachment.length,
      withoutAttachmentCount: withoutAttachment.length,
      totalBooked,
      latest,
      sourceCounts
    };
  }, [filteredRows]);

  const orderMix = useMemo(() => {
    const totals = {
      primary: 0,
      change: 0,
      supplement: 0
    };

    for (const order of financeOrderMixOrdersQuery.data ?? []) {
      const amount = Number(order.total ?? 0);
      if (order.order_kind === 'change') totals.change += amount;
      else if (order.order_kind === 'supplement') totals.supplement += amount;
      else totals.primary += amount;
    }

    const total = totals.primary + totals.change + totals.supplement;
    const changeAndSupplement = totals.change + totals.supplement;

    return {
      totals: { ...totals, total, changeAndSupplement },
      shares: {
        primary: share(totals.primary, total),
        change: share(totals.change, total),
        supplement: share(totals.supplement, total)
      }
    };
  }, [financeOrderMixOrdersQuery.data]);

  const todo = useMemo(() => {
    const invoices = invoiceTodoQuery.data ?? [];

    const unbookedInvoices = invoices.filter((inv) => !inv.booking_verification_id).slice(0, 8);
    const overdueInvoices = invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'void' && inv.due_date < todayIso).slice(0, 8);
    const verificationsWithoutAttachment = rows.filter((row) => row.status !== 'voided' && !row.attachment_path).slice(0, 8);

    return { unbookedInvoices, overdueInvoices, verificationsWithoutAttachment };
  }, [invoiceTodoQuery.data, rows, todayIso]);

  const invoicingQueue = useMemo<InvoicingQueueItem[]>(() => {
    const customersById = new Map((invoicingCustomersQuery.data ?? []).map((customer) => [customer.id, customer.name]));
    const projectsById = new Map((invoicingProjectsQuery.data ?? []).map((project) => [project.id, project]));
    const queuedProjectIds = new Set((invoicingOrdersQuery.data ?? []).map((order) => order.project_id));

    const projectItems = (invoicingProjectsQuery.data ?? [])
      .filter((project) => project.invoice_readiness_status === 'ready_for_invoicing' && !queuedProjectIds.has(project.id))
      .map((project) => ({
        id: `project-${project.id}`,
        type: 'order' as const,
        stage: 'ready_to_review' as const,
        title: project.title,
        customerName: project.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund',
        projectTitle: project.title,
        amount: 0,
        statusLabel: getInvoiceReadinessLabel(project.invoice_readiness_status),
        nextStep: 'Säkerställ orderunderlag',
        href: `/projects/${project.id}` as Route,
        meta: 'Projekt • Redo att ses över',
        entityId: project.id,
        projectId: project.id
      }));

    const orderItems = (invoicingOrdersQuery.data ?? []).map((order) => {
      const project = projectsById.get(order.project_id);
      const projectTitle = project?.title ?? 'Projekt';
      const customerName = project?.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
      const stage: InvoicingQueueStage =
        order.invoice_readiness_status === 'approved_for_invoicing' ? 'approved_today' : 'waiting_for_approval';

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
        href: `/orders/${order.id}` as Route,
        secondaryHref: `/projects/${order.project_id}` as Route,
        meta: `Order • ${projectTitle}`,
        entityId: order.id,
        projectId: order.project_id
      };
    });

    const invoiceItems = (invoiceTodoQuery.data ?? []).map((invoice) => {
      const overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date < todayIso;
      const unpaid = invoice.status !== 'paid' && invoice.status !== 'void';
      const stage: InvoicingQueueStage = overdue ? 'overdue' : unpaid ? 'awaiting_payment' : 'sent';

      return {
        id: `invoice-${invoice.id}`,
        type: 'invoice' as const,
        stage,
        title: invoice.invoice_no,
        customerName: 'Kund via faktura',
        projectTitle: 'Faktura',
        amount: Number(invoice.total ?? 0),
        statusLabel: invoice.status,
        nextStep: overdue ? 'Följ upp betalning' : unpaid ? 'Vänta eller registrera betalning' : 'Ingen åtgärd',
        href: `/invoices/${invoice.id}` as Route,
        meta: `Faktura • Förfallo ${formatDate(invoice.due_date)}`,
        entityId: invoice.id
      };
    });

    return [...projectItems, ...orderItems, ...invoiceItems].sort((a, b) => b.amount - a.amount);
  }, [invoiceTodoQuery.data, invoicingCustomersQuery.data, invoicingOrdersQuery.data, invoicingProjectsQuery.data, todayIso]);

  const invoicingQueueByStage = useMemo(() => {
    const initial: Record<InvoicingQueueStage, InvoicingQueueItem[]> = {
      ready_to_review: [],
      waiting_for_approval: [],
      approved_today: [],
      sent: [],
      awaiting_payment: [],
      overdue: []
    };

    for (const item of invoicingQueue) {
      initial[item.stage].push(item);
    }

    return initial;
  }, [invoicingQueue]);

  const vatBoxes = (monthVatQuery.data as Record<string, unknown> | null)?.boxes as Record<string, unknown> | undefined;
  const vat49 = Number(vatBoxes?.['49'] ?? 0);

  const hiddenCount = Number(dismissed.unbooked_invoices) + Number(dismissed.overdue_invoices) + Number(dismissed.verifications_without_attachment);
  const totalTodoCount =
    todo.unbookedInvoices.length + todo.overdueInvoices.length + todo.verificationsWithoutAttachment.length;
  const attachmentCoverage = share(stats.withAttachmentCount, stats.allCount);
  const bookedShare = share(stats.bookedCount, stats.allCount);
  const mobileShare = share(stats.sourceCounts.mobile, stats.allCount);
  const desktopShare = share(stats.sourceCounts.desktop, stats.allCount);
  const offlineShare = share(stats.sourceCounts.offline, stats.allCount);
  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    statusFilter !== 'all' ||
    sourceFilter !== 'all' ||
    attachmentFilter !== 'all';

  if (mode === 'mobile') {
    return (
      <section className="space-y-4">
        <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <Wallet className="h-3.5 w-3.5" />
                <span>Ekonomi</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Snabbregistrering och kontroll</h1>
                <p className="text-sm text-foreground/65">
                  Mobilen fokuserar på att lägga till verifikationer, ladda upp underlag och fånga sådant som kräver åtgärd.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {canEditFinance ? (
                <>
                  <MobileFinanceAction href={'/finance/verifications/new' as Route} label="Ny verifikation" />
                  <MobileFinanceAction href={'/finance/verifications/drafts' as Route} label="Utkast" variant="secondary" />
                </>
              ) : null}
              <MobileFinanceAction href={'/receivables' as Route} label="Kundreskontra" variant="outline" />
              <MobileFinanceAction href={'/payables' as Route} label="Leverantörsreskontra" variant="outline" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MiniStatCard
                icon={Filter}
                title="Att åtgärda"
                value={String(totalTodoCount)}
                detail={hiddenCount > 0 ? `${hiddenCount} dolda kort` : 'Inget dolt'}
                compact
                tone="rose"
              />
              <MiniStatCard
                icon={FileText}
                title="Saknar underlag"
                value={String(stats.withoutAttachmentCount)}
                detail={`${stats.withAttachmentCount} med bilaga`}
                compact
                tone="amber"
              />
              <MiniStatCard
                icon={ClipboardList}
                title="Verifikationer"
                value={String(stats.allCount)}
                detail={`${stats.voidedCount} makulerade`}
                compact
                tone="blue"
              />
              <MiniStatCard
                icon={BarChart3}
                title="Moms ruta 49"
                value={money(vat49)}
                detail={`${monthRange.start} - ${monthRange.end}`}
                compact
                tone="emerald"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Det här kräver åtgärd</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TodoCard
              title="Obokförda fakturor"
              count={todo.unbookedInvoices.length}
              hidden={dismissed.unbooked_invoices}
              dismissedAt={dismissedAt.unbooked_invoices}
              onDone={() => markTodoDone('unbooked_invoices')}
              onUndo={() => undoTodoDone('unbooked_invoices')}
            >
              {todo.unbookedInvoices.length === 0 ? (
                <p className="text-sm text-foreground/70">Inga obokförda fakturor.</p>
              ) : (
                <div className="space-y-2">
                  {todo.unbookedInvoices.slice(0, 4).map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`} className="block rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{inv.invoice_no}</p>
                      <p className="text-foreground/70">{money(Number(inv.total))} {inv.currency}</p>
                    </Link>
                  ))}
                </div>
              )}
            </TodoCard>

            <TodoCard
              title="Förfallna kundfakturor"
              count={todo.overdueInvoices.length}
              hidden={dismissed.overdue_invoices}
              dismissedAt={dismissedAt.overdue_invoices}
              onDone={() => markTodoDone('overdue_invoices')}
              onUndo={() => undoTodoDone('overdue_invoices')}
            >
              {todo.overdueInvoices.length === 0 ? (
                <p className="text-sm text-foreground/70">Inga förfallna fakturor.</p>
              ) : (
                <div className="space-y-2">
                  {todo.overdueInvoices.slice(0, 4).map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`} className="block rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{inv.invoice_no}</p>
                      <p className="text-foreground/70">Förfallodag: {formatDate(inv.due_date)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </TodoCard>

            <TodoCard
              title="Verifikationer utan bilaga"
              count={todo.verificationsWithoutAttachment.length}
              hidden={dismissed.verifications_without_attachment}
              dismissedAt={dismissedAt.verifications_without_attachment}
              onDone={() => markTodoDone('verifications_without_attachment')}
              onUndo={() => undoTodoDone('verifications_without_attachment')}
            >
              {todo.verificationsWithoutAttachment.length === 0 ? (
                <p className="text-sm text-foreground/70">Alla bokförda verifikationer har bilaga.</p>
              ) : (
                <div className="space-y-2">
                  {todo.verificationsWithoutAttachment.slice(0, 4).map((row) => (
                    <Link key={row.id} href={`/finance/verifications/${row.id}`} className="block rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{verificationNumberLabel(row.fiscal_year, row.verification_no)}</p>
                      <p className="truncate text-foreground/70">{row.description}</p>
                    </Link>
                  ))}
                </div>
              )}
            </TodoCard>

            {hiddenCount > 0 ? (
              <Button type="button" variant="outline" className="w-full" onClick={resetAllTodoCards}>
                Visa alla dolda kort ({hiddenCount})
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Senaste verifikationerna</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              {filteredRows.length === 0 ? (
                <p className="text-sm text-foreground/70">Inga verifikationer att visa.</p>
              ) : (
                filteredRows.slice(0, 6).map((row) => (
                  <Link key={row.id} href={`/finance/verifications/${row.id}`} className="block">
                    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{verificationNumberLabel(row.fiscal_year, row.verification_no)}</p>
                          <p className="mt-1 truncate text-sm text-foreground/70">{row.description}</p>
                        </div>
                        <Badge>{statusLabel(row.status)}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <ReviewFact label="Datum" value={formatDate(row.date)} />
                        <ReviewFact label="Belopp" value={money(Number(row.total))} />
                        <ReviewFact label="Källa" value={sourceLabel(row.source)} />
                        <ReviewFact label="Underlag" value={row.attachment_path ? 'Bilaga finns' : 'Saknas'} />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MobileFinanceAction href={'/finance/verifications/drafts' as Route} label="Utkast" variant="outline" />
              <MobileFinanceAction href={'/reports' as Route} label="Rapporter" variant="outline" />
            </div>
          </CardContent>
        </Card>
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
                <Wallet className="h-3.5 w-3.5" />
                <span>Ekonomi</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Bokföring och verifikationer</h1>
                <p className="text-sm text-foreground/65">
                  Håll fokus på dagens läge först, och öppna verifikationsvyn när du behöver söka, filtrera och granska.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    Månad: {monthRange.start} - {monthRange.end}
                  </Badge>
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {canEditFinance ? 'Skrivläge aktiverat' : 'Läsläge'}
                  </Badge>
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {totalTodoCount > 0 ? `${totalTodoCount} fokuspunkter idag` : 'Inget akut just nu'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border/70 bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={view === 'overview' ? 'default' : 'ghost'}
                  className="rounded-full"
                  onClick={() => setView('overview')}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Översikt
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={view === 'verifications' ? 'default' : 'ghost'}
                  className="rounded-full"
                  onClick={() => setView('verifications')}
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Verifikationer
                </Button>
              </div>

              {canEditFinance ? <Button asChild><Link href="/finance/verifications/new">Ny verifikation</Link></Button> : null}
              {canEditFinance ? <Button variant="secondary" asChild><Link href="/finance/verifications/drafts">Utkast</Link></Button> : null}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <MiniStatCard
              icon={FileText}
              title="Bokfört belopp"
              value={money(stats.totalBooked)}
              detail={`${stats.bookedCount} bokförda verifikationer i urvalet`}
              tone="emerald"
            />
            <MiniStatCard
              icon={ClipboardList}
              title="Verifikationer"
              value={String(stats.allCount)}
              detail={`${stats.withAttachmentCount} med bilaga • ${stats.voidedCount} makulerade`}
              tone="blue"
            />
            <MiniStatCard
              icon={BarChart3}
              title="Moms ruta 49"
              value={money(vat49)}
              detail={`${monthRange.start} - ${monthRange.end}`}
              tone="amber"
            />
            <MiniStatCard
              icon={Filter}
              title="Att göra idag"
              value={String(
                totalTodoCount
              )}
              detail={hiddenCount > 0 ? `${hiddenCount} dolda kort` : 'Inga dolda kort'}
              tone="rose"
            />
            </div>

            <Card className="border-border/70 bg-card/65">
              <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
                <MetricBar
                  label="Bokfört"
                  value={`${bookedShare}%`}
                  detail={`${stats.bookedCount} av ${stats.allCount || 0} verifikationer`}
                  percent={bookedShare}
                  tone="blue"
                />
                <MetricBar
                  label="Underlag"
                  value={`${attachmentCoverage}%`}
                  detail={`${stats.withAttachmentCount} med bilaga`}
                  percent={attachmentCoverage}
                  tone="emerald"
                />
                <MetricBar
                  label="Källfördelning"
                  value={`${stats.sourceCounts.mobile}/${stats.sourceCounts.desktop}/${stats.sourceCounts.offline}`}
                  detail="Mobil, desktop, offline"
                  stacked
                  segments={[
                    { label: 'Mobil', percent: mobileShare, tone: 'blue' },
                    { label: 'Desktop', percent: desktopShare, tone: 'amber' },
                    { label: 'Offline', percent: offlineShare, tone: 'rose' }
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link href="/orders">Ordrar</Link></Button>
            <Button variant="outline" asChild><Link href="/invoices">Fakturor</Link></Button>
            <Button variant="outline" asChild><Link href="/receivables">Kundreskontra</Link></Button>
            <Button variant="outline" asChild><Link href="/payables">Leverantörsreskontra</Link></Button>
            <Button variant="outline" asChild><Link href="/reports">Alla rapporter</Link></Button>
            <Button variant="ghost" asChild><Link href={'/help/ekonomioversikt' as Route}>Hjälp om ekonomi</Link></Button>
          </div>
        </CardContent>
      </Card>

      {view === 'overview' ? (
        <div className="space-y-4">
          <BankReconciliationCard companyId={companyId} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Det här behöver du göra nu</CardTitle>
                  {hiddenCount > 0 ? (
                    <Button size="sm" variant="outline" onClick={resetAllTodoCards}>
                      Visa alla ({hiddenCount})
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <TodoCard
                  title="Obokförda fakturor"
                  count={todo.unbookedInvoices.length}
                  hidden={dismissed.unbooked_invoices}
                  dismissedAt={dismissedAt.unbooked_invoices}
                  onDone={() => markTodoDone('unbooked_invoices')}
                  onUndo={() => undoTodoDone('unbooked_invoices')}
                >
                  {todo.unbookedInvoices.length === 0 ? (
                    <p className="text-sm text-foreground/70">Inga obokförda fakturor.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {todo.unbookedInvoices.map((inv) => (
                        <div key={inv.id} className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="font-medium"><Link className="underline underline-offset-2" href={`/invoices/${inv.id}`}>{inv.invoice_no}</Link></p>
                          <p className="text-foreground/70">{money(Number(inv.total))} {inv.currency}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TodoCard>

                <TodoCard
                  title="Förfallna obetalda fakturor"
                  count={todo.overdueInvoices.length}
                  hidden={dismissed.overdue_invoices}
                  dismissedAt={dismissedAt.overdue_invoices}
                  onDone={() => markTodoDone('overdue_invoices')}
                  onUndo={() => undoTodoDone('overdue_invoices')}
                >
                  {todo.overdueInvoices.length === 0 ? (
                    <p className="text-sm text-foreground/70">Inga förfallna fakturor.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {todo.overdueInvoices.map((inv) => (
                        <div key={inv.id} className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="font-medium"><Link className="underline underline-offset-2" href={`/invoices/${inv.id}`}>{inv.invoice_no}</Link></p>
                          <p className="text-foreground/70">Förfallodag: {formatDate(inv.due_date)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TodoCard>

                <TodoCard
                  title="Verifikationer utan bilaga"
                  count={todo.verificationsWithoutAttachment.length}
                  hidden={dismissed.verifications_without_attachment}
                  dismissedAt={dismissedAt.verifications_without_attachment}
                  onDone={() => markTodoDone('verifications_without_attachment')}
                  onUndo={() => undoTodoDone('verifications_without_attachment')}
                >
                  {todo.verificationsWithoutAttachment.length === 0 ? (
                    <p className="text-sm text-foreground/70">Alla bokförda verifikationer har bilaga.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {todo.verificationsWithoutAttachment.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="font-medium"><Link className="underline underline-offset-2" href={`/finance/verifications/${row.id}`}>{verificationNumberLabel(row.fiscal_year, row.verification_no)}</Link></p>
                          <p className="text-foreground/70 truncate">{row.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TodoCard>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Ekonomiläge i bild</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MetricBar
                    label="Bokförda verifikationer"
                    value={`${stats.bookedCount}`}
                    detail={`${stats.voidedCount} makulerade i samma urval`}
                    percent={bookedShare}
                    tone="blue"
                  />
                  <MetricBar
                    label="Verifikationer med underlag"
                    value={`${stats.withAttachmentCount}`}
                    detail={`${stats.withoutAttachmentCount} saknar bilaga`}
                    percent={attachmentCoverage}
                    tone="emerald"
                  />
                  <MetricBar
                    label="Moms ruta 49"
                    value={money(vat49)}
                    detail={`Period ${monthRange.start} - ${monthRange.end}`}
                    percent={100}
                    tone="amber"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Ordermix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <MetricBar
                    label="Kommersiellt totalvärde"
                    value={money(orderMix.totals.total)}
                    detail={orderMix.totals.total > 0 ? `${money(orderMix.totals.changeAndSupplement)} ligger i ändringar och tillägg` : 'Inga ordervärden ännu'}
                    stacked
                    segments={[
                      { label: orderKindLabel('primary'), percent: orderMix.shares.primary, tone: 'blue' },
                      { label: orderKindLabel('change'), percent: orderMix.shares.change, tone: 'amber' },
                      { label: orderKindLabel('supplement'), percent: orderMix.shares.supplement, tone: 'emerald' }
                    ]}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ReviewFact label="Huvudorder" value={money(orderMix.totals.primary)} />
                    <ReviewFact label="Ändringar" value={money(orderMix.totals.change)} />
                    <ReviewFact label="Tillägg" value={money(orderMix.totals.supplement)} />
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={'/reports' as Route}>Öppna orderfördelning i rapporter</Link>
                  </Button>
                </CardContent>
              </Card>

              {stats.latest ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Senaste aktivitet</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="font-medium">
                      {verificationNumberLabel(stats.latest.fiscal_year, stats.latest.verification_no)} {stats.latest.description}
                    </p>
                    <p className="text-foreground/70">
                      {formatDateTime(stats.latest.created_at)} • {statusLabel(stats.latest.status)} • {Number(stats.latest.total).toFixed(2)} kr
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{sourceLabel(stats.latest.source)}</Badge>
                      <Badge className="border-border/70 bg-muted/50 text-foreground/80 hover:bg-muted/50">
                        {stats.latest.attachment_path ? 'Med bilaga' : 'Utan bilaga'}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/finance/verifications/${stats.latest.id}`}>Öppna verifikation</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      ) : view === 'invoicing' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Faktureringskö</CardTitle>
                <p className="text-sm text-foreground/60">Här jobbar ekonomi vidare med underlag som är redo, fastställda eller behöver betalningsuppföljning.</p>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'sent', 'awaiting_payment', 'overdue'] as InvoicingQueueStage[]).map((stage) => (
                <MiniStatCard
                  key={stage}
                  icon={Wallet}
                  title={stageLabel(stage)}
                  value={String(invoicingQueueByStage[stage].length)}
                  detail="ärenden"
                  compact
                  tone={stage === 'overdue' ? 'rose' : stage === 'approved_today' ? 'emerald' : stage === 'awaiting_payment' ? 'amber' : 'blue'}
                />
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'sent', 'awaiting_payment', 'overdue'] as InvoicingQueueStage[]).map((stage) => (
              <Card key={stage} className="xl:col-span-1">
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
                          <p><span className="text-foreground/55">Nästa steg:</span> {item.nextStep}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
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
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Sök och urval</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={'/help/lagga-till-verifikation' as Route}>Hur använder jag verifikationer?</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,180px))]">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Sök verifikation</p>
                    <Input placeholder="Text, id, ver.nr" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Status</p>
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla statusar</SelectItem>
                        <SelectItem value="booked">Bokförd</SelectItem>
                        <SelectItem value="voided">Makulerad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Källa</p>
                    <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
                      <SelectTrigger><SelectValue placeholder="Källa" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla källor</SelectItem>
                        <SelectItem value="mobile">Mobil</SelectItem>
                        <SelectItem value="desktop">Desktop</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Bilaga</p>
                    <Select value={attachmentFilter} onValueChange={(value) => setAttachmentFilter(value as AttachmentFilter)}>
                      <SelectTrigger><SelectValue placeholder="Bilaga" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla bilagor</SelectItem>
                        <SelectItem value="with">Med bilaga</SelectItem>
                        <SelectItem value="without">Utan bilaga</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/70">
                  <span className="font-medium text-foreground">{stats.allCount}</span>
                  <span>matchande verifikationer</span>
                  {hasActiveFilters ? (
                    <>
                      <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                        {normalizedSearch ? `Sök: ${search}` : 'Filtrerat urval'}
                      </Badge>
                      {statusFilter !== 'all' ? <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">Status: {statusFilter === 'booked' ? 'Bokförd' : 'Makulerad'}</Badge> : null}
                      {sourceFilter !== 'all' ? <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">Källa: {sourceLabel(sourceFilter)}</Badge> : null}
                      {attachmentFilter !== 'all' ? <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">{attachmentFilter === 'with' ? 'Med bilaga' : 'Utan bilaga'}</Badge> : null}
                    </>
                  ) : (
                    <span>Visar senaste verifikationerna utan extra filter</span>
                  )}
                </div>
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setSourceFilter('all');
                      setAttachmentFilter('all');
                    }}
                  >
                    Rensa filter
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-full border border-border/70 bg-muted/40 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={verificationLayout === 'compact' ? 'default' : 'ghost'}
                    className="rounded-full"
                    onClick={() => setVerificationLayout('compact')}
                  >
                    Kompakt
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={verificationLayout === 'review' ? 'default' : 'ghost'}
                    className="rounded-full"
                    onClick={() => setVerificationLayout('review')}
                  >
                    Granskning
                  </Button>
                </div>
                <p className="text-sm text-foreground/60">
                  {verificationLayout === 'compact'
                    ? 'Kortare rader för snabb scanning.'
                    : 'Mer sammanhang och tydligare riskflaggor per verifikation.'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniStatCard icon={ClipboardList} title="Urval" value={String(stats.allCount)} detail="Matchande verifikationer" compact tone="blue" />
                <MiniStatCard icon={Wallet} title="Bokfört" value={money(stats.totalBooked)} detail="Summerat från urvalet" compact tone="emerald" />
                <MiniStatCard icon={FileText} title="Saknar underlag" value={String(stats.withoutAttachmentCount)} detail="Poster utan bilaga" compact tone="amber" />
                <MiniStatCard icon={BarChart3} title="Makulerade" value={String(stats.voidedCount)} detail="I samma urval" compact tone="rose" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 md:hidden">
            {filteredRows.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-foreground/70">Inga verifikationer matchar filtret.</CardContent>
              </Card>
            ) : (
              filteredRows.map((row) => (
                <Link key={row.id} href={`/finance/verifications/${row.id}`} className="block">
                  <Card className="overflow-hidden p-0 transition hover:border-primary/35 hover:bg-muted/20">
                    <div className="border-b border-border/70 bg-muted/25 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Verifikation</p>
                          <p className="mt-1 font-medium">{verificationNumberLabel(row.fiscal_year, row.verification_no)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge>{statusLabel(row.status)}</Badge>
                          <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-sm font-semibold">
                            {Number(row.total).toFixed(2)} kr
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <p className="text-sm font-medium leading-snug">{row.description}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Datum</p>
                          <p className="mt-1 text-sm">{formatDate(row.date)}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Källa</p>
                          <p className="mt-1 text-sm">{sourceLabel(row.source)}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Skapad</p>
                          <p className="mt-1 text-sm">{formatDateTime(row.created_at)}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Bilaga</p>
                          <p className="mt-1 text-sm">{row.attachment_path ? 'Ja' : 'Nej'}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>

          {verificationLayout === 'compact' ? (
            <Card className="hidden p-0 md:block">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Nr</TableHead><TableHead>Datum</TableHead><TableHead>Beskrivning</TableHead><TableHead>Total</TableHead><TableHead>Läge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-foreground/70">Inga verifikationer matchar filtret.</TableCell></TableRow>
                  ) : filteredRows.map((row) => (
                    <TableRow key={row.id} className={`transition-colors ${verificationRowTone(row.status)}`}>
                      <TableCell className="font-medium">{verificationNumberLabel(row.fiscal_year, row.verification_no)}</TableCell>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="max-w-[520px]">
                        <Link href={`/finance/verifications/${row.id}`} className="block min-w-0 font-medium underline-offset-4 hover:underline">
                          <span className="block truncate">{row.description}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{Number(row.total).toFixed(2)} kr</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={verificationStatusBadgeTone(row.status)}>
                            {statusLabel(row.status)}
                          </Badge>
                          <Badge
                            className={
                              row.attachment_path
                                ? 'border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40'
                                : 'border-amber-300/70 bg-amber-100/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200'
                            }
                          >
                            {!row.attachment_path ? <AlertTriangle className="mr-1 h-3.5 w-3.5" /> : null}
                            {row.attachment_path ? 'Bilaga' : 'Saknar bilaga'}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="hidden gap-3 md:grid">
              {filteredRows.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-sm text-foreground/70">Inga verifikationer matchar filtret.</CardContent>
                </Card>
              ) : (
                filteredRows.map((row) => {
                  const reviewFlags = [
                    !row.attachment_path ? 'Saknar bilaga' : null,
                    row.status === 'voided' ? 'Makulerad' : null,
                    row.source === 'offline' ? 'Offlinekälla' : null
                  ].filter((flag): flag is string => Boolean(flag));

                  return (
                    <Link key={row.id} href={`/finance/verifications/${row.id}`} className="block">
                      <Card className={`border-border/70 transition hover:border-primary/35 ${row.status === 'voided' ? 'bg-rose-50/45 dark:bg-rose-950/10' : 'bg-emerald-50/30 dark:bg-emerald-950/5'}`}>
                        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.9fr)]">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Verifikation</p>
                                <p className="mt-1 font-semibold">{verificationNumberLabel(row.fiscal_year, row.verification_no)}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge className={verificationStatusBadgeTone(row.status)}>
                                  {statusLabel(row.status)}
                                </Badge>
                                <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                                  {sourceLabel(row.source)}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm leading-6 text-foreground/85">{row.description}</p>
                            <div className="flex flex-wrap gap-2">
                              {reviewFlags.length > 0 ? (
                                reviewFlags.map((flag) => (
                                  <Badge key={flag} className="border-amber-300/70 bg-amber-100/70 text-amber-900 hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200">
                                    {flag === 'Saknar bilaga' ? <AlertTriangle className="mr-1 h-3.5 w-3.5" /> : null}
                                    {flag}
                                  </Badge>
                                ))
                              ) : (
                                <Badge className="border-emerald-300/70 bg-emerald-100/70 text-emerald-900 hover:bg-emerald-100/70 dark:border-emerald-900/50 dark:bg-emerald-500/15 dark:text-emerald-200">
                                  Ser komplett ut
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            <ReviewFact label="Belopp" value={`${Number(row.total).toFixed(2)} kr`} />
                            <ReviewFact label="Verifikationsdatum" value={formatDate(row.date)} />
                            <ReviewFact label="Skapad" value={formatDateTime(row.created_at)} />
                            <ReviewFact label="Underlag" value={row.attachment_path ? 'Bilaga finns' : 'Saknas'} />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MobileFinanceAction({
  href,
  label,
  variant = 'default'
}: {
  href: Route;
  label: string;
  variant?: 'default' | 'secondary' | 'outline';
}) {
  return (
    <Button asChild variant={variant} className="h-auto min-h-11 whitespace-normal py-3 text-center">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function MiniStatCard({
  icon: Icon,
  title,
  value,
  detail,
  compact = false,
  tone = 'neutral'
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
  compact?: boolean;
  tone?: 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses = {
    neutral: 'border-border/70 bg-card/70',
    blue: 'border-sky-200/60 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20',
    emerald: 'border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    amber: 'border-amber-200/60 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
    rose: 'border-rose-200/60 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
  } as const;

  const iconToneClasses = {
    neutral: 'border-border/70 bg-muted/35 text-foreground/65',
    blue: 'border-sky-200/70 bg-sky-100/70 text-sky-700 dark:border-sky-900/50 dark:bg-sky-900/40 dark:text-sky-200',
    emerald: 'border-emerald-200/70 bg-emerald-100/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/40 dark:text-emerald-200',
    amber: 'border-amber-200/70 bg-amber-100/70 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/40 dark:text-amber-200',
    rose: 'border-rose-200/70 bg-rose-100/70 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/40 dark:text-rose-200'
  } as const;

  return (
    <div className={`rounded-xl border ${toneClasses[tone]} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{title}</p>
          <p className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold tracking-tight`}>{value}</p>
          <p className="text-xs text-foreground/65">{detail}</p>
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${iconToneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  detail,
  percent,
  tone = 'blue',
  stacked = false,
  segments = []
}: {
  label: string;
  value: string;
  detail: string;
  percent?: number;
  tone?: 'blue' | 'emerald' | 'amber' | 'rose';
  stacked?: boolean;
  segments?: Array<{ label: string; percent: number; tone: 'blue' | 'emerald' | 'amber' | 'rose' }>;
}) {
  const barTones = {
    blue: 'bg-sky-500/85',
    emerald: 'bg-emerald-500/85',
    amber: 'bg-amber-500/85',
    rose: 'bg-rose-500/85'
  } as const;

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="text-lg font-semibold tracking-tight">{value}</p>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted/70">
        {stacked ? (
          <div className="flex h-full w-full">
            {segments.map((segment) => (
              <div
                key={segment.label}
                className={barTones[segment.tone]}
                style={{ width: `${segment.percent}%` }}
                title={`${segment.label}: ${segment.percent}%`}
              />
            ))}
          </div>
        ) : (
          <div className={`h-full rounded-full ${barTones[tone]}`} style={{ width: `${percent ?? 0}%` }} />
        )}
      </div>
      <p className="text-xs text-foreground/65">{detail}</p>
    </div>
  );
}

function TodoCard({
  title,
  count,
  hidden,
  dismissedAt,
  onDone,
  onUndo,
  children
}: {
  title: string;
  count: number;
  hidden: boolean;
  dismissedAt: string | null;
  onDone: () => void;
  onUndo: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">{count}</Badge>
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">
            {hidden ? 'Pausad för idag' : 'Fokuspunkt'}
          </p>
        </div>
        {hidden ? <Button size="sm" variant="outline" onClick={onUndo}>Ångra</Button> : <Button size="sm" variant="outline" onClick={onDone}>Klar för idag</Button>}
      </div>

      {hidden ? (
        <div className="space-y-1 text-sm text-foreground/70">
          <p>Markerad som klar för idag.</p>
          {dismissedAt ? <p>Senast markerad klar: {formatDateTime(dismissedAt)}</p> : null}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/15 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground/85">{value}</p>
    </div>
  );
}


