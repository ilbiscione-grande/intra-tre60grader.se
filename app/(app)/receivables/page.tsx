'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ReceiptText, Wallet } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canViewFinance } from '@/lib/auth/capabilities';
import { receivablesOpenReport, receivablesReconciliationReport } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

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

type InvoiceMetaRow = Pick<DbRow<'invoices'>, 'id' | 'kind' | 'credited_at' | 'credit_for_invoice_id'>;

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} kr`;
}

function share(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
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

function receivableCreditStateLabel(meta?: InvoiceMetaRow | null) {
  if (!meta) return null;
  if (meta.kind === 'credit_note') return 'Kredit';
  if (meta.credited_at) return 'Fullkrediterad';
  return null;
}

export default function ReceivablesPage() {
  const { companyId, role, capabilities } = useAppContext();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const canReadFinance = canViewFinance(role, capabilities);
  const supabase = createClient();

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
  const invoiceIds = openQuery.data?.rows.map((row) => row.invoice_id) ?? [];
  const invoiceMetaQuery = useQuery({
    queryKey: ['receivables-invoice-meta', companyId, invoiceIds.join(',')],
    queryFn: async () => {
      if (invoiceIds.length === 0) return [] as InvoiceMetaRow[];

      const { data, error } = await supabase
        .from('invoices')
        .select('id,kind,credited_at,credit_for_invoice_id')
        .eq('company_id', companyId)
        .in('id', invoiceIds)
        .returns<InvoiceMetaRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance && invoiceIds.length > 0
  });

  const report = openQuery.data;
  const recon = reconciliationQuery.data;
  const overdueRows = (report?.rows ?? []).filter((row) => row.days_overdue > 0);
  const dueSoonRows = (report?.rows ?? []).filter((row) => row.days_overdue <= 0 && row.days_overdue >= -7);
  const overdueShare = share(report?.summary.overdue_total ?? 0, report?.summary.open_total ?? 0);
  const reconciliationOk = Boolean(recon?.ok);
  const invoiceMetaById = new Map((invoiceMetaQuery.data ?? []).map((row) => [row.id, row]));

  if (!canReadFinance) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Kundreskontra är endast tillgänglig för ekonomi, admin eller revisor.</p>;
  }

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <ReceiptText className="h-3.5 w-3.5" />
                <span>Kundreskontra</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Öppna kundfordringar</h1>
                <p className="text-sm text-foreground/65">
                  Följ öppna poster, förfallna belopp och balans mot konto 1510 utan att behöva hoppa mellan flera vyer.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusChip>{report?.summary.invoice_count ?? 0} öppna kundfakturor</StatusChip>
                  <StatusChip tone={overdueRows.length > 0 ? 'rose' : 'neutral'}>{overdueRows.length} förfallna</StatusChip>
                  <StatusChip>{dueSoonRows.length} förfaller snart</StatusChip>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span>Per datum</span>
                <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
              </label>
              <Button variant="outline" asChild>
                <Link href="/invoices">Fakturor</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={'/help/kundreskontra' as Route}>Hjälp om kundreskontra</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avstämning</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <MetricCard label="Öppna kundfordringar" value={formatMoney(recon?.receivables_open_total ?? 0)} icon={Wallet} />
          <MetricCard label="Konto 1510 (huvudbok)" value={formatMoney(recon?.ledger_1510_balance ?? 0)} icon={ReceiptText} />
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <p className="text-xs text-foreground/70">Differens</p>
            <p className="text-sm font-semibold">{formatMoney(recon?.difference ?? 0)}</p>
            {recon ? (
              recon.ok ? <Badge className="mt-2">OK</Badge> : <Badge className="mt-2 bg-destructive text-destructive-foreground">Ej i balans</Badge>
            ) : null}
          </div>
          <div className="md:col-span-3">
            <ProgressStrip
              label="Andel förfallet av öppet belopp"
              value={`${overdueShare}%`}
              detail={`${formatMoney(report?.summary.overdue_total ?? 0)} av ${formatMoney(report?.summary.open_total ?? 0)}`}
              percent={overdueShare}
              tone="rose"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Kundfordringar att följa upp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <MetricCard label="Antal fakturor" value={String(report?.summary.invoice_count ?? 0)} icon={ReceiptText} />
            <MetricCard label="Öppet belopp" value={formatMoney(report?.summary.open_total ?? 0)} icon={Wallet} />
            <MetricCard label="Förfallet belopp" value={formatMoney(report?.summary.overdue_total ?? 0)} icon={CalendarRange} />
          </div>
          <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm text-foreground/70">
            {reconciliationOk
              ? 'Kundreskontran är i balans mot 1510. Fokus ligger nu på förfallna och snart förfallande poster.'
              : 'Det finns en differens mot 1510. Börja med att kontrollera avstämningen och gå sedan vidare till förfallna poster.'}
          </div>

          <div className="grid gap-3 md:hidden">
            {!openQuery.isLoading && (report?.rows.length ?? 0) === 0 ? (
              <p className="text-sm text-foreground/70">Inga öppna fordringar för valt datum.</p>
            ) : (
              (report?.rows ?? []).map((row) => (
                <Link key={row.invoice_id} href={`/invoices/${row.invoice_id}`} className="block">
                  <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.invoice_no}</p>
                        <p className="text-sm text-foreground/70">{row.customer_name || '-'}</p>
                        {receivableCreditStateLabel(invoiceMetaById.get(row.invoice_id)) ? (
                          <div className="mt-2">
                            <StatusChip>{receivableCreditStateLabel(invoiceMetaById.get(row.invoice_id))}</StatusChip>
                          </div>
                        ) : null}
                      </div>
                      <StatusChip tone={row.days_overdue > 0 ? 'rose' : 'neutral'}>
                        {row.days_overdue > 0 ? `${row.days_overdue} dagar sen` : 'Aktiv'}
                      </StatusChip>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <Fact label="Förfallo" value={new Date(row.due_date).toLocaleDateString('sv-SE')} />
                      <Fact label="Öppet" value={formatMoney(row.open_amount)} />
                      <Fact label="Totalt" value={formatMoney(row.invoice_total)} />
                      <Fact label="Betalt" value={formatMoney(row.paid_total)} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="hidden md:block">
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
                    <TableRow key={row.invoice_id} className="transition-colors hover:bg-muted/20">
                      <TableCell>
                        <Link href={`/invoices/${row.invoice_id}`} className="underline underline-offset-2">
                          {row.invoice_no}
                        </Link>
                        {receivableCreditStateLabel(invoiceMetaById.get(row.invoice_id)) ? (
                          <div className="mt-1">
                            <Badge className="border-border/70 bg-muted/40 text-foreground/75 hover:bg-muted/40">
                              {receivableCreditStateLabel(invoiceMetaById.get(row.invoice_id))}
                            </Badge>
                          </div>
                        ) : null}
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
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-foreground/70">{label}</p>
          <p className="text-sm font-semibold">{value}</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-foreground/65">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function ProgressStrip({
  label,
  value,
  detail,
  percent,
  tone = 'rose'
}: {
  label: string;
  value: string;
  detail: string;
  percent: number;
  tone?: 'rose' | 'blue';
}) {
  const toneClass = tone === 'rose' ? 'bg-rose-500/85' : 'bg-sky-500/85';
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
      <div>
        <p className="text-xs text-foreground/70">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-xs text-foreground/65">{detail}</p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted/70">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatusChip({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'rose';
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        tone === 'rose'
          ? 'border-rose-300/70 bg-rose-100/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200'
          : 'border-border/70 bg-muted/40 text-foreground/80'
      }`}
    >
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-foreground/45">{label}</p>
      <p className="mt-1 font-medium text-foreground/85">{value}</p>
    </div>
  );
}

