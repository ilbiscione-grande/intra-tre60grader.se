'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canViewFinance, canWriteFinance } from '@/lib/auth/capabilities';
import { getInvoiceReadinessLabel } from '@/lib/finance/invoiceReadiness';
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
  href: Route;
  secondaryHref?: Route;
  meta: string;
  entityId: string;
  projectId?: string;
  reasons: string[];
  hasUnorderedBillableTime?: boolean;
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

export default function InvoicesPage() {
  const { companyId, role, capabilities } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const canReadFinance = canViewFinance(role, capabilities);
  const canEditFinance = canWriteFinance(role, capabilities);
  const todayIso = new Date().toISOString().slice(0, 10);

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
        .select('project_id,order_id,hours,is_billable')
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
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const { data: existingOrder, error: existingOrderError } = await supabase
        .from('orders')
        .select('id,total')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingOrderError) throw existingOrderError;

      let orderId = existingOrder?.id ?? null;
      if (!orderId) {
        const { data: createdOrder, error: createOrderError } = await supabase
          .from('orders')
          .insert({
            company_id: companyId,
            project_id: projectId,
            status: 'draft',
            total: 0,
            invoice_readiness_status: 'ready_for_invoicing'
          })
          .select('id')
          .single();

        if (createOrderError) throw createOrderError;
        orderId = createdOrder.id;
      }

      const { data: timeRows, error: timeError } = await supabase
        .from('project_time_entries')
        .select('id,hours')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .eq('is_billable', true)
        .is('order_id', null);

      if (timeError) throw timeError;

      const totalHours = (timeRows ?? []).reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
      if (totalHours <= 0) throw new Error('Ingen okopplad fakturerbar tid att lägga på order');

      const plan = (financePlansQuery.data ?? []).find((row) => row.project_id === projectId);
      const budgetHours = Number(plan?.budget_hours ?? 0);
      const budgetRevenue = Number(plan?.budget_revenue ?? 0);
      const inferredRate = budgetHours > 0 && budgetRevenue > 0 ? Math.round((budgetRevenue / budgetHours) * 100) / 100 : 0;
      const lineTotal = Math.round(totalHours * inferredRate * 100) / 100;
      const title = `Fakturerbar tid ${totalHours.toFixed(2)} h`;

      const { error: lineError } = await supabase.from('order_lines').insert({
        company_id: companyId,
        order_id: orderId,
        title,
        qty: totalHours,
        unit_price: inferredRate,
        vat_rate: 25,
        total: lineTotal
      });

      if (lineError) throw lineError;

      const { error: timeUpdateError } = await supabase
        .from('project_time_entries')
        .update({ order_id: orderId })
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .eq('is_billable', true)
        .is('order_id', null);

      if (timeUpdateError) throw timeUpdateError;

      const { data: orderLines, error: sumError } = await supabase
        .from('order_lines')
        .select('total')
        .eq('company_id', companyId)
        .eq('order_id', orderId);

      if (sumError) throw sumError;

      const recalculatedTotal = (orderLines ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);
      const roundedTotal = Math.round(recalculatedTotal * 100) / 100;

      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({ total: roundedTotal, invoice_readiness_status: 'ready_for_invoicing' })
        .eq('company_id', companyId)
        .eq('id', orderId);

      if (orderUpdateError) throw orderUpdateError;

      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({ invoice_readiness_status: 'ready_for_invoicing' })
        .eq('company_id', companyId)
        .eq('id', projectId);

      if (projectUpdateError) throw projectUpdateError;

      return { orderId, totalHours, inferredRate };
    },
    onSuccess: async ({ totalHours, inferredRate }) => {
      toast.success(
        inferredRate > 0
          ? `Orderrad skapad från ${totalHours.toFixed(2)} h`
          : `Orderrad skapad från ${totalHours.toFixed(2)} h. Sätt pris innan fakturering.`
      );
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
        const reasons = [
          !project.customer_id ? 'Kund saknas på projektet' : null,
          !project.responsible_user_id ? 'Projektansvarig saknas' : null,
          unorderedBillableHours > 0 ? `${unorderedBillableHours.toFixed(1)} h fakturerbar tid saknar orderkoppling` : null,
          'Projektet är markerat redo men saknar orderunderlag i kön'
        ].filter((reason): reason is string => Boolean(reason));

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
          href: `/projects/${project.id}?tab=economy` as Route,
          meta: 'Projekt • Redo att ses över',
          entityId: project.id,
          projectId: project.id,
          reasons,
          hasUnorderedBillableTime: unorderedBillableHours > 0
        };
      });

    const completedNotReadyItems = (completedProjectsQuery.data ?? [])
      .filter((project) => !queuedProjectIds.has(project.id))
      .filter((project) => !invoicedProjectIds.has(project.id))
      .filter((project) => project.invoice_readiness_status === 'not_ready' || !project.invoice_readiness_status)
      .map((project) => {
        const unorderedBillableHours = unorderedBillableHoursByProject.get(project.id) ?? 0;
        const reasons = [
          'Projektet är klart men inte markerat redo för fakturering',
          unorderedBillableHours > 0 ? `${unorderedBillableHours.toFixed(1)} h fakturerbar tid väntar på orderunderlag` : null,
          !project.customer_id ? 'Kund saknas på projektet' : null
        ].filter((reason): reason is string => Boolean(reason));

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
          href: `/projects/${project.id}?tab=economy` as Route,
          meta: 'Projekt • Klart men ej förberett för fakturering',
          entityId: project.id,
          projectId: project.id,
          reasons,
          hasUnorderedBillableTime: unorderedBillableHours > 0
        };
      });

    const orderItems = (invoicingOrdersQuery.data ?? []).map((order) => {
      const project = projectsById.get(order.project_id);
      const projectTitle = project?.title ?? 'Projekt';
      const customerName = project?.customer_id ? customersById.get(project.customer_id) ?? 'Ingen kund' : 'Ingen kund';
      const stage: InvoicingQueueStage =
        order.invoice_readiness_status === 'approved_for_invoicing' ? 'approved_today' : 'waiting_for_approval';
      const lineStats = orderLineStats.get(order.id) ?? { count: 0, total: 0 };
      const reasons = [
        lineStats.count === 0 ? 'Orderrader saknas' : null,
        Number(order.total ?? 0) <= 0 ? 'Ordervärde är 0 kr' : null,
        !project?.customer_id ? 'Kund saknas på kopplat projekt' : null,
        stage === 'waiting_for_approval' ? 'Väntar på fastställelse från ekonomi' : 'Kan nu omvandlas till faktura'
      ].filter((reason): reason is string => Boolean(reason));

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
        projectId: order.project_id,
        reasons
      };
    });

    const invoiceItems = (invoiceTodoQuery.data ?? []).map((invoice) => {
      const overdue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.due_date < todayIso;
      const unpaid = invoice.status !== 'paid' && invoice.status !== 'void';
      const stage: InvoicingQueueStage = overdue ? 'overdue' : unpaid ? 'awaiting_payment' : 'sent';
      const reasons = [
        overdue ? `Förfallen sedan ${formatDate(invoice.due_date)}` : null,
        !overdue && unpaid ? `Obetald med förfallodatum ${formatDate(invoice.due_date)}` : null,
        stage === 'sent' ? 'Skickad och väntar på kundens hantering' : null
      ].filter((reason): reason is string => Boolean(reason));

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
        href: `/invoices/${invoice.id}` as Route,
        meta: `Faktura • Förfallo ${formatDate(invoice.due_date)}`,
        entityId: invoice.id,
        reasons
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

    for (const item of invoicingQueue) initial[item.stage].push(item);
    return initial;
  }, [invoicingQueue]);

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
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {(['ready_to_review', 'waiting_for_approval', 'approved_today', 'sent', 'awaiting_payment', 'overdue'] as InvoicingQueueStage[]).map((stage) => (
            <InvoiceMetricCard
              key={stage}
              icon={Wallet}
              label={stageLabel(stage)}
              value={String(invoicingQueueByStage[stage].length)}
            />
          ))}
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
                          onClick={() => createOrderLineFromTimeMutation.mutate({ projectId: item.entityId })}
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
