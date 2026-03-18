'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createInvoiceFromOrder } from '@/lib/rpc';
import { useProjectColumns } from '@/features/projects/projectQueries';
import ProjectFinancePanel from '@/features/projects/ProjectFinancePanel';
import { createClient } from '@/lib/supabase/client';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { ProjectStatus, Role } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';
import { useSwipeTabs } from '@/lib/ui/useSwipeTabs';

type ProjectRow = Pick<
  DbRow<'projects'>,
  'id' | 'company_id' | 'title' | 'status' | 'position' | 'customer_id' | 'created_at' | 'updated_at'
>;

type CustomerRow = Pick<DbRow<'customers'>, 'id' | 'name'>;
type OrderRow = Pick<DbRow<'orders'>, 'id' | 'project_id' | 'status' | 'total' | 'created_at'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceRow = Pick<
  DbRow<'invoices'>,
  'id' | 'invoice_no' | 'status' | 'currency' | 'issue_date' | 'due_date' | 'subtotal' | 'vat_total' | 'total' | 'created_at'
>;

type ActivityItem = {
  id: string;
  at: string;
  text: string;
  source: 'system' | 'user';
};
type ProjectTab = 'overview' | 'updates' | 'economy' | 'attachments' | 'members' | 'logs';

const orderStatuses = ['draft', 'sent', 'paid', 'cancelled', 'invoiced'] as const;
type OrderStatus = (typeof orderStatuses)[number];
const projectTabs: Array<{ id: ProjectTab; label: string }> = [
  { id: 'overview', label: 'Översikt' },
  { id: 'updates', label: 'Uppdateringar' },
  { id: 'economy', label: 'Ekonomi' },
  { id: 'attachments', label: 'Bilagor' },
  { id: 'members', label: 'Medlemmar' },
  { id: 'logs', label: 'Loggar' }
];

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeLineTotal(qty: number, unitPrice: number) {
  return Math.round(qty * unitPrice * 100) / 100;
}

function extractInvoiceSummary(result: unknown) {
  if (!result || typeof result !== 'object') return 'Faktura skapad';

  const record = result as Record<string, unknown>;
  const invoiceNo = record.invoice_no ?? record.invoiceNo ?? record.number;
  const invoiceId = record.invoice_id ?? record.invoiceId ?? record.id;

  if (typeof invoiceNo === 'string' && invoiceNo.trim()) return `Faktura skapad: ${invoiceNo}`;
  if (typeof invoiceId === 'string' && invoiceId.trim()) return `Faktura skapad (id: ${invoiceId})`;
  return 'Faktura skapad';
}

function orderStatusEtikett(status: string) {
  const map: Record<string, string> = {
    draft: 'Utkast',
    sent: 'Skickad',
    paid: 'Betald',
    cancelled: 'Avbruten',
    invoiced: 'Fakturerad'
  };
  return map[status] ?? status;
}

function fakturaStatusEtikett(status: string) {
  const map: Record<string, string> = {
    issued: 'Utfärdad',
    sent: 'Skickad',
    paid: 'Betald',
    void: 'Makulerad'
  };
  return map[status] ?? status;
}

function canManageOrder(role: Role) {
  return role === 'finance' || role === 'admin';
}

