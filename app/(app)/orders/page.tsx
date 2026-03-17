'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FolderOpen } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

type OrderRow = Pick<DbRow<'orders'>, 'id' | 'project_id' | 'status' | 'total' | 'created_at'>;
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

type OrderListItem = {
  id: string;
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

  const query = useQuery<OrderListItem[]>({
    queryKey: ['orders', companyId],
    queryFn: async () => {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .returns<OrderRow[]>();

      if (ordersError) throw ordersError;

      const orders = ordersData ?? [];
      if (orders.length === 0) return [];

      const projectIds = [...new Set(orders.map((o) => o.project_id))];
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id,title,customer_id')
        .eq('company_id', companyId)
        .in('id', projectIds)
        .returns<ProjectRow[]>();

      if (projectsError) throw projectsError;

      const customerIds = [...new Set((projectsData ?? []).map((p) => p.customer_id).filter(Boolean) as string[])];
      const { data: customersData, error: customersError } = customerIds.length
        ? await supabase
            .from('customers')
            .select('id,name')
            .eq('company_id', companyId)
            .in('id', customerIds)
            .returns<CustomerRow[]>()
        : { data: [] as CustomerRow[], error: null as null | Error };

      if (customersError) throw customersError;

      const projectById = new Map((projectsData ?? []).map((p) => [p.id, p]));
      const customerById = new Map((customersData ?? []).map((c) => [c.id, c.name]));

      return orders.map((order) => {
        const project = projectById.get(order.project_id);
        const customerName = project?.customer_id ? customerById.get(project.customer_id) ?? '-' : '-';

        return {
          id: order.id,
          projectId: order.project_id,
          projectTitle: project?.title ?? order.project_id,
          customerName,
          status: order.status,
          total: Number(order.total ?? 0),
          createdAt: order.created_at
        };
      });
    }
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Ordrar</h2>
        <Button asChild variant="secondary">
          <Link href="/projects">Till projekt</Link>
        </Button>
      </div>

      <div className="space-y-3 md:hidden">
        {query.isLoading && (
          <Card className="p-4 text-sm text-foreground/70">Laddar ordrar...</Card>
        )}

        {!query.isLoading && (query.data?.length ?? 0) === 0 && (
          <Card className="p-4 text-sm text-foreground/70">Inga ordrar hittades.</Card>
        )}

        {(query.data ?? []).map((row) => (
          <Card key={row.id} className="overflow-hidden p-0">
            <div className="border-b border-border/70 bg-muted/30 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Order</p>
                  <p className="mt-1 font-mono text-sm">{row.id.slice(0, 8)}...</p>
                </div>
                <Badge>{orderStatusEtikett(row.status)}</Badge>
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

              <div className="grid grid-cols-2 gap-2">
                <Button asChild className="w-full">
                  <Link href={`/orders/${row.id}`}>
                    <ArrowUpRight className="h-4 w-4" />
                    Öppna order
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/projects/${row.projectId}`}>
                    <FolderOpen className="h-4 w-4" />
                    Till projekt
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
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
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Laddar ordrar...</TableCell>
              </TableRow>
            )}

            {!query.isLoading && (query.data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-foreground/70">
                  Inga ordrar hittades.
                </TableCell>
              </TableRow>
            )}

            {(query.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.id.slice(0, 8)}...</TableCell>
                <TableCell>{row.projectTitle}</TableCell>
                <TableCell>{row.customerName}</TableCell>
                <TableCell>
                  <Badge>{orderStatusEtikett(row.status)}</Badge>
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
