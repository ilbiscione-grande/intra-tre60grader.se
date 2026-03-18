'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarDays, CircleDollarSign, FolderOpen, Hash, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createInvoiceFromOrder } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { Role } from '@/lib/types';

type OrderRow = Pick<DbRow<'orders'>, 'id' | 'order_no' | 'project_id' | 'status' | 'total' | 'created_at'>;
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceRow = Pick<DbRow<'invoices'>, 'id' | 'invoice_no' | 'status' | 'currency' | 'total' | 'created_at'>;
type OrderTab = 'overview' | 'updates' | 'economy' | 'attachments' | 'members' | 'logs';

const orderStatuses = ['draft', 'sent', 'paid', 'cancelled', 'invoiced'] as const;
type OrderStatus = (typeof orderStatuses)[number];
const orderTabs: Array<{ id: OrderTab; label: string }> = [
  { id: 'overview', label: 'Översikt' },
  { id: 'updates', label: 'Uppdateringar' },
  { id: 'economy', label: 'Ekonomi' },
  { id: 'attachments', label: 'Bilagor' },
  { id: 'members', label: 'Medlemmar' },
  { id: 'logs', label: 'Loggar' }
];

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

function extractInvoiceSummary(result: unknown) {
  if (!result || typeof result !== 'object') return 'Faktura skapad';
  const record = result as Record<string, unknown>;
  const invoiceNo = record.invoice_no ?? record.invoiceNo ?? record.number;
  if (typeof invoiceNo === 'string' && invoiceNo.trim()) return `Faktura skapad: ${invoiceNo}`;
  return 'Faktura skapad';
}

