'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canViewFinance } from '@/lib/auth/capabilities';
import { receivablesOpenReport, receivablesReconciliationReport } from '@/lib/rpc';

type OpenRow = {
  customer_name: string;
  days_overdue: number;
  due_date: string;
  invoice_id: string;
  invoice_no: string;
  invoice_total: number;
  issue_date: string;
  open_amount: number;
  paid_total: number;
  status: string;
};

type OpenSummary = {
  invoice_count: number;
  open_total: number;
  overdue_total: number;
};

type OpenReport = {
  as_of: string;
  rows: OpenRow[];
  summary: OpenSummary;
};

type ReconciliationReport = {
  as_of: string;
  difference: number;
  ledger_1510_balance: number;
  ok: boolean;
  receivables_open_total: number;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} kr`;
}

function parseOpenReport(value: unknown): OpenReport {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rowsRaw = Array.isArray(root.rows) ? root.rows : [];
  const summaryRaw = root.summary && typeof root.summary === 'object' && !Array.isArray(root.summary)
    ? (root.summary as Record<string, unknown>)
    : {};

  const rows = rowsRaw
    .map((row) => {
      const item = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
      if (!item) return null;

      return {
        customer_name: String(item.customer_name ?? ''),
        days_overdue: toNumber(item.days_overdue),
        due_date: String(item.due_date ?? ''),
        invoice_id: String(item.invoice_id ?? ''),
        invoice_no: String(item.invoice_no ?? ''),
        invoice_total: toNumber(item.invoice_total),
        issue_date: String(item.issue_date ?? ''),
        open_amount: toNumber(item.open_amount),
        paid_total: toNumber(item.paid_total),
        status: String(item.status ?? '')
      } satisfies OpenRow;
    })
    .filter((item): item is OpenRow => Boolean(item && item.invoice_id));

  return {
    as_of: String(root.as_of ?? new Date().toISOString().slice(0, 10)),
    rows,
    summary: {
      invoice_count: toNumber(summaryRaw.invoice_count),
      open_total: toNumber(summaryRaw.open_total),
      overdue_total: toNumber(summaryRaw.overdue_total)
    }
  };
}

function parseReconciliationReport(value: unknown): ReconciliationReport {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    as_of: String(root.as_of ?? new Date().toISOString().slice(0, 10)),
    difference: toNumber(root.difference),
    ledger_1510_balance: toNumber(root.ledger_1510_balance),
    ok: Boolean(root.ok),
    receivables_open_total: toNumber(root.receivables_open_total)
  };
}

export default function ReceivablesPage() {
  const { companyId, role, capabilities } = useAppContext();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const canReadFinance = canViewFinance(role, capabilities);

  const openQuery = useQuery({
    queryKey: ['receivables-open-report', companyId, asOf],
    queryFn: async () => parseOpenReport(await receivablesOpenReport(companyId, asOf)),
    enabled: canReadFinance
  });

  const reconciliationQuery = useQuery({
    queryKey: ['receivables-reconciliation-report', companyId, asOf],
    queryFn: async () => parseReconciliationReport(await receivablesReconciliationReport(companyId, asOf)),
    enabled: canReadFinance
  });

  const report = openQuery.data;
  const recon = reconciliationQuery.data;

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Kundreskontra är endast tillgänglig för ekonomi, admin eller revisor.</p>;
  }

  return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>Per datum</span>
            <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </label>
          <Button variant="outline" asChild>
            <Link href="/invoices">Fakturor</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Avstämning kundfordringar</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-3">
            <MetricCard
              label="Öppna kundfordringar"
              value={formatMoney(recon?.receivables_open_total ?? 0)}
            />
            <MetricCard
              label="Konto 1510 (huvudbok)"
              value={formatMoney(recon?.ledger_1510_balance ?? 0)}
            />
            <div className="rounded-lg border p-3">
              <p className="text-xs text-foreground/70">Differens</p>
              <p className="text-sm font-semibold">{formatMoney(recon?.difference ?? 0)}</p>
              {recon ? (
                recon.ok ? <Badge className="mt-2">OK</Badge> : <Badge className="mt-2 bg-destructive text-destructive-foreground">Ej i balans</Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Öppna kundfordringar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <MetricCard label="Antal fakturor" value={String(report?.summary.invoice_count ?? 0)} />
              <MetricCard label="Öppet belopp" value={formatMoney(report?.summary.open_total ?? 0)} />
              <MetricCard label="Förfallet belopp" value={formatMoney(report?.summary.overdue_total ?? 0)} />
            </div>

            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Faktura</TableHead>
                  <TableHead>Kund</TableHead>
                  <TableHead>Fakturadatum</TableHead>
                  <TableHead>Förfallodatum</TableHead>
                  <TableHead className="text-right">Totalt</TableHead>
                  <TableHead className="text-right">Betalt</TableHead>
                  <TableHead className="text-right">Öppet</TableHead>
                  <TableHead className="text-right">Dagar sen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!openQuery.isLoading && (report?.rows.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-foreground/70">
                      Inga öppna fordringar för valt datum.
                    </TableCell>
                  </TableRow>
                ) : (
                  (report?.rows ?? []).map((row) => (
                    <TableRow key={row.invoice_id}>
                      <TableCell>
                        <Link href={`/invoices/${row.invoice_id}`} className="underline underline-offset-2">
                          {row.invoice_no}
                        </Link>
                      </TableCell>
                      <TableCell>{row.customer_name || '-'}</TableCell>
                      <TableCell>{new Date(row.issue_date).toLocaleDateString('sv-SE')}</TableCell>
                      <TableCell>{new Date(row.due_date).toLocaleDateString('sv-SE')}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.invoice_total)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.paid_total)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(row.open_amount)}</TableCell>
                      <TableCell className="text-right">
                        {row.days_overdue > 0 ? <Badge className="bg-destructive text-destructive-foreground">{row.days_overdue}</Badge> : <Badge>0</Badge>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-foreground/70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

