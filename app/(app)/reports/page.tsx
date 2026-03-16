'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppContext } from '@/components/providers/AppContext';
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

type GenericRecord = Record<string, unknown>;

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

export default function ReportsPage() {
  const { companyId, role } = useAppContext();
  const [periodStart, setPeriodStart] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<VerificationStatusFilter>('all');

  const vatQuery = useQuery({
    queryKey: ['vat-report', companyId, periodStart, periodEnd],
    queryFn: () => vatReport(companyId, periodStart, periodEnd),
    enabled: role !== 'member'
  });

  const generalLedgerQuery = useQuery({
    queryKey: ['general-ledger-report', companyId, periodStart, periodEnd],
    queryFn: () => generalLedgerReport(companyId, periodStart, periodEnd),
    enabled: role !== 'member'
  });

  const trialBalanceQuery = useQuery({
    queryKey: ['trial-balance-report', companyId, periodEnd],
    queryFn: () => trialBalanceReport(companyId, periodEnd),
    enabled: role !== 'member'
  });

  const incomeStatementQuery = useQuery({
    queryKey: ['income-statement-report', companyId, periodStart, periodEnd],
    queryFn: () => incomeStatementReport(companyId, periodStart, periodEnd),
    enabled: role !== 'member'
  });

  const balanceSheetQuery = useQuery({
    queryKey: ['balance-sheet-report', companyId, periodEnd],
    queryFn: () => balanceSheetReport(companyId, periodEnd),
    enabled: role !== 'member'
  });

  const financeAuditLogQuery = useQuery({
    queryKey: ['finance-audit-log-report', companyId],
    queryFn: () => financeAuditLogReport(companyId, 50),
    enabled: role !== 'member'
  });

  const financeAuditChainVerifyQuery = useQuery({
    queryKey: ['finance-audit-chain-verify', companyId],
    queryFn: () => financeAuditChainVerify(companyId),
    enabled: role !== 'member'
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

  if (role === 'member') {
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

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Momsrapport</CardTitle>
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
                  <TableRow key={`${row.verification_id ?? 'v'}-${idx}`}>
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
                    <TableRow key={String(row.account_no ?? Math.random())}>
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
                    <TableRow key={String(row.account_no ?? Math.random())}>
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
              {(auditQuery.data ?? []).map((row) => (
                <TableRow key={row.id}>
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
                  <TableRow key={String(row.id ?? Math.random())}>
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





