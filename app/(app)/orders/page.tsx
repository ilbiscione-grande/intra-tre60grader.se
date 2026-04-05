'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import type { Database, TableRow as DbRow } from '@/lib/supabase/database.types';

type OrderKindFilter = 'all' | 'primary' | 'change' | 'supplement';

type OrderHierarchyNodeRow = Database['public']['Views']['order_hierarchy_nodes']['Row'];
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

function orderKindLabel(kind: string) {
  const map: Record<string, string> = {
    primary: 'Huvudorder',
    change: 'Ändringsorder',
    supplement: 'Tilläggsorder'
  };
  return map[kind] ?? kind;
}

function orderKindBadgeClass(kind: string) {
  const map: Record<string, string> = {
    primary: 'border-slate-200/80 bg-slate-100/80 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    change: 'border-violet-200/80 bg-violet-100/80 text-violet-900 dark:border-violet-900/70 dark:bg-violet-950/60 dark:text-violet-200',
    supplement: 'border-cyan-200/80 bg-cyan-100/80 text-cyan-900 dark:border-cyan-900/70 dark:bg-cyan-950/60 dark:text-cyan-200'
  };

  return map[kind] ?? 'border-slate-200/80 bg-slate-100/80 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

function orderStatusBadgeClass(status: string) {
  const map: Record<string, string> = {
    draft: 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100',
    sent: 'border-amber-200/80 bg-amber-100/80 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-200',
    paid: 'border-emerald-200/80 bg-emerald-100/80 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-200',
    invoiced: 'border-sky-200/80 bg-sky-100/80 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/60 dark:text-sky-200',
    cancelled: 'border-rose-200/80 bg-rose-100/80 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-200'
  };

  return map[status] ?? 'border-slate-200/80 bg-slate-100/80 text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

function orderStatusSurfaceClass(status: string) {
  const map: Record<string, string> = {
    draft: 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/80 dark:hover:bg-slate-900',
    sent: 'border-amber-200/80 bg-amber-50/85 hover:bg-amber-100/85 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/40',
    paid: 'border-emerald-200/80 bg-emerald-50/85 hover:bg-emerald-100/85 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/40',
    invoiced: 'border-sky-200/80 bg-sky-50/85 hover:bg-sky-100/85 dark:border-sky-900/60 dark:bg-sky-950/30 dark:hover:bg-sky-950/40',
    cancelled: 'border-rose-200/80 bg-rose-50/85 hover:bg-rose-100/85 dark:border-rose-900/60 dark:bg-rose-950/30 dark:hover:bg-rose-950/40'
  };

  return map[status] ?? 'border-border/70 bg-card hover:bg-muted/20';
}

type OrderListItem = {
  id: string;
  orderNo: string | null;
  projectId: string;
  projectTitle: string;
  customerName: string;
  status: string;
  orderKind: string;
  total: number;
  createdAt: string;
  relationLabel: string;
};

export default function OrdersPage() {
  const { companyId } = useAppContext();
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState('');
  const [orderKindFilter, setOrderKindFilter] = useState<OrderKindFilter>('all');

  const ordersQuery = useQuery<OrderHierarchyNodeRow[]>({
    queryKey: ['orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_hierarchy_nodes')
        .select('order_id,order_no,project_id,status,order_kind,total,created_at,parent_order_id,root_order_id,root_order_no,child_order_count')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .returns<OrderHierarchyNodeRow[]>();

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
      const project = order.project_id ? projectById.get(order.project_id) : undefined;
      const customerName = project?.customer_id ? customerById.get(project.customer_id) ?? '-' : '-';

      return {
        id: order.order_id ?? '',
        orderNo: order.order_no,
        projectId: order.project_id ?? '',
        projectTitle: project?.title ?? order.project_id ?? '-',
        customerName,
        status: order.status ?? 'draft',
        orderKind: order.order_kind ?? 'primary',
        total: Number(order.total ?? 0),
        createdAt: order.created_at ?? new Date(0).toISOString(),
        relationLabel:
          order.parent_order_id
            ? `Under ${order.root_order_no ?? 'huvudorder'}`
            : Number(order.child_order_count ?? 0) > 0
              ? `${Number(order.child_order_count ?? 0)} underordnade`
              : 'Huvudorder'
      };
    });
  }, [customersQuery.data, ordersQuery.data, projectsQuery.data]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return rows;

    return rows.filter((row) => {
      if (orderKindFilter !== 'all' && row.orderKind !== orderKindFilter) return false;

      const searchableText = [
        row.orderNo,
        row.id,
        row.projectTitle,
        row.projectId,
        row.customerName,
        orderKindLabel(row.orderKind),
        row.orderKind,
        orderStatusEtikett(row.status),
        row.status,
        new Date(row.createdAt).toLocaleDateString('sv-SE')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [orderKindFilter, rows, search]);

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
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'all', label: 'Alla' },
              { value: 'primary', label: 'Huvudorder' },
              { value: 'change', label: 'Ändringsordrar' },
              { value: 'supplement', label: 'Tilläggsordrar' }
            ] as Array<{ value: OrderKindFilter; label: string }>).map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={orderKindFilter === option.value ? 'default' : 'outline'}
                onClick={() => setOrderKindFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
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
            <Card className={`overflow-hidden p-0 transition ${orderStatusSurfaceClass(row.status)}`}>
              <div className="border-b border-black/5 px-4 py-3 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Order</p>
                    <p className="mt-1 font-mono text-sm">{row.orderNo ?? row.id}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge className={orderStatusBadgeClass(row.status)}>{orderStatusEtikett(row.status)}</Badge>
                    <Badge className={orderKindBadgeClass(row.orderKind)}>{orderKindLabel(row.orderKind)}</Badge>
                    <button
                      type="button"
                      aria-label="Kopiera ordernummer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/70 text-foreground/70 transition hover:bg-white dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"
                      onClick={(event) => copyOrderId(event, row.id)}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-black/15">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Projekt</p>
                    <p className="mt-1 text-sm font-medium leading-snug">{row.projectTitle}</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-black/15">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Kund</p>
                    <p className="mt-1 text-sm font-medium leading-snug">{row.customerName}</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-black/15">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Total</p>
                    <p className="mt-1 text-sm font-semibold">{row.total.toFixed(2)} kr</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-black/15">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Skapad</p>
                    <p className="mt-1 text-sm font-medium">{new Date(row.createdAt).toLocaleDateString('sv-SE')}</p>
                  </div>
                  <div className="rounded-xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-black/15 sm:col-span-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">Struktur</p>
                    <p className="mt-1 text-sm font-medium">{row.relationLabel}</p>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Laddar ordrar...</TableCell>
              </TableRow>
            )}

            {!isLoading && (filteredOrders.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-foreground/70">
                  Inga ordrar hittades.
                </TableCell>
              </TableRow>
            )}

            {filteredOrders.map((row) => (
              <TableRow
                key={row.id}
                className={`${orderStatusSurfaceClass(row.status)} cursor-pointer`}
                onClick={() => router.push(`/orders/${row.id}`)}
              >
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-mono text-xs">{row.orderNo ?? row.id}</p>
                    <p className="text-xs text-foreground/60">{row.relationLabel}</p>
                  </div>
                </TableCell>
                <TableCell>{row.projectTitle}</TableCell>
                <TableCell>{row.customerName}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={orderStatusBadgeClass(row.status)}>{orderStatusEtikett(row.status)}</Badge>
                    <Badge className={orderKindBadgeClass(row.orderKind)}>{orderKindLabel(row.orderKind)}</Badge>
                  </div>
                </TableCell>
                <TableCell>{row.total.toFixed(2)} kr</TableCell>
                <TableCell>{new Date(row.createdAt).toLocaleDateString('sv-SE')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
