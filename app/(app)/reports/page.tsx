'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { BarChart3, ClipboardCheck, FileSpreadsheet, ReceiptText } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { canViewReporting } from '@/lib/auth/capabilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import {
  balanceSheetReport,  financeAuditChainVerify,
  financeAuditLogReport,
  generalLedgerReport,
  incomeStatementReport,
  trialBalanceReport,
  vatReport
} from '@/lib/rpc';
import { useVerificationAuditLog, type VerificationStatusFilter } from '@/features/finance/financeQueries';
import { createClient } from '@/lib/supabase/client';

type GenericRecord = Record<string, unknown>;
type OrderKind = 'primary' | 'change' | 'supplement';
type OrderMixProjectSummary = {
  projectId: string;
  projectTitle: string;
  primaryTotal: number;
  changeTotal: number;
  supplementTotal: number;
  total: number;
  orderCount: number;
};
type InvoiceOrderTrendRow = {
  month: string;
  primary: number;
  change: number;
  supplement: number;
  total: number;
};
type OpenOrderValueSummary = {
  primary: number;
  change: number;
  supplement: number;
  total: number;
};

const DEFAULT_LARGE_OPEN_ORDER_VALUE_THRESHOLD = 10000;

function sourceLabel(source: string | null) {
  if (source === 'mobile') return 'Mobil';
  if (source === 'desktop') return 'Desktop';
  if (source === 'offline') return 'Offline';
  return '-';
}

function statusLabel(status: string | null) {
  if (status === 'voided') return 'Makulerad';
  return 'Bokförd';
}

function verificationNumberLabel(fiscalYear: number | null, verificationNo: number | null) {
  if (!fiscalYear || !verificationNo) return '-';
  return `${fiscalYear}-${String(verificationNo).padStart(5, '0')}`;
}