export default function OrderDetailsPage() {
  const { companyId, role } = useAppContext();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<OrderTab>('overview');

  const orderQuery = useQuery<OrderRow | null>({
    queryKey: ['order', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .eq('id', orderId)
        .maybeSingle<OrderRow>();
      if (error) throw error;
      return data;
    }
  });

  const projectQuery = useQuery<ProjectRow | null>({
    queryKey: ['order-project', companyId, orderQuery.data?.project_id ?? 'none'],
    enabled: Boolean(orderQuery.data?.project_id),
    queryFn: async () => {
      const projectId = orderQuery.data?.project_id;
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('projects')
        .select('id,title')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<ProjectRow>();
      if (error) throw error;
      return data;
    }
  });

  const linesQuery = useQuery<OrderLineRow[]>({
    queryKey: ['order-lines', companyId, orderId],
    queryFn: async () => {
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
    queryKey: ['order-invoices', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,status,currency,total,created_at')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .returns<InvoiceRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('company_id', companyId)
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      toast.success('Orderstatus uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera status')
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => createInvoiceFromOrder(orderId),
    onSuccess: async (result) => {
      toast.success(extractInvoiceSummary(result));
      await queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['order-invoices', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura')
  });
  const updates = useMemo(() => {
    if (!orderQuery.data) return [];

    const order = orderQuery.data;
    const items = [
      {
        id: `order-${order.id}`,
        title: 'Order skapad',
        meta: `Status: ${orderStatusEtikett(order.status)}`,
        at: order.created_at
      },
      ...(linesQuery.data ?? []).map((line) => ({
        id: `line-${line.id}`,
        title: `Orderrad: ${line.title}`,
        meta: `${Number(line.qty).toFixed(2)} st • ${Number(line.total).toFixed(2)} kr`,
        at: line.created_at
      })),
      ...(invoicesQuery.data ?? []).map((inv) => ({
        id: `invoice-${inv.id}`,
        title: `Faktura ${inv.invoice_no}`,
        meta: `${fakturaStatusEtikett(inv.status)} • ${Number(inv.total).toFixed(2)} ${inv.currency}`,
        at: inv.created_at
      }))
    ];

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [invoicesQuery.data, linesQuery.data, orderQuery.data]);

  if (orderQuery.isLoading) return <p>Laddar order...</p>;
  if (!orderQuery.data) return <p>Order hittades inte.</p>;

  const order = orderQuery.data;
  const statusValue = orderStatuses.includes(order.status as OrderStatus) ? (order.status as OrderStatus) : 'draft';

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till ordrar">
                <Link href="/orders">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <CardTitle>Orderdetaljer</CardTitle>
            </div>
            <Button asChild variant="outline" size="icon" aria-label="Öppna projekt">
              <Link href={`/projects/${order.project_id}`}>
                <FolderOpen className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <Hash className="h-3 w-3" />
              {order.order_no ?? order.id}
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <ShieldCheck className="h-3 w-3" />
              {orderStatusEtikett(order.status)}
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CircleDollarSign className="h-3 w-3" />
              {Number(order.total).toFixed(2)} kr
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CalendarDays className="h-3 w-3" />
              {new Date(order.created_at).toLocaleDateString('sv-SE')}
            </Badge>
          </div>

          <p className="text-xs text-foreground/70">Projekt: {projectQuery.data?.title ?? order.project_id}</p>
        </CardContent>
      </Card>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {orderTabs.map((tab) => (
          <Button
            key={tab.id}
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
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-foreground/70">Projekt</p>
                <p className="mt-1 font-medium">{projectQuery.data?.title ?? order.project_id}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-foreground/70">Orderrader</p>
                <p className="mt-1 font-medium">{linesQuery.data?.length ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-foreground/70">Fakturor</p>
                <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Orderrader</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 md:hidden">
                {(linesQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-foreground/70">Inga rader ännu.</p>
                )}
                {(linesQuery.data ?? []).map((line) => (
                  <div key={line.id} className="rounded-xl border border-border/80 bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{line.title}</p>
                      </div>
                      <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-right">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-primary/80">Radtotal</p>
                        <p className="mt-1 text-sm font-semibold text-primary">{Number(line.total).toFixed(2)} kr</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Antal</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.qty).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">A-pris</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.unit_price).toFixed(2)} kr</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Moms</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.vat_rate).toFixed(2)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Antal</TableHead>
                    <TableHead>A-pris</TableHead>
                    <TableHead>Moms %</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(linesQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-foreground/70">
                        Inga rader ännu.
                      </TableCell>
                    </TableRow>
                  )}
                  {(linesQuery.data ?? []).map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.title}</TableCell>
                      <TableCell>{Number(line.qty).toFixed(2)}</TableCell>
                      <TableCell>{Number(line.unit_price).toFixed(2)}</TableCell>
                      <TableCell>{Number(line.vat_rate).toFixed(2)}</TableCell>
                      <TableCell>{Number(line.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'updates' && (
        <Card>
          <CardHeader>
            <CardTitle>Uppdateringar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {updates.length === 0 && <p className="text-sm text-foreground/70">Inga uppdateringar ännu.</p>}
            {updates.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-foreground/60">{new Date(item.at).toLocaleString('sv-SE')}</p>
                </div>
                <p className="mt-1 text-sm text-foreground/70">{item.meta}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'economy' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ekonomi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RoleGate role={role} allow={['finance', 'admin']}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-56">
                    <Select value={statusValue} onValueChange={(value) => updateStatusMutation.mutate(value as OrderStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => invoiceMutation.mutate()}
                    disabled={invoiceMutation.isPending || !canManageOrder(role)}
                  >
                    {invoiceMutation.isPending ? 'Skapar...' : 'Skapa faktura'}
                  </Button>
                </div>
              </RoleGate>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Ordertotal</p>
                  <p className="mt-1 font-medium">{Number(order.total).toFixed(2)} kr</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Fakturor</p>
                  <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Status</p>
                  <p className="mt-1 font-medium">{orderStatusEtikett(order.status)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fakturor för ordern</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(invoicesQuery.data ?? []).length === 0 && <p className="text-sm text-foreground/70">Inga fakturor ännu.</p>}
              {(invoicesQuery.data ?? []).map((inv) => (
                <div key={inv.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{inv.invoice_no}</p>
                    <Badge>{fakturaStatusEtikett(inv.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground/70">
                    {new Date(inv.created_at).toLocaleString('sv-SE')} • {Number(inv.total).toFixed(2)} {inv.currency}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/invoices/${inv.id}`}>Öppna faktura</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/api/invoices/${inv.id}/export?compact=1`}>Exportera JSON</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'attachments' && (
        <Card>
          <CardHeader>
            <CardTitle>Bilagor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/70">Bilagor hanteras inte direkt på order ännu. Lägg bilagor på projekt eller faktura tills vidare.</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'members' && (
        <Card>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground/70">Ordern är kopplad till projektets team och egna ordermedlemmar används inte ännu.</p>
            <Button asChild variant="outline">
              <Link href={`/projects/${order.project_id}`}>Visa projektmedlemmar</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>Loggar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Order-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{order.id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Projekt-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{order.project_id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Systemstatus</p>
              <p className="mt-1 text-foreground/70">{order.status}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Skapad</p>
              <p className="mt-1 text-foreground/70">{new Date(order.created_at).toLocaleString('sv-SE')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
