'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft, CalendarDays, CircleDollarSign, FolderOpen, Paperclip, ShieldCheck, Users } from 'lucide-react';
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
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { createInvoiceFromOrder } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { Role } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';
import { useSwipeTabs } from '@/lib/ui/useSwipeTabs';

type OrderRow = Pick<DbRow<'orders'>, 'id' | 'order_no' | 'project_id' | 'status' | 'total' | 'created_at'>;
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title' | 'customer_id'>;
type CustomerRow = Pick<DbRow<'customers'>, 'id' | 'name'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceSourceLinkRow = Pick<DbRow<'invoice_sources'>, 'invoice_id' | 'order_id' | 'project_id' | 'position'>;
type InvoiceSourceCountRow = Pick<DbRow<'invoice_sources'>, 'invoice_id'>;
type InvoiceRow = Pick<DbRow<'invoices'>, 'id' | 'invoice_no' | 'status' | 'currency' | 'total' | 'created_at' | 'attachment_path' | 'due_date' | 'order_id' | 'project_id'>;
type MemberView = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
  display_name: string | null;
};
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

function orderStatusIconClass(status: string) {
  if (status === 'paid' || status === 'invoiced') return 'text-emerald-600';
  if (status === 'cancelled') return 'text-rose-600';
  if (status === 'sent') return 'text-sky-600';
  return 'text-amber-600';
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

function roleLabel(role: Role) {
  const map: Record<Role, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role];
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
  const swipeHandlers = useSwipeTabs({
    tabs: orderTabs.map((tab) => tab.id),
    activeTab,
    onChange: setActiveTab
  });
  const { containerRef, registerItem } = useAutoScrollActiveTab(activeTab);

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
        .select('id,title,customer_id')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<ProjectRow>();
      if (error) throw error;
      return data;
    }
  });

  const customerQuery = useQuery<CustomerRow | null>({
    queryKey: ['order-customer', companyId, projectQuery.data?.customer_id ?? 'none'],
    enabled: Boolean(projectQuery.data?.customer_id),
    queryFn: async () => {
      const customerId = projectQuery.data?.customer_id;
      if (!customerId) return null;
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .eq('id', customerId)
        .maybeSingle<CustomerRow>();
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

  const invoiceSourceLinksQuery = useQuery<InvoiceSourceLinkRow[]>({
    queryKey: ['order-invoice-source-links', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id,order_id,project_id,position')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .order('position', { ascending: true })
        .returns<InvoiceSourceLinkRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['order-invoices', companyId, orderId, (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id).join(',')],
    queryFn: async () => {
      const invoiceIds = (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id);
      let query = supabase
        .from('invoices')
        .select('id,invoice_no,status,currency,total,created_at,attachment_path,due_date,order_id,project_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (invoiceIds.length > 0) {
        query = query.in('id', invoiceIds);
      } else {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query.returns<InvoiceRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourceCountsQuery = useQuery<InvoiceSourceCountRow[]>({
    queryKey: ['order-invoice-source-counts', companyId, (invoicesQuery.data ?? []).map((row) => row.id).join(',')],
    enabled: (invoicesQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const invoiceIds = (invoicesQuery.data ?? []).map((row) => row.id);
      if (invoiceIds.length === 0) return [];

      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id')
        .eq('company_id', companyId)
        .in('invoice_id', invoiceIds)
        .returns<InvoiceSourceCountRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const membersQuery = useQuery<MemberView[]>({
    queryKey: ['order-company-members', companyId],
    enabled: role === 'admin',
    queryFn: async () => {
      const res = await fetch(`/api/admin/members?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa medlemmar');
      }
      const body = (await res.json()) as { members: MemberView[] };
      return body.members ?? [];
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

  const logs = useMemo(() => {
    if (!orderQuery.data) return [];

    const order = orderQuery.data;
    const entries = [
      {
        id: `log-order-${order.id}`,
        title: 'Order registrerad',
        detail: `Order-ID ${order.id}`,
        at: order.created_at
      },
      ...(linesQuery.data ?? []).map((line) => ({
        id: `log-line-${line.id}`,
        title: 'Orderrad registrerad',
        detail: `${line.title} • ${Number(line.total).toFixed(2)} kr`,
        at: line.created_at
      })),
      ...(invoicesQuery.data ?? []).map((invoice) => ({
        id: `log-invoice-${invoice.id}`,
        title: 'Fakturakoppling registrerad',
        detail: `${invoice.invoice_no} • ${fakturaStatusEtikett(invoice.status)}`,
        at: invoice.created_at
      }))
    ];

    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [invoicesQuery.data, linesQuery.data, orderQuery.data]);

  const invoiceSourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of invoiceSourceCountsQuery.data ?? []) {
      counts.set(row.invoice_id, (counts.get(row.invoice_id) ?? 0) + 1);
    }
    return counts;
  }, [invoiceSourceCountsQuery.data]);

  if (orderQuery.isLoading) return <p>Laddar order...</p>;
  if (!orderQuery.data) return <p>Order hittades inte.</p>;

  const order = orderQuery.data;
  const statusValue = orderStatuses.includes(order.status as OrderStatus) ? (order.status as OrderStatus) : 'draft';
  const invoiceAttachments = (invoicesQuery.data ?? []).filter((invoice) => Boolean(invoice.attachment_path));
  const members = membersQuery.data ?? [];
  const invoiceTotal = (invoicesQuery.data ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const outstandingInvoiceValue = (invoicesQuery.data ?? [])
    .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const latestInvoice = invoicesQuery.data?.[0] ?? null;
  const hasActiveInvoice = (invoicesQuery.data ?? []).some((invoice) => invoice.status !== 'void');

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
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Order</p>
                <CardTitle className="text-lg">{order.order_no ?? order.id}</CardTitle>
                <p className="mt-0.5 text-[11px] text-foreground/60">{projectQuery.data?.title ?? order.project_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label={`Status: ${orderStatusEtikett(order.status)}`}
                title={orderStatusEtikett(order.status)}
              >
                <ShieldCheck className={`h-4 w-4 ${orderStatusIconClass(order.status)}`} />
              </Button>
              <Button asChild variant="outline" size="icon" aria-label="Öppna projekt">
                <Link href={`/projects/${order.project_id}`}>
                  <FolderOpen className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CircleDollarSign className="h-3 w-3" />
              {Number(order.total).toFixed(2)} kr
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CalendarDays className="h-3 w-3" />
              {new Date(order.created_at).toLocaleDateString('sv-SE')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div ref={containerRef} className="-mx-4 flex overflow-x-auto border-b border-border/70 px-4">
        {orderTabs.map((tab) => (
          <Button
            key={tab.id}
            ref={registerItem(tab.id)}
            type="button"
            variant="ghost"
            className={`shrink-0 rounded-none border-b-2 px-3 py-3 text-sm ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-foreground/60 hover:border-border hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4" {...swipeHandlers}>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-sm text-foreground/70">Projekt</p>
                  <p className="mt-1 font-medium">{projectQuery.data?.title ?? order.project_id}</p>
                </div>
                <div className="border-t border-border/70 pt-3">
                  <p className="text-sm text-foreground/70">Kund</p>
                  <p className="mt-1 font-medium">{customerQuery.data?.name ?? 'Ingen kund kopplad'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-foreground/70">Orderrader</p>
                  <p className="mt-1 font-medium">{linesQuery.data?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Fakturor</p>
                  <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
                </div>
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
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Uppdateringar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Senaste uppdatering</p>
                <p className="mt-1 font-medium">{updates[0] ? new Date(updates[0].at).toLocaleString('sv-SE') : '-'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Orderrader</p>
                <p className="mt-1 font-medium">{linesQuery.data?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Fakturahändelser</p>
                <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
              </div>
            </div>
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
        <div className="space-y-4" {...swipeHandlers}>
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
                    disabled={invoiceMutation.isPending || !canManageOrder(role) || hasActiveInvoice}
                  >
                    {invoiceMutation.isPending ? 'Skapar...' : hasActiveInvoice ? 'Faktura finns redan' : 'Skapa faktura'}
                  </Button>
                </div>
              </RoleGate>

              <div className="grid gap-3 md:grid-cols-4">
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
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Öppet fakturavärde</p>
                  <p className="mt-1 font-medium">{outstandingInvoiceValue.toFixed(2)} kr</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Fakturerat totalt</p>
                  <p className="mt-1 font-medium">{invoiceTotal.toFixed(2)} kr</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Senaste faktura</p>
                  <p className="mt-1 font-medium">{latestInvoice?.invoice_no ?? 'Ingen ännu'}</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {latestInvoice?.created_at ? new Date(latestInvoice.created_at).toLocaleDateString('sv-SE') : 'Skapa faktura när ordern är klar'}
                  </p>
                  {latestInvoice && (invoiceSourceCounts.get(latestInvoice.id) ?? 0) > 1 ? (
                    <p className="mt-1 text-xs text-primary">Ingår i samlingsfaktura</p>
                  ) : null}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Nästa steg</p>
                  <p className="mt-1 font-medium">
                    {invoicesQuery.data?.length
                      ? outstandingInvoiceValue > 0
                        ? 'Följ upp betalning'
                        : 'Klart'
                      : 'Skapa första faktura'}
                  </p>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{inv.invoice_no}</p>
                        {(invoiceSourceCounts.get(inv.id) ?? 0) > 1 ? <Badge>Samlingsfaktura</Badge> : null}
                      </div>
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
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Bilagor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Bilagor på fakturor</p>
                <p className="mt-1 font-medium">{invoiceAttachments.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Fakturor med underlag</p>
                <p className="mt-1 font-medium">
                  {new Set(invoiceAttachments.map((invoice) => invoice.id)).size}
                </p>
              </div>
            </div>

            {invoiceAttachments.length === 0 ? (
              <p className="text-sm text-foreground/70">
                Inga bilagor hittades på orderns fakturor ännu. Lägg bilagor på fakturan eller projektet tills vidare.
              </p>
            ) : (
              <div className="space-y-3">
                {invoiceAttachments.map((invoice) => (
                  <div key={invoice.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-foreground/55" />
                          <p className="font-medium">{invoice.invoice_no}</p>
                        </div>
                        <p className="mt-1 text-sm text-foreground/70">
                          {fakturaStatusEtikett(invoice.status)} • {Number(invoice.total).toFixed(2)} {invoice.currency}
                        </p>
                        <p className="mt-1 text-xs text-foreground/55">
                          {invoice.due_date ? `Förfallo ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}` : 'Förfallodatum saknas'}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/${invoice.id}`}>Öppna faktura</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'members' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {members.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
                <div>
                  <p className="text-sm font-medium">Tilldelade medlemmar</p>
                  <p className="text-sm text-foreground/65">Ordern använder samma team som projektet.</p>
                </div>
                <div className="space-y-3">
                  {members.map((member) => {
                    const memberLabel = getUserDisplayName({
                      displayName: member.display_name,
                      email: member.email,
                      userId: member.user_id
                    });

                    return (
                      <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-foreground/55" />
                            <p className="truncate text-sm font-medium">{memberLabel}</p>
                          </div>
                          {member.email && member.email !== memberLabel ? <p className="mt-1 text-xs text-foreground/55">{member.email}</p> : null}
                          <p className="mt-1 text-xs text-foreground/55">
                            Tillagd {new Date(member.created_at).toLocaleDateString('sv-SE')}
                          </p>
                        </div>
                        <Badge>{roleLabel(member.role)}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground/70">
                Inga tilldelade medlemmar hittades på projektet ännu.
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Ordermodell</p>
                <p className="mt-1 font-medium">Ärver projektets team</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Tilldelade medlemmar</p>
                <p className="mt-1 font-medium">{members.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Projekt</p>
                <p className="mt-1 font-medium">{projectQuery.data?.title ?? '-'}</p>
              </div>
            </div>

            <p className="text-sm text-foreground/70">
              Ordern använder projektets team. Öppna projektet för att se eller hantera medlemmar.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/projects/${order.project_id}`}>Visa projektmedlemmar</Link>
              </Button>
              {customerQuery.data ? (
                <Button asChild variant="ghost">
                  <Link href={`/customers/${customerQuery.data.id}` as Route}>Öppna kund</Link>
                </Button>
              ) : null}
            </div>
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
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium text-foreground/80">Händelselogg</p>
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{log.title}</p>
                    <p className="text-xs text-foreground/55">{new Date(log.at).toLocaleString('sv-SE')}</p>
                  </div>
                  <p className="mt-1 text-foreground/70">{log.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