function toArray(data: unknown): GenericRecord[] {
  return Array.isArray(data)
    ? data.filter((item): item is GenericRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function toObject(data: unknown): GenericRecord {
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as GenericRecord;
  return {};
}

function num(value: unknown) {
  return Number(value ?? 0);
}

function fmt(value: unknown) {
  return `${num(value).toFixed(2)} kr`;
}

function getVatBox(data: unknown, key: '05' | '06' | '07' | '10' | '11' | '12' | '20' | '21' | '22' | '30' | '48' | '49') {
  const root = toObject(data);
  const boxes = toObject(root.boxes);
  return Number(boxes[key] ?? 0);
}

function monthLabel(value: string) {
  const [year, month] = value.split('-');
  return `${year}-${month}`;
}

export default function ReportsPage() {
  const { companyId, role, capabilities } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const canReadReports = canViewReporting(role, capabilities);
  const [periodStart, setPeriodStart] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<VerificationStatusFilter>('all');

  const vatQuery = useQuery({
    queryKey: ['vat-report', companyId, periodStart, periodEnd],
    queryFn: () => vatReport(companyId, periodStart, periodEnd),
    enabled: canReadReports
  });

  const generalLedgerQuery = useQuery({
    queryKey: ['general-ledger-report', companyId, periodStart, periodEnd],
    queryFn: () => generalLedgerReport(companyId, periodStart, periodEnd),
    enabled: canReadReports
  });

  const trialBalanceQuery = useQuery({
    queryKey: ['trial-balance-report', companyId, periodEnd],
    queryFn: () => trialBalanceReport(companyId, periodEnd),
    enabled: canReadReports
  });

  const incomeStatementQuery = useQuery({
    queryKey: ['income-statement-report', companyId, periodStart, periodEnd],
    queryFn: () => incomeStatementReport(companyId, periodStart, periodEnd),
    enabled: canReadReports
  });

  const balanceSheetQuery = useQuery({
    queryKey: ['balance-sheet-report', companyId, periodEnd],
    queryFn: () => balanceSheetReport(companyId, periodEnd),
    enabled: canReadReports
  });

  const financeAuditLogQuery = useQuery({
    queryKey: ['finance-audit-log-report', companyId],
    queryFn: () => financeAuditLogReport(companyId, 50),
    enabled: canReadReports
  });

  const financeAuditChainVerifyQuery = useQuery({
    queryKey: ['finance-audit-chain-verify', companyId],
    queryFn: () => financeAuditChainVerify(companyId),
    enabled: canReadReports
  });

  const orderMixOrdersQuery = useQuery({
    queryKey: ['reports-order-mix-orders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,order_kind,total')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as Array<{ id: string; project_id: string | null; order_kind: OrderKind; total: number | null }>;
    },
    enabled: canReadReports
  });

  const orderMixProjectsQuery = useQuery({
    queryKey: ['reports-order-mix-projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title')
        .eq('company_id', companyId);

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadReports
  });

  const companyPriorityThresholdQuery = useQuery({
    queryKey: ['reports-company-invoice-priority-threshold', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('invoice_priority_threshold')
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      return Number(data?.invoice_priority_threshold ?? DEFAULT_LARGE_OPEN_ORDER_VALUE_THRESHOLD);
    },
    enabled: canReadReports
  });

  const invoiceTrendQuery = useQuery({
    queryKey: ['reports-invoice-order-trend', companyId, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('issue_date,total,order_id')
        .eq('company_id', companyId)
        .gte('issue_date', periodStart)
        .lte('issue_date', periodEnd)
        .neq('status', 'void')
        .order('issue_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Array<{ issue_date: string; total: number | null; order_id: string | null }>;
    },
    enabled: canReadReports
  });

  const allInvoicesByOrderTypeQuery = useQuery({
    queryKey: ['reports-invoice-order-type-all-time', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total,order_id')
        .eq('company_id', companyId)
        .neq('status', 'void');

      if (error) throw error;
      return (data ?? []) as Array<{ total: number | null; order_id: string | null }>;
    },
    enabled: canReadReports
  });

  const auditQuery = useVerificationAuditLog(companyId, periodStart, periodEnd, statusFilter);

  const exportCsvHref = useMemo(() => {
    const params = new URLSearchParams({
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      status: statusFilter
    });

    return `/api/verifications/export?${params.toString()}`;
  }, [companyId, periodStart, periodEnd, statusFilter]);

  const exportSieHref = useMemo(() => {
    const params = new URLSearchParams({
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      status: statusFilter
    });

    return `/api/verifications/sie?${params.toString()}`;
  }, [companyId, periodStart, periodEnd, statusFilter]);

  const validateSieHref = useMemo(() => {
    const params = new URLSearchParams({
      company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      status: statusFilter,
      validate_only: '1'
    });

    return `/api/verifications/sie?${params.toString()}`;
  }, [companyId, periodStart, periodEnd, statusFilter]);

  const auditChainExportHref = useMemo(() => {
    const params = new URLSearchParams({
      company_id: companyId,
      limit: '5000'
    });

    return `/api/reports/finance-audit-chain?${params.toString()}`;
  }, [companyId]);

  function openWithConfirm(url: string, label: string) {
    const ok = window.confirm(`Vill du exportera ${label}? Storlek beror på vald period.`);
    if (!ok) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (!canReadReports) {
    return <p className="rounded-lg bg-muted p-4 text-sm">Rapporter är endast för ekonomi/admin/revisor.</p>;
  }

  const glRows = toArray(generalLedgerQuery.data);
  const tbRows = toArray(trialBalanceQuery.data);

  const isObj = toObject(incomeStatementQuery.data);
  const isRows = toArray(isObj.rows);

  const bsObj = toObject(balanceSheetQuery.data);
  const assetsRows = toArray(bsObj.assets);
  const liabilitiesRows = toArray(bsObj.liabilities_equity);

  const financeAuditRows = toArray(financeAuditLogQuery.data);
  const auditChainVerify = toObject(financeAuditChainVerifyQuery.data);
  const auditRows = auditQuery.data ?? [];
  const orderMix = useMemo(() => {
    const projectsById = new Map((orderMixProjectsQuery.data ?? []).map((project) => [project.id, project.title]));
    const perProject = new Map<string, OrderMixProjectSummary>();

    let primaryTotal = 0;
    let changeTotal = 0;
    let supplementTotal = 0;

    for (const order of orderMixOrdersQuery.data ?? []) {
      if (!order.project_id) continue;

      const projectId = order.project_id;
      const total = Number(order.total ?? 0);
      const existing = perProject.get(projectId) ?? {
        projectId,
        projectTitle: projectsById.get(projectId) ?? 'Projekt utan titel',
        primaryTotal: 0,
        changeTotal: 0,
        supplementTotal: 0,
        total: 0,
        orderCount: 0
      };

      existing.orderCount += 1;
      existing.total += total;

      if (order.order_kind === 'change') {
        existing.changeTotal += total;
        changeTotal += total;
      } else if (order.order_kind === 'supplement') {
        existing.supplementTotal += total;
        supplementTotal += total;
      } else {
        existing.primaryTotal += total;
        primaryTotal += total;
      }

      perProject.set(projectId, existing);
    }

    const rows = [...perProject.values()]
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);

    const total = primaryTotal + changeTotal + supplementTotal;

    return {
      rows,
      totals: {
        primary: primaryTotal,
        change: changeTotal,
        supplement: supplementTotal,
        total
      }
    };
  }, [orderMixOrdersQuery.data, orderMixProjectsQuery.data]);
  const invoiceTrend = useMemo(() => {
    const orderKindById = new Map((orderMixOrdersQuery.data ?? []).map((order) => [order.id, order.order_kind]));
    const grouped = new Map<string, InvoiceOrderTrendRow>();

    for (const invoice of invoiceTrendQuery.data ?? []) {
      const month = monthLabel(String(invoice.issue_date).slice(0, 7));
      const current = grouped.get(month) ?? {
        month,
        primary: 0,
        change: 0,
        supplement: 0,
        total: 0
      };

      const amount = Number(invoice.total ?? 0);
      const kind = invoice.order_id ? orderKindById.get(invoice.order_id) : 'primary';

      current.total += amount;
      if (kind === 'change') current.change += amount;
      else if (kind === 'supplement') current.supplement += amount;
      else current.primary += amount;

      grouped.set(month, current);
    }

    return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [invoiceTrendQuery.data, orderMixOrdersQuery.data]);
  const openOrderValue = useMemo<OpenOrderValueSummary>(() => {
    const orderKindById = new Map((orderMixOrdersQuery.data ?? []).map((order) => [order.id, order.order_kind]));
    const invoiced = {
      primary: 0,
      change: 0,
      supplement: 0
    };

    for (const invoice of allInvoicesByOrderTypeQuery.data ?? []) {
      const amount = Number(invoice.total ?? 0);
      const kind = invoice.order_id ? orderKindById.get(invoice.order_id) : 'primary';

      if (kind === 'change') invoiced.change += amount;
      else if (kind === 'supplement') invoiced.supplement += amount;
      else invoiced.primary += amount;
    }

    const primary = Math.max(orderMix.totals.primary - invoiced.primary, 0);
    const change = Math.max(orderMix.totals.change - invoiced.change, 0);
    const supplement = Math.max(orderMix.totals.supplement - invoiced.supplement, 0);

    return {
      primary,
      change,
      supplement,
      total: primary + change + supplement
    };
  }, [allInvoicesByOrderTypeQuery.data, orderMix.totals.change, orderMix.totals.primary, orderMix.totals.supplement, orderMixOrdersQuery.data]);
  const largeOpenOrderValueThreshold =
    companyPriorityThresholdQuery.data ?? DEFAULT_LARGE_OPEN_ORDER_VALUE_THRESHOLD;

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Rapporter</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Ekonomirapporter och revision</h1>
                <p className="text-sm text-foreground/65">
                  Samla moms, huvudbok, resultat, balans och revisionsspår på ett ställe. Börja med periodvalet och gå sedan in i rätt rapport.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <label className="space-y-1 text-sm">
                <span>Från</span>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span>Till</span>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </label>
              <Button variant="ghost" asChild>
                <Link href={'/help/ekonomirapporter' as Route}>Hjälp om rapporter</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <ReportMetricCard icon={ReceiptText} title="Moms ruta 49" value={fmt(getVatBox(vatQuery.data, '49'))} />
            <ReportMetricCard icon={FileSpreadsheet} title="Huvudboksrader" value={String(glRows.length)} />
            <ReportMetricCard icon={BarChart3} title="Konton i saldolista" value={String(tbRows.length)} />
            <ReportMetricCard icon={ClipboardCheck} title="Ordervärde totalt" value={fmt(orderMix.totals.total)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Projektorderfördelning</CardTitle>
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
              Huvudorder vs ändringar och tillägg
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Huvudorder" value={fmt(orderMix.totals.primary)} />
            <SummaryCard title="Ändringsordrar" value={fmt(orderMix.totals.change)} />
            <SummaryCard title="Tilläggsordrar" value={fmt(orderMix.totals.supplement)} />
            <SummaryCard title="Projekt med ordervärde" value={String(orderMix.rows.length)} />
          </div>

          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Projekt</TableHead>
                <TableHead className="text-right">Huvudorder</TableHead>
                <TableHead className="text-right">Ändringar</TableHead>
                <TableHead className="text-right">Tillägg</TableHead>
                <TableHead className="text-right">Totalt</TableHead>
                <TableHead className="text-right">Ordrar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderMix.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-foreground/70">Inga ordervärden att summera ännu.</TableCell>
                </TableRow>
              ) : (
                orderMix.rows.map((row) => (
                  <TableRow key={row.projectId} className="transition-colors hover:bg-muted/20">
                    <TableCell>
                      <Link href={`/projects/${row.projectId}`} className="underline-offset-4 hover:underline">
                        {row.projectTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{fmt(row.primaryTotal)}</TableCell>
                    <TableCell className="text-right">{fmt(row.changeTotal)}</TableCell>
                    <TableCell className="text-right">{fmt(row.supplementTotal)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(row.total)}</TableCell>
                    <TableCell className="text-right">{row.orderCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Fakturerat per månad och ordertyp</CardTitle>
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
              Vald period: {periodStart} - {periodEnd}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-3">
            <SummaryCard
              title="Fakturerat huvudorder"
              value={fmt(invoiceTrend.reduce((sum, row) => sum + row.primary, 0))}
            />
            <SummaryCard
              title="Fakturerat ändringar"
              value={fmt(invoiceTrend.reduce((sum, row) => sum + row.change, 0))}
            />
            <SummaryCard
              title="Fakturerat tillägg"
              value={fmt(invoiceTrend.reduce((sum, row) => sum + row.supplement, 0))}
            />
          </div>

          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Månad</TableHead>
                <TableHead className="text-right">Huvudorder</TableHead>
                <TableHead className="text-right">Ändringar</TableHead>
                <TableHead className="text-right">Tillägg</TableHead>
                <TableHead className="text-right">Totalt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceTrend.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-foreground/70">Inga fakturor i vald period.</TableCell>
                </TableRow>
              ) : (
                invoiceTrend.map((row) => (
                  <TableRow key={row.month} className="transition-colors hover:bg-muted/20">
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="text-right">{fmt(row.primary)}</TableCell>
                    <TableCell className="text-right">{fmt(row.change)}</TableCell>
                    <TableCell className="text-right">{fmt(row.supplement)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(row.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Kvar att fakturera per ordertyp</CardTitle>
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
              Nuvarande öppet ordervärde
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Huvudorder kvar" value={fmt(openOrderValue.primary)} />
            <SummaryCard title="Ändringar kvar" value={fmt(openOrderValue.change)} />
            <SummaryCard title="Tillägg kvar" value={fmt(openOrderValue.supplement)} />
            <SummaryCard title="Totalt kvar" value={fmt(openOrderValue.total)} />
          </div>
          <p className="text-xs text-foreground/55">
            Prioriteringsnivå för stora öppna ändrings- och tilläggsvärden: {fmt(largeOpenOrderValueThreshold)}.
          </p>

          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Ordertyp</TableHead>
                <TableHead className="text-right">Ordervärde</TableHead>
                <TableHead className="text-right">Fakturerat hittills</TableHead>
                <TableHead className="text-right">Kvar att fakturera</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  label: 'Huvudorder',
                  total: orderMix.totals.primary,
                  open: openOrderValue.primary
                },
                {
                  label: 'Ändringsordrar',
                  total: orderMix.totals.change,
                  open: openOrderValue.change,
                  isPriority: openOrderValue.change >= largeOpenOrderValueThreshold
                },
                {
                  label: 'Tilläggsordrar',
                  total: orderMix.totals.supplement,
                  open: openOrderValue.supplement,
                  isPriority: openOrderValue.supplement >= largeOpenOrderValueThreshold
                }
              ].map((row) => (
                <TableRow key={row.label} className="transition-colors hover:bg-muted/20">
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{row.label}</span>
                      {row.isPriority ? (
                        <Badge className="border-amber-300/80 bg-amber-100/80 text-amber-900 hover:bg-amber-100/80 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200">
                          Hög prioritet
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{fmt(row.total)}</TableCell>
                  <TableCell className="text-right">{fmt(Math.max(row.total - row.open, 0))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(row.open)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Momsrapport</CardTitle>
            <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
              Period: {periodStart} - {periodEnd}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <VatBoxCard title="Ruta 05" subtitle="Försäljning 25% (underlag)" value={getVatBox(vatQuery.data, '05')} />
            <VatBoxCard title="Ruta 06" subtitle="Försäljning 12% (underlag)" value={getVatBox(vatQuery.data, '06')} />
            <VatBoxCard title="Ruta 07" subtitle="Försäljning 6% (underlag)" value={getVatBox(vatQuery.data, '07')} />
            <VatBoxCard title="Ruta 10" subtitle="Utgående moms 25%" value={getVatBox(vatQuery.data, '10')} />
            <VatBoxCard title="Ruta 11" subtitle="Utgående moms 12%" value={getVatBox(vatQuery.data, '11')} />
            <VatBoxCard title="Ruta 12" subtitle="Utgående moms 6%" value={getVatBox(vatQuery.data, '12')} />
            <VatBoxCard title="Ruta 20" subtitle="Inköp 25% (underlag)" value={getVatBox(vatQuery.data, '20')} />
            <VatBoxCard title="Ruta 21" subtitle="Inköp 12% (underlag)" value={getVatBox(vatQuery.data, '21')} />
            <VatBoxCard title="Ruta 22" subtitle="Inköp 6% (underlag)" value={getVatBox(vatQuery.data, '22')} />
            <VatBoxCard title="Ruta 48" subtitle="Ingående moms" value={getVatBox(vatQuery.data, '48')} />
            <VatBoxCard title="Ruta 49" subtitle="Att betala/få tillbaka" value={getVatBox(vatQuery.data, '49')} />
          </div>
          <p className="text-xs text-foreground/60">Period: {periodStart} - {periodEnd}</p>
          <p className="text-xs text-foreground/60">
            Datakvalitet: {Number((toObject(vatQuery.data).quality as Record<string, unknown> | undefined)?.unknown_vat_lines ?? 0)} okända momskoder.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Huvudbok</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Datum</TableHead>
                <TableHead>Konto</TableHead>
                <TableHead>Benämning</TableHead>
                <TableHead>Text</TableHead>
                <TableHead className="text-right">Debet</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Belopp</TableHead>
                <TableHead>Ver.nr</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {glRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-foreground/70">Ingen data för vald period.</TableCell>
                </TableRow>
              ) : (
                glRows.map((row, idx) => (
                  <TableRow key={`${row.verification_id ?? 'v'}-${idx}`} className="transition-colors hover:bg-muted/20">
                    <TableCell>{String(row.entry_date ?? '-')}</TableCell>
                    <TableCell>{String(row.account_no ?? '-')}</TableCell>
                    <TableCell>{String(row.account_name ?? '-')}</TableCell>
                    <TableCell>{String(row.description ?? '-')}</TableCell>
                    <TableCell className="text-right">{num(row.debit).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{num(row.credit).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{num(row.amount).toFixed(2)}</TableCell>
                    <TableCell>{String(row.verification_no ?? '-')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balans-/saldolista</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Benämning</TableHead>
                  <TableHead className="text-right">Debet</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tbRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-foreground/70">Ingen data.</TableCell>
                  </TableRow>
                ) : (
                  tbRows.map((row) => (
                    <TableRow key={String(row.account_no ?? Math.random())} className="transition-colors hover:bg-muted/20">
                      <TableCell>{String(row.account_no ?? '-')}</TableCell>
                      <TableCell>{String(row.account_name ?? '-')}</TableCell>
                      <TableCell className="text-right">{num(row.debit).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{num(row.credit).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{num(row.balance).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultatrapport</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Benämning</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-foreground/70">Ingen data.</TableCell>
                  </TableRow>
                ) : (
                  isRows.map((row) => (
                    <TableRow key={String(row.account_no ?? Math.random())} className="transition-colors hover:bg-muted/20">
                      <TableCell>{String(row.account_no ?? '-')}</TableCell>
                      <TableCell>{String(row.account_name ?? '-')}</TableCell>
                      <TableCell>{String(row.account_type ?? '-')}</TableCell>
                      <TableCell className="text-right">{num(row.signed_amount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <SummaryCard title="Totala intäkter" value={fmt(isObj.total_income)} />
              <SummaryCard title="Totala kostnader" value={fmt(isObj.total_expense)} />
              <SummaryCard title="Periodens resultat" value={fmt(isObj.result)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balansrapport - Tillgångar</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleAccountTable rows={assetsRows} />
            <p className="mt-3 text-sm font-semibold">Summa tillgångar: {fmt(bsObj.total_assets)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balansrapport - Skulder/Eget kapital</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleAccountTable rows={liabilitiesRows} />
            <p className="mt-3 text-sm font-semibold">Summa skulder/eget kapital: {fmt(bsObj.total_liabilities_equity)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revisionslogg verifikationer</CardTitle>
        </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-6">
              <label className="space-y-1 text-sm">
                <span>Från</span>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span>Till</span>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span>Status</span>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as VerificationStatusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alla" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla</SelectItem>
                    <SelectItem value="booked">Bokförd</SelectItem>
                    <SelectItem value="voided">Makulerad</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => openWithConfirm(exportCsvHref, 'CSV')}>Exportera CSV</Button>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" className="w-full" onClick={() => openWithConfirm(exportSieHref, 'SIE4')}>Exportera SIE4</Button>
              </div>
              <div className="flex items-end">
                <Button asChild variant="outline" className="w-full">
                  <a href={validateSieHref} target="_blank" rel="noreferrer">
                    Validera SIE4
                  </a>
                </Button>
              </div>
            </div>

          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Nr</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Källa</TableHead>
                <TableHead>Skapad</TableHead>
                <TableHead>Makulering</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditRows.map((row) => (
                <TableRow key={row.id} className="transition-colors hover:bg-muted/20">
                  <TableCell>{verificationNumberLabel(row.fiscal_year, row.verification_no)}</TableCell>
                  <TableCell>{new Date(row.date).toLocaleDateString('sv-SE')}</TableCell>
                  <TableCell>
                    <Link href={`/finance/verifications/${row.id}`} className="underline-offset-4 hover:underline">
                      {row.description}
                    </Link>
                  </TableCell>
                  <TableCell>{statusLabel(row.status)}</TableCell>
                  <TableCell>{Number(row.total).toFixed(2)} kr</TableCell>
                  <TableCell>{sourceLabel(row.source)}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleString('sv-SE')}</TableCell>
                  <TableCell>
                    {row.status === 'voided'
                      ? `${row.voided_at ? new Date(row.voided_at).toLocaleString('sv-SE') : '-'}${row.void_reason ? ` (${row.void_reason})` : ''}`
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Finansiell audit-logg</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <SummaryCard title="Kedja verifierad" value={Boolean(auditChainVerify.chain_ok) ? 'Ja' : 'Nej'} />
            <SummaryCard title="Kontrollerade händelser" value={String(Number(auditChainVerify.checked_events ?? 0))} />
            <SummaryCard title="Fel i kedja" value={String(Number(auditChainVerify.broken_events ?? 0))} />
            <div className="flex items-end">
              <Button className="w-full" variant="outline" onClick={() => openWithConfirm(auditChainExportHref, 'revisionskedja JSON')}>Exportera revisionskedja (JSON)</Button>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Tid</TableHead>
                <TableHead>Händelse</TableHead>
                <TableHead>Entitet</TableHead>
                <TableHead>Entitet ID</TableHead>
                <TableHead>Aktör</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {financeAuditRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-foreground/70">Ingen audit-data.</TableCell>
                </TableRow>
              ) : (
                financeAuditRows.map((row) => (
                  <TableRow key={String(row.id ?? Math.random())} className="transition-colors hover:bg-muted/20">
                    <TableCell>{String(row.event_no ?? '-')}</TableCell>
                    <TableCell>{String(row.created_at ? new Date(String(row.created_at)).toLocaleString('sv-SE') : '-')}</TableCell>
                    <TableCell>{String(row.action ?? '-')}</TableCell>
                    <TableCell>{String(row.entity ?? '-')}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{String(row.entity_id ?? '-')}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{String(row.actor_user_id ?? '-')}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[180px] truncate">{String(row.event_hash ?? '-')}</TableCell>
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

function ReportMetricCard({
  icon: Icon,
  title,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{title}</p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-muted/35 text-foreground/65">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function VatBoxCard({ title, subtitle, value }: { title: string; subtitle: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="text-foreground/70">{title}</p>
      <p className="font-semibold">{Number(value).toFixed(2)} kr</p>
      <p className="text-xs text-foreground/60">{subtitle}</p>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-foreground/70">{title}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function SimpleAccountTable({ rows }: { rows: GenericRecord[] }) {
  return (
    <Table>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead>Konto</TableHead>
          <TableHead>Benämning</TableHead>
          <TableHead className="text-right">Belopp</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-foreground/70">Ingen data.</TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={String(row.account_no ?? Math.random())}>
              <TableCell>{String(row.account_no ?? '-')}</TableCell>
              <TableCell>{String(row.account_name ?? '-')}</TableCell>
              <TableCell className="text-right">{num(row.amount).toFixed(2)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}