export default function ProjectDetailsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { companyId, role } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftStatus, setDraftStatus] = useState<ProjectStatus>('');
  const [draftCustomerId, setDraftCustomerId] = useState<string>('none');

  const [lineTitle, setLineTitle] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('0');
  const [lineVatRate, setLineVatRate] = useState('25');

  const [latestInvoiceResult, setLatestInvoiceResult] = useState<Json | null>(null);
  const [localActivity, setLocalActivity] = useState<ActivityItem[]>([]);
  const isProduction = process.env.NODE_ENV === 'production';

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingOrderStatus, setPendingOrderStatus] = useState<OrderStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderLineRow | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>('overview');
  const swipeHandlers = useSwipeTabs({
    tabs: projectTabs.map((tab) => tab.id),
    activeTab,
    onChange: setActiveTab
  });
  const { containerRef, registerItem } = useAutoScrollActiveTab(activeTab);

  function addLocalActivity(text: string) {
    setLocalActivity((prev) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), text, source: 'user' },
      ...prev
    ]);
  }

  const projectQuery = useQuery<ProjectRow | null>({
    queryKey: ['project', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,company_id,title,status,position,customer_id,created_at,updated_at')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<ProjectRow>();

      if (error) throw error;
      return data;
    }
  });

  const columnsQuery = useProjectColumns(companyId);

  const customersQuery = useQuery<CustomerRow[]>({
    queryKey: ['customers', companyId, 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name')
        .returns<CustomerRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const orderQuery = useQuery<OrderRow | null>({
    queryKey: ['project-order', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .maybeSingle<OrderRow>();

      if (error) throw error;
      return data;
    }
  });

  const orderId = orderQuery.data?.id;
  const statusColumns = columnsQuery.data ?? [];

  const linesQuery = useQuery<OrderLineRow[]>({
    queryKey: ['project-order-lines', companyId, projectId, orderId ?? 'none'],
    enabled: Boolean(orderId),
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('order_lines')
        .select('id,title,qty,unit_price,vat_rate,total,created_at')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .returns<OrderLineRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,status,currency,issue_date,due_date,subtotal,vat_total,total,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(25)
        .returns<InvoiceRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  useEffect(() => {
    if (!projectQuery.data) return;
    setDraftTitle(projectQuery.data.title);
    setDraftStatus(projectQuery.data.status as ProjectStatus);
    setDraftCustomerId(projectQuery.data.customer_id ?? 'none');
  }, [projectQuery.data?.customer_id, projectQuery.data?.status, projectQuery.data?.title]);

  useEffect(() => {
    if (!draftStatus && statusColumns.length > 0) {
      setDraftStatus(statusColumns[0].key);
    }
  }, [draftStatus, statusColumns]);

  async function ensureOrderId() {
    if (orderQuery.data?.id) return orderQuery.data.id;

    const { data, error } = await supabase
      .from('orders')
      .insert({ company_id: companyId, project_id: projectId, status: 'draft', total: 0 })
      .select('id,project_id,status,total,created_at')
      .single<OrderRow>();

    if (error) throw error;
    if (!data?.id) throw new Error('Kunde inte skapa order');

    await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
    addLocalActivity('Order skapad');
    return data.id;
  }

  async function recalcOrderTotal(nextOrderId: string) {
    const { data: rows, error: rowsError } = await supabase
      .from('order_lines')
      .select('total')
      .eq('company_id', companyId)
      .eq('order_id', nextOrderId)
      .returns<Array<Pick<DbRow<'order_lines'>, 'total'>>>();

    if (rowsError) throw rowsError;

    const total = (rows ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);

    const { error: updateError } = await supabase
      .from('orders')
      .update({ total: Math.round(total * 100) / 100 })
      .eq('company_id', companyId)
      .eq('id', nextOrderId);

    if (updateError) throw updateError;
  }

  const saveProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectQuery.data) throw new Error('Projekt saknas');

      const title = draftTitle.trim();
      if (!title) throw new Error('Titel krävs');

      if (!draftStatus) throw new Error('Kolumn krävs');

      const payload: Partial<ProjectRow> = {
        title,
        status: draftStatus,
        customer_id: draftCustomerId === 'none' ? null : draftCustomerId
      };

      const { error } = await supabase
        .from('projects')
        .update(payload)
        .eq('company_id', companyId)
        .eq('id', projectId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      addLocalActivity('Projekt uppdaterat');
      toast.success('Projekt uppdaterat');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara projekt');
    }
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const nextOrderId = await ensureOrderId();
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('company_id', companyId)
        .eq('id', nextOrderId);
      if (error) throw error;
      return status;
    },
    onSuccess: async (status) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      addLocalActivity(`Orderstatus ändrad till ${orderStatusEtikett(status)}`);
      toast.success('Orderstatus uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera orderstatus');
    }
  });

  const addLineMutation = useMutation({
    mutationFn: async () => {
      const title = lineTitle.trim();
      if (!title) throw new Error('Radtitel krävs');

      const qty = Math.max(0, toNumber(lineQty, 0));
      const unitPrice = Math.max(0, toNumber(lineUnitPrice, 0));
      const vatRate = Math.max(0, toNumber(lineVatRate, 0));
      const total = computeLineTotal(qty, unitPrice);
      const nextOrderId = await ensureOrderId();

      const { error } = await supabase.from('order_lines').insert({
        company_id: companyId,
        order_id: nextOrderId,
        title,
        qty,
        unit_price: unitPrice,
        vat_rate: vatRate,
        total
      });
      if (error) throw error;

      await recalcOrderTotal(nextOrderId);
      return { title, total };
    },
    onSuccess: async (result) => {
      setLineTitle('');
      setLineQty('1');
      setLineUnitPrice('0');
      setLineVatRate('25');
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad tillagd: ${result.title} (${result.total.toFixed(2)} kr)`);
      toast.success('Orderrad tillagd');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till orderrad');
    }
  });

  const updateLineMutation = useMutation({
    mutationFn: async (line: OrderLineRow) => {
      const qty = Math.max(0, Number(line.qty));
      const unitPrice = Math.max(0, Number(line.unit_price));
      const vatRate = Math.max(0, Number(line.vat_rate));
      const total = computeLineTotal(qty, unitPrice);

      const { error } = await supabase
        .from('order_lines')
        .update({ title: line.title, qty, unit_price: unitPrice, vat_rate: vatRate, total })
        .eq('company_id', companyId)
        .eq('id', line.id);
      if (error) throw error;

      if (orderId) await recalcOrderTotal(orderId);
      return { title: line.title, total };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad uppdaterad: ${result.title} (${result.total.toFixed(2)} kr)`);
      toast.success('Orderrad uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera orderrad');
    }
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (line: OrderLineRow) => {
      const { error } = await supabase
        .from('order_lines')
        .delete()
        .eq('company_id', companyId)
        .eq('id', line.id);
      if (error) throw error;

      if (orderId) await recalcOrderTotal(orderId);
      return line;
    },
    onSuccess: async (line) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad borttagen: ${line.title}`);
      toast.success('Orderrad borttagen');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort orderrad');
    }
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('Order saknas');
      return createInvoiceFromOrder(orderId);
    },
    onSuccess: async (result) => {
      const payload = (result ?? null) as Json | null;
      const summary = extractInvoiceSummary(result);
      setLatestInvoiceResult(payload);
      addLocalActivity(summary);
      toast.success(summary);
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', companyId, projectId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura');
    }
  });

  const activity = useMemo(() => {
    const items: ActivityItem[] = [...localActivity];

    if (projectQuery.data) {
      items.push({
        id: `project-created-${projectQuery.data.id}`,
        at: projectQuery.data.created_at,
        text: 'Projekt skapat',
        source: 'system'
      });
      items.push({
        id: `project-updated-${projectQuery.data.id}`,
        at: projectQuery.data.updated_at,
        text: 'Projekt senast uppdaterat',
        source: 'system'
      });
    }

    if (orderQuery.data) {
      items.push({
        id: `order-created-${orderQuery.data.id}`,
        at: orderQuery.data.created_at,
        text: `Order skapad (${orderStatusEtikett(orderQuery.data.status)})`,
        source: 'system'
      });
    }

    for (const line of linesQuery.data ?? []) {
      items.push({
        id: `line-created-${line.id}`,
        at: line.created_at,
        text: `Orderrad skapad: ${line.title}`,
        source: 'system'
      });
    }

    for (const invoice of invoicesQuery.data ?? []) {
      items.push({
        id: `invoice-${invoice.id}`,
        at: invoice.created_at,
        text: `Faktura ${invoice.invoice_no} skapad`,
        source: 'system'
      });
    }

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [localActivity, orderQuery.data, projectQuery.data, linesQuery.data, invoicesQuery.data]);

  if (projectQuery.isLoading) return <p>Laddar...</p>;
  if (!projectQuery.data) return <p>Projekt saknas.</p>;

  const project = projectQuery.data;
  const lines = linesQuery.data ?? [];
  const statusValue = orderStatuses.includes((orderQuery.data?.status ?? 'draft') as OrderStatus)
    ? (orderQuery.data?.status as OrderStatus)
    : 'draft';
  const isEconomyLocked = (invoicesQuery.data ?? []).some((invoice) => invoice.status !== 'void');

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Projektdetaljer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Skapad: {new Date(project.created_at).toLocaleDateString('sv-SE')}</Badge>
            <Badge>Uppdaterad: {new Date(project.updated_at).toLocaleString('sv-SE')}</Badge>
            {project.customer_id ? <Badge>Kund kopplad</Badge> : <Badge>Ingen kund</Badge>}
            {isEconomyLocked ? <Badge>Låst efter fakturering</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <div ref={containerRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {projectTabs.map((tab) => (
          <Button
            key={tab.id}
            ref={registerItem(tab.id)}
            type="button"
            variant={activeTab === tab.id ? 'default' : 'outline'}
            className="shrink-0"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4" {...swipeHandlers}>
          <Card>
            <CardHeader>
              <CardTitle>Översikt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm">Titel</span>
                  <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={isEconomyLocked} />
                </label>

                <label className="space-y-1">
                  <span className="text-sm">Kolumn</span>
                  <Select value={draftStatus} onValueChange={(value) => setDraftStatus(value as ProjectStatus)}>
                    <SelectTrigger disabled={isEconomyLocked}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusColumns.map((column) => (
                        <SelectItem key={column.key} value={column.key}>
                          {column.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm">Kund</span>
                  <Select value={draftCustomerId} onValueChange={setDraftCustomerId}>
                    <SelectTrigger disabled={isEconomyLocked}>
                      <SelectValue placeholder="Välj kund" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen kund</SelectItem>
                      {(customersQuery.data ?? []).map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Kund</p>
                  <p className="mt-1 font-medium">{(customersQuery.data ?? []).find((c) => c.id === draftCustomerId)?.name ?? 'Ingen kund'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Orderrader</p>
                  <p className="mt-1 font-medium">{lines.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Fakturor</p>
                  <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Ordertotal</p>
                  <p className="mt-1 font-medium">{Number(orderQuery.data?.total ?? 0).toFixed(2)} kr</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => saveProjectMutation.mutate()} disabled={saveProjectMutation.isPending || isEconomyLocked}>
                  {saveProjectMutation.isPending ? 'Sparar...' : 'Spara projekt'}
                </Button>
                {orderId ? (
                  <Button asChild variant="outline">
                    <Link href={`/orders/${orderId}`}>Öppna order</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'updates' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Uppdateringar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activity.length === 0 && <p className="text-sm text-foreground/70">Inga aktiviteter ännu.</p>}
              {activity.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.text}</p>
                    <Badge>{item.source}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-foreground/70">{new Date(item.at).toLocaleString('sv-SE')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'economy' && (
        <div className="space-y-4" {...swipeHandlers}>
          <ProjectFinancePanel companyId={companyId} projectId={projectId} role={role} isLocked={isEconomyLocked} />

          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Total: {Number(orderQuery.data?.total ?? 0).toFixed(2)} kr</Badge>{isEconomyLocked && <Badge>Låst efter fakturering</Badge>}

                <RoleGate
                  role={role}
                  allow={['finance', 'admin']}
                  fallback={<p className="text-sm text-foreground/70">Ekonomi/Admin kan ändra orderstatus och skapa faktura.</p>}
                >
                  <div className="w-52">
                    <Select
                      value={statusValue}
                      onValueChange={(value) => {
                        const next = value as OrderStatus;
                        if (next === 'cancelled' && statusValue !== 'cancelled') {
                          setPendingOrderStatus(next);
                          setCancelConfirmOpen(true);
                          return;
                        }
                        updateOrderStatusMutation.mutate(next);
                      }}
                    >
                      <SelectTrigger disabled={isEconomyLocked}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {orderStatusEtikett(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => invoiceMutation.mutate()}
                    disabled={invoiceMutation.isPending || !orderId || !canManageOrder(role) || isEconomyLocked}
                  >
                    {invoiceMutation.isPending ? 'Skapar...' : 'Skapa faktura'}
                  </Button>
                </RoleGate>
              </div>

              {latestInvoiceResult && (
                <Card className="border-dashed">
                  <CardContent className="p-3 text-sm">
                    <p className="font-medium">Senaste fakturasvar</p>
                    <p className="text-foreground/70">{extractInvoiceSummary(latestInvoiceResult)}</p>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(latestInvoiceResult, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Lägg till orderrad</p>
                <div className="grid gap-2 md:grid-cols-5">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Titel</span>
                    <Input value={lineTitle} onChange={(e) => setLineTitle(e.target.value)} placeholder="T.ex. Designarbete" disabled={isEconomyLocked} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Antal</span>
                    <Input value={lineQty} onChange={(e) => setLineQty(e.target.value)} type="number" min="0" step="0.01" placeholder="1" disabled={isEconomyLocked} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">A-pris</span>
                    <Input
                      value={lineUnitPrice}
                      onChange={(e) => setLineUnitPrice(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      disabled={isEconomyLocked}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Moms %</span>
                    <Input value={lineVatRate} onChange={(e) => setLineVatRate(e.target.value)} type="number" min="0" step="0.01" placeholder="25" disabled={isEconomyLocked} />
                  </label>
                </div>
                <Button className="mt-2" onClick={() => addLineMutation.mutate()} disabled={addLineMutation.isPending || isEconomyLocked}>
                  {addLineMutation.isPending ? 'Lägger till...' : 'Lägg till rad'}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Antal</TableHead>
                    <TableHead>A-pris</TableHead>
                    <TableHead>Moms %</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-foreground/70">
                        Inga orderrader ännu.
                      </TableCell>
                    </TableRow>
                  )}

                  {lines.map((line) => (
                    <EditableLineRow
                      key={line.id}
                      line={line}
                      saving={updateLineMutation.isPending || deleteLineMutation.isPending}
                      canEdit={!isEconomyLocked}
                      onSave={(nextLine) => updateLineMutation.mutate(nextLine)}
                      onDelete={() => setDeleteTarget(line)}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fakturor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoicesQuery.isLoading && <p className="text-sm text-foreground/70">Laddar fakturor...</p>}
                {!invoicesQuery.isLoading && (invoicesQuery.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-foreground/70">Inga fakturor ännu.</p>
                )}

                {(invoicesQuery.data ?? []).map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.invoice_no}</p>
                      <Badge>{fakturaStatusEtikett(item.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/70">
                      {new Date(item.created_at).toLocaleString('sv-SE')} • Förfallo: {new Date(item.due_date).toLocaleDateString('sv-SE')} • Total:{' '}
                      {Number(item.total).toFixed(2)} {item.currency}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/invoices/${item.id}`}>Öppna</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/invoices/${item.id}/export?compact=1`}>Exportera JSON</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/${item.id}/print`} target="_blank">
                          Skriv ut / PDF
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'attachments' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Bilagor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/70">Bilagor hanteras inte direkt på projekt ännu. Använd fakturor eller relaterade flöden tills vidare.</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'members' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/70">Projektet använder bolagets teammedlemmar. Egen projekttilldelning finns inte på denna sida ännu.</p>
            <Button asChild variant="outline">
              <Link href="/team">Öppna medlemmar</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'logs' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Loggar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Projekt-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{project.id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Bolags-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{project.company_id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Statusnyckel</p>
              <p className="mt-1 text-foreground/70">{project.status}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Position</p>
              <p className="mt-1 text-foreground/70">{project.position}</p>
            </div>
            {orderId ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Order-ID</p>
                <p className="mt-1 break-all font-mono text-foreground/70">{orderId}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta avbrytning</DialogTitle>
            <DialogDescription>
              Är du säker på att ordern ska sättas till avbruten? Detta bör endast användas när ordern inte ska faktureras.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCancelConfirmOpen(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingOrderStatus) return;
                updateOrderStatusMutation.mutate(pendingOrderStatus);
                setCancelConfirmOpen(false);
                setPendingOrderStatus(null);
              }}
            >
              Bekräfta cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort orderrad</DialogTitle>
            <DialogDescription>
              Vill du ta bort raden <strong>{deleteTarget?.title}</strong>? Detta kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteLineMutation.mutate(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Ta bort
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EditableLineRow({
  line,
  saving,
  canEdit,
  onSave,
  onDelete
}: {
  line: OrderLineRow;
  saving: boolean;
  canEdit: boolean;
  onSave: (line: OrderLineRow) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<OrderLineRow>(line);

  useEffect(() => {
    setDraft(line);
  }, [line]);

  return (
    <TableRow>
      <TableCell>
        <Input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} disabled={!canEdit} />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.qty)}
          onChange={(e) => setDraft((prev) => ({ ...prev, qty: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.unit_price)}
          onChange={(e) => setDraft((prev) => ({ ...prev, unit_price: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.vat_rate)}
          onChange={(e) => setDraft((prev) => ({ ...prev, vat_rate: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>{computeLineTotal(Number(draft.qty), Number(draft.unit_price)).toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => onSave(draft)} disabled={saving || !canEdit}>
            Spara
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving || !canEdit}>
            Ta bort
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
