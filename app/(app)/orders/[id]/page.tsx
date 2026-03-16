'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
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

type OrderRow = Pick<DbRow<'orders'>, 'id' | 'project_id' | 'status' | 'total' | 'created_at'>;
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceRow = Pick<DbRow<'invoices'>, 'id' | 'invoice_no' | 'status' | 'currency' | 'total' | 'created_at'>;

const orderStatuses = ['draft', 'sent', 'paid', 'cancelled', 'invoiced'] as const;
type OrderStatus = (typeof orderStatuses)[number];

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

  const orderQuery = useQuery<OrderRow | null>({
    queryKey: ['order', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,status,total,created_at')
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

  if (orderQuery.isLoading) return <p>Laddar order...</p>;
  if (!orderQuery.data) return <p>Order hittades inte.</p>;

  const order = orderQuery.data;
  const statusValue = orderStatuses.includes(order.status as OrderStatus) ? (order.status as OrderStatus) : 'draft';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary">
          <Link href="/orders">Tillbaka till ordrar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${order.project_id}`}>Öppna projekt</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orderdetaljer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>ID: {order.id.slice(0, 8)}...</Badge>
            <Badge>Status: {orderStatusEtikett(order.status)}</Badge>
            <Badge>Total: {Number(order.total).toFixed(2)} kr</Badge>
            <Badge>Skapad: {new Date(order.created_at).toLocaleDateString('sv-SE')}</Badge>
          </div>

          <p className="text-sm text-foreground/80">Projekt: {projectQuery.data?.title ?? order.project_id}</p>

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orderrader</CardTitle>
        </CardHeader>
        <CardContent>
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
    </section>
  );
}
