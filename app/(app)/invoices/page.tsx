'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useQuery } from '@tanstack/react-query';
import { FileText, Receipt, Wallet } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const rows = query.data ?? [];
  const issuedCount = rows.filter((row) => row.status === 'issued' || row.status === 'sent').length;
  const paidCount = rows.filter((row) => row.status === 'paid').length;
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total), 0);

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
                <h1 className="text-xl font-semibold tracking-tight">Fakturaöversikt</h1>
                <p className="text-sm text-foreground/65">
                  Använd sidan för att följa status, öppna fakturor och hoppa vidare till detaljer eller export.
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
