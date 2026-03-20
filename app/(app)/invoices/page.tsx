'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canViewFinance } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

type InvoiceListRow = Pick<
  DbRow<'invoices'>,
  'id' | 'invoice_no' | 'kind' | 'status' | 'currency' | 'issue_date' | 'due_date' | 'total' | 'created_at' | 'project_id'
>;

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

export default function InvoicesPage() {
  const { companyId, role, capabilities } = useAppContext();
  const supabase = createClient();
  const canReadFinance = canViewFinance(role, capabilities);

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

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Fakturor är endast tillgängliga för ekonomi, admin eller revisor.</p>;
  }

  return (
    <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Fakturor</h2>
          <Button asChild variant="secondary">
            <Link href="/reports">Rapporter</Link>
          </Button>
        </div>

        <Card className="p-0">
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
              {(query.data ?? []).length === 0 && !query.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-foreground/70">
                    Inga fakturor hittades.
                  </TableCell>
                </TableRow>
              )}

              {(query.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.invoice_no}</TableCell>
                  <TableCell>
                    <Badge>{fakturaTypEtikett(row.kind)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge>{fakturaStatusEtikett(row.status)}</Badge>
                  </TableCell>
                  <TableCell>{new Date(row.issue_date).toLocaleDateString('sv-SE')}</TableCell>
                  <TableCell>{new Date(row.due_date).toLocaleDateString('sv-SE')}</TableCell>
                  <TableCell>
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
        </Card>
      </section>
  );
}
