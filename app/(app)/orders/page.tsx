'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Copy, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

type OrderRow = Pick<DbRow<'orders'>, 'id' | 'order_no' | 'project_id' | 'status' | 'total' | 'created_at'>;
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title' | 'customer_id'>;
type CustomerRow = Pick<DbRow<'customers'>, 'id' | 'name'>;

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

function orderStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    draft: 'border-amber-200 bg-amber-50 text-amber-800',
    sent: 'border-sky-200 bg-sky-50 text-sky-800',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    invoiced: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cancelled: 'border-rose-200 bg-rose-50 text-rose-800'
  };

  return map[status] ?? 'border-slate-200 bg-slate-50 text-slate-700';
}

type OrderListItem = {
  id: string;
  orderNo: string | null;
  projectId: string;
  projectTitle: string;
  customerName: string;
  status: string;
  total: number;
  createdAt: string;
};

export default function OrdersPage() {
  const { companyId } = useAppContext();
  const supabase = createClient();
  const [search, setSearch] = useState('');

  const ordersQuery = useQuery<OrderRow[]>({
    queryKey: ['orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .returns<OrderRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectsQuery = useQuery<ProjectRow[]>({
    queryKey: ['orders-project-lookup', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,customer_id')
        .eq('company_id', companyId)
        .returns<ProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const customersQuery = useQuery<CustomerRow[]>({
    queryKey: ['orders-customer-lookup', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .returns<CustomerRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const rows = useMemo<OrderListItem[]>(() => {
    const orders = ordersQuery.data ?? [];
    const projectById = new Map((projectsQuery.data ?? []).map((project) => [project.id, project]));
    const customerById = new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer.name]));

    return orders.map((order) => {
      const project = projectById.get(order.project_id);
      const customerName = project?.customer_id ? customerById.get(project.customer_id) ?? '-' : '-';

      return {
        id: order.id,
        orderNo: order.order_no,
        projectId: order.project_id,
        projectTitle: project?.title ?? order.project_id,
        customerName,
        status: order.status,
        total: Number(order.total ?? 0),
        createdAt: order.created_at
      };
    });
  }, [customersQuery.data, ordersQuery.data, projectsQuery.data]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return rows;

    return rows.filter((row) => {
      const searchableText = [
        row.orderNo,
        row.id,
        row.projectTitle,
        row.projectId,
        row.customerName,
        orderStatusEtikett(row.status),
        row.status,
        new Date(row.createdAt).toLocaleDateString('sv-SE')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [rows, search]);

  const isLoading = ordersQuery.isLoading || projectsQuery.isLoading || customersQuery.isLoading;

  async function copyOrderId(event: React.MouseEvent<HTMLButtonElement>, orderId: string) {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(orderId);
      toast.success('Ordernummer kopierat');
    } catch {
      toast.error('Kunde inte kopiera ordernummer');
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Ordrar</h2>
        <Button asChild variant="secondary">
          <Link href="/projects">Till projekt</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök på ordernummer, kund, projekt, status eller datum..."
              className="pl-10"
            />
          </div>
          <p className="text-sm text-foreground/65">
            Visar {filteredOrders.length} av {rows.length} ordrar
          </p>
        </div>
      </Card>

      <div className="space-y-3 md:hidden">
        {isLoading && (
          <Card className="p-4 text-sm text-foreground/70">Laddar ordrar...</Card>
        )}

        {!isLoading && (filteredOrders.length ?? 0) === 0 && (
          <Card className="p-4 text-sm text-foreground/70">Inga ordrar hittades.</Card>
        )}

        {filteredOrders.map((row) => (
          <Link key={row.id} href={`/orders/${row.id}`} className="block">
            <Card className="overflow-hidden p-0 transition hover:border-primary/40 hover:bg-muted/20">
              <div className="border-b border-border/70 bg-muted/30 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Order</p>
                    <p className="mt-1 font-mono text-sm">{row.orderNo ?? row.id}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge className={orderStatusBadgeClass(row.status)}>{orderStatusEtikett(row.status)}</Badge>
                    <button
                      type="button"
                      aria-label="Kopiera ordernummer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card text-foreground/70 transition hover:bg-muted"
                      onClick={(event) => copyOrderId(event, row.id)}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Projekt</p>
                    <p className="mt-1 text-sm font-medium leading-snug">{row.projectTitle}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Kund</p>
                    <p className="mt-1 text-sm font-medium leading-snug">{row.customerName}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Total</p>
                    <p className="mt-1 text-sm font-semibold">{row.total.toFixed(2)} kr</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Skapad</p>
                    <p className="mt-1 text-sm font-medium">{new Date(row.createdAt).toLocaleDateString('sv-SE')}</p>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="hidden p-0 md:block">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Projekt</TableHead>
              <TableHead>Kund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Skapad</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Laddar ordrar...</TableCell>
              </TableRow>
            )}

            {!isLoading && (filteredOrders.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-foreground/70">
                  Inga ordrar hittades.
                </TableCell>
              </TableRow>
            )}

            {filteredOrders.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.orderNo ?? row.id}</TableCell>
                <TableCell>{row.projectTitle}</TableCell>
                <TableCell>{row.customerName}</TableCell>
                <TableCell>
                  <Badge className={orderStatusBadgeClass(row.status)}>{orderStatusEtikett(row.status)}</Badge>
                </TableCell>
                <TableCell>{row.total.toFixed(2)} kr</TableCell>
                <TableCell>{new Date(row.createdAt).toLocaleDateString('sv-SE')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/orders/${row.id}`}>Öppna</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/projects/${row.projectId}`}>Projekt</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
