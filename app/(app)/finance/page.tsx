'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFinanceOverview } from '@/features/finance/financeQueries';
import { vatReport } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import BankReconciliationCard from '@/features/finance/BankReconciliationCard';

type StatusFilter = 'all' | 'booked' | 'voided';
type SourceFilter = 'all' | 'mobile' | 'desktop' | 'offline';
type AttachmentFilter = 'all' | 'with' | 'without';

type InvoiceTodoRow = {
  id: string;
  invoice_no: string;
  status: string;
  due_date: string;
  total: number;
  currency: string;
  booking_verification_id: string | null;
};
type TodoCardKey = 'unbooked_invoices' | 'overdue_invoices' | 'verifications_without_attachment';
type DismissedMap = Record<TodoCardKey, boolean>;
type DismissedAtMap = Record<TodoCardKey, string | null>;

type TodoPreference = {
  date: string;
  dismissed: DismissedMap;
  dismissed_at: DismissedAtMap;
};

const TODO_PREF_KEY = 'finance_todo_dismissed_v1';

const DEFAULT_DISMISSED: DismissedMap = {
  unbooked_invoices: false,
  overdue_invoices: false,
  verifications_without_attachment: false
};

const DEFAULT_DISMISSED_AT: DismissedAtMap = {
  unbooked_invoices: null,
  overdue_invoices: null,
  verifications_without_attachment: null
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('sv-SE');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

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

function money(value: number) {
  return `${value.toFixed(2)} kr`;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function normalizeTodoPreference(value: unknown, today: string): TodoPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { date: today, dismissed: { ...DEFAULT_DISMISSED }, dismissed_at: { ...DEFAULT_DISMISSED_AT } };
  }

  const obj = value as Record<string, unknown>;
  const date = typeof obj.date === 'string' ? obj.date : today;

  const rawDismissed = obj.dismissed && typeof obj.dismissed === 'object' && !Array.isArray(obj.dismissed)
    ? (obj.dismissed as Record<string, unknown>)
    : {};

  const rawDismissedAt = obj.dismissed_at && typeof obj.dismissed_at === 'object' && !Array.isArray(obj.dismissed_at)
    ? (obj.dismissed_at as Record<string, unknown>)
    : {};

  const dismissed: DismissedMap = {
    unbooked_invoices: Boolean(rawDismissed.unbooked_invoices),
    overdue_invoices: Boolean(rawDismissed.overdue_invoices),
    verifications_without_attachment: Boolean(rawDismissed.verifications_without_attachment)
  };

  const dismissed_at: DismissedAtMap = {
    unbooked_invoices: typeof rawDismissedAt.unbooked_invoices === 'string' ? rawDismissedAt.unbooked_invoices : null,
    overdue_invoices: typeof rawDismissedAt.overdue_invoices === 'string' ? rawDismissedAt.overdue_invoices : null,
    verifications_without_attachment:
      typeof rawDismissedAt.verifications_without_attachment === 'string' ? rawDismissedAt.verifications_without_attachment : null
  };

  if (date !== today) {
    return { date: today, dismissed: { ...DEFAULT_DISMISSED }, dismissed_at: { ...DEFAULT_DISMISSED_AT } };
  }

  return { date, dismissed, dismissed_at };
}

export default function FinancePage() {
  const { role, companyId } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const query = useFinanceOverview(companyId);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [attachmentFilter, setAttachmentFilter] = useState<AttachmentFilter>('all');
  const [search, setSearch] = useState('');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<DismissedMap>({ ...DEFAULT_DISMISSED });
  const [dismissedAt, setDismissedAt] = useState<DismissedAtMap>({ ...DEFAULT_DISMISSED_AT });

  const monthRange = useMemo(() => currentMonthRange(), []);
  const todayIso = new Date().toISOString().slice(0, 10);

  const monthVatQuery = useQuery({
    queryKey: ['finance-month-vat', companyId, monthRange.start, monthRange.end],
    queryFn: () => vatReport(companyId, monthRange.start, monthRange.end),
    enabled: role !== 'member'
  });

  const invoiceTodoQuery = useQuery<InvoiceTodoRow[]>({
    queryKey: ['finance-invoice-todo', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,status,due_date,total,currency,booking_verification_id:rpc_result->>booking_verification_id')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(300)
        .returns<InvoiceTodoRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: role !== 'member'
  });

  useEffect(() => {
    let active = true;

    async function loadTodoPreferences() {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setCurrentUserId(null);
        setDismissed({ ...DEFAULT_DISMISSED });
        setDismissedAt({ ...DEFAULT_DISMISSED_AT });
        return;
      }

      setCurrentUserId(user.id);

      const { data } = await supabase
        .from('user_company_preferences')
        .select('preference_value')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .eq('preference_key', TODO_PREF_KEY)
        .maybeSingle();

      if (!active) return;

      const normalized = normalizeTodoPreference(data?.preference_value, todayIso);
      setDismissed(normalized.dismissed);
      setDismissedAt(normalized.dismissed_at);

      const storedDate =
        data?.preference_value && typeof data.preference_value === 'object' && !Array.isArray(data.preference_value)
          ? (data.preference_value as Record<string, unknown>).date
          : null;

      if (normalized.date !== storedDate) {
        void persistDismissedPreference(normalized.dismissed, normalized.dismissed_at, user.id, todayIso);
      }
    }

    void loadTodoPreferences();

    return () => {
      active = false;
    };
  }, [companyId, supabase, todayIso]);

  async function persistDismissedPreference(next: DismissedMap, nextDismissedAt: DismissedAtMap, userId: string, date: string) {
    await supabase.from('user_company_preferences').upsert(
      {
        company_id: companyId,
        user_id: userId,
        preference_key: TODO_PREF_KEY,
        preference_value: { date, dismissed: next, dismissed_at: nextDismissedAt }
      },
      { onConflict: 'company_id,user_id,preference_key' }
    );
  }

  function markTodoDone(key: TodoCardKey) {
    const now = new Date().toISOString();

    setDismissed((prevDismissed) => {
      const nextDismissed = { ...prevDismissed, [key]: true };

      setDismissedAt((prevDismissedAt) => {
        const nextDismissedAt = { ...prevDismissedAt, [key]: now };
        if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
        return nextDismissedAt;
      });

      return nextDismissed;
    });
  }

  function undoTodoDone(key: TodoCardKey) {
    setDismissed((prevDismissed) => {
      const nextDismissed = { ...prevDismissed, [key]: false };

      setDismissedAt((prevDismissedAt) => {
        const nextDismissedAt = { ...prevDismissedAt, [key]: null };
        if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
        return nextDismissedAt;
      });

      return nextDismissed;
    });
  }

  function resetAllTodoCards() {
    const nextDismissed = { ...DEFAULT_DISMISSED };
    const nextDismissedAt = { ...DEFAULT_DISMISSED_AT };

    setDismissed(nextDismissed);
    setDismissedAt(nextDismissedAt);

    if (currentUserId) void persistDismissedPreference(nextDismissed, nextDismissedAt, currentUserId, todayIso);
  }

  const rows = query.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
      if (attachmentFilter === 'with' && !row.attachment_path) return false;
      if (attachmentFilter === 'without' && row.attachment_path) return false;

      if (!normalizedSearch) return true;
      const haystack = [
        row.description,
        row.id,
        verificationNumberLabel(row.fiscal_year, row.verification_no),
        row.source ?? '',
        row.status ?? ''
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [rows, statusFilter, sourceFilter, attachmentFilter, normalizedSearch]);

  const stats = useMemo(() => {
    const booked = filteredRows.filter((row) => row.status !== 'voided');
    const voided = filteredRows.filter((row) => row.status === 'voided');
    const withAttachment = filteredRows.filter((row) => Boolean(row.attachment_path));
    const totalBooked = booked.reduce((sum, row) => sum + Number(row.total), 0);
    const latest = filteredRows[0] ?? null;

    return {
      allCount: filteredRows.length,
      bookedCount: booked.length,
      voidedCount: voided.length,
      withAttachmentCount: withAttachment.length,
      totalBooked,
      latest
    };
  }, [filteredRows]);

  const todo = useMemo(() => {
    const invoices = invoiceTodoQuery.data ?? [];

    const unbookedInvoices = invoices.filter((inv) => !inv.booking_verification_id).slice(0, 8);
    const overdueInvoices = invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'void' && inv.due_date < todayIso).slice(0, 8);
    const verificationsWithoutAttachment = rows.filter((row) => row.status !== 'voided' && !row.attachment_path).slice(0, 8);

    return { unbookedInvoices, overdueInvoices, verificationsWithoutAttachment };
  }, [invoiceTodoQuery.data, rows, todayIso]);

  const vatBoxes = (monthVatQuery.data as Record<string, unknown> | null)?.boxes as Record<string, unknown> | undefined;
  const vat49 = Number(vatBoxes?.['49'] ?? 0);

  const hiddenCount = Number(dismissed.unbooked_invoices) + Number(dismissed.overdue_invoices) + Number(dismissed.verifications_without_attachment);

  return (
    <RoleGate role={role} allow={['finance', 'admin', 'auditor']}>
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {role !== 'auditor' ? (
            <>
              <Button asChild><Link href="/finance/verifications/new">Ny verifikation</Link></Button>
              <Button variant="secondary" asChild><Link href="/finance/verifications/drafts">Utkast</Link></Button>
            </>
          ) : null}
          <Button variant="outline" asChild><Link href="/orders">Ordrar</Link></Button>
          <Button variant="outline" asChild><Link href="/invoices">Fakturor</Link></Button>
          <Button variant="outline" asChild><Link href="/reports">Alla rapporter</Link></Button>
        </div>
        <BankReconciliationCard companyId={companyId} />

        <Card>
          <CardHeader><CardTitle>Dagens läge</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
            <StatCard title="Verifikationer (urval)" value={String(stats.allCount)} />
            <StatCard title="Bokförda" value={String(stats.bookedCount)} />
            <StatCard title="Makulerade" value={String(stats.voidedCount)} />
            <StatCard title="Med bilaga" value={String(stats.withAttachmentCount)} />
            <StatCard title="Bokfört belopp" value={money(stats.totalBooked)} />
            <StatCard title={`Moms ruta 49 (${monthRange.start} - ${monthRange.end})`} value={money(vat49)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Att göra i ekonomi idag</CardTitle>
              {hiddenCount > 0 ? <Button size="sm" variant="outline" onClick={resetAllTodoCards}>Visa alla ({hiddenCount} dolda)</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            <TodoCard title="Obokförda fakturor" hidden={dismissed.unbooked_invoices} dismissedAt={dismissedAt.unbooked_invoices} onDone={() => markTodoDone('unbooked_invoices')} onUndo={() => undoTodoDone('unbooked_invoices')}>
              {todo.unbookedInvoices.length === 0 ? (
                <p className="text-sm text-foreground/70">Inga obokförda fakturor.</p>
              ) : (
                <div className="space-y-2">
                  {todo.unbookedInvoices.map((inv) => (
                    <div key={inv.id} className="rounded border p-2 text-sm">
                      <p className="font-medium"><Link className="underline underline-offset-2" href={`/invoices/${inv.id}`}>{inv.invoice_no}</Link></p>
                      <p className="text-foreground/70">{money(Number(inv.total))} {inv.currency}</p>
                    </div>
                  ))}
                </div>
              )}
            </TodoCard>

            <TodoCard title="Förfallna obetalda fakturor" hidden={dismissed.overdue_invoices} dismissedAt={dismissedAt.overdue_invoices} onDone={() => markTodoDone('overdue_invoices')} onUndo={() => undoTodoDone('overdue_invoices')}>
              {todo.overdueInvoices.length === 0 ? (
                <p className="text-sm text-foreground/70">Inga förfallna fakturor.</p>
              ) : (
                <div className="space-y-2">
                  {todo.overdueInvoices.map((inv) => (
                    <div key={inv.id} className="rounded border p-2 text-sm">
                      <p className="font-medium"><Link className="underline underline-offset-2" href={`/invoices/${inv.id}`}>{inv.invoice_no}</Link></p>
                      <p className="text-foreground/70">Förfallodag: {formatDate(inv.due_date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </TodoCard>

            <TodoCard title="Verifikationer utan bilaga" hidden={dismissed.verifications_without_attachment} dismissedAt={dismissedAt.verifications_without_attachment} onDone={() => markTodoDone('verifications_without_attachment')} onUndo={() => undoTodoDone('verifications_without_attachment')}>
              {todo.verificationsWithoutAttachment.length === 0 ? (
                <p className="text-sm text-foreground/70">Alla bokförda verifikationer har bilaga.</p>
              ) : (
                <div className="space-y-2">
                  {todo.verificationsWithoutAttachment.map((row) => (
                    <div key={row.id} className="rounded border p-2 text-sm">
                      <p className="font-medium"><Link className="underline underline-offset-2" href={`/finance/verifications/${row.id}`}>{verificationNumberLabel(row.fiscal_year, row.verification_no)}</Link></p>
                      <p className="text-foreground/70 truncate">{row.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </TodoCard>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Snabbfilter</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-4">
            <Input placeholder="Sök på text, id, ver.nr" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                <SelectItem value="booked">Bokförd</SelectItem>
                <SelectItem value="voided">Makulerad</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
              <SelectTrigger><SelectValue placeholder="Källa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla källor</SelectItem>
                <SelectItem value="mobile">Mobil</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
            <Select value={attachmentFilter} onValueChange={(value) => setAttachmentFilter(value as AttachmentFilter)}>
              <SelectTrigger><SelectValue placeholder="Bilaga" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla bilagor</SelectItem>
                <SelectItem value="with">Med bilaga</SelectItem>
                <SelectItem value="without">Utan bilaga</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="p-0">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Nr</TableHead><TableHead>Datum</TableHead><TableHead>Beskrivning</TableHead><TableHead>Status</TableHead><TableHead>Total</TableHead><TableHead>Källa</TableHead><TableHead>Skapad</TableHead><TableHead>Bilaga</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-foreground/70">Inga verifikationer matchar filtret.</TableCell></TableRow>
              ) : filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{verificationNumberLabel(row.fiscal_year, row.verification_no)}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell><Link href={`/finance/verifications/${row.id}`} className="font-medium underline-offset-4 hover:underline">{row.description}</Link></TableCell>
                  <TableCell>{statusLabel(row.status)}</TableCell>
                  <TableCell>{Number(row.total).toFixed(2)} kr</TableCell>
                  <TableCell>{sourceLabel(row.source)}</TableCell>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                  <TableCell>{row.attachment_path ? 'Ja' : 'Nej'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {stats.latest ? (
          <Card>
            <CardHeader><CardTitle>Senaste aktivitet</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p><span className="font-medium">{verificationNumberLabel(stats.latest.fiscal_year, stats.latest.verification_no)}</span> {stats.latest.description}</p>
              <p className="text-foreground/70">{formatDateTime(stats.latest.created_at)} - {statusLabel(stats.latest.status)} - {Number(stats.latest.total).toFixed(2)} kr</p>
              <div className="mt-2"><Badge>{sourceLabel(stats.latest.source)}</Badge></div>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </RoleGate>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-foreground/70">{title}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function TodoCard({ title, hidden, dismissedAt, onDone, onUndo, children }: { title: string; hidden: boolean; dismissedAt: string | null; onDone: () => void; onUndo: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {hidden ? <Button size="sm" variant="outline" onClick={onUndo}>Ångra</Button> : <Button size="sm" variant="outline" onClick={onDone}>Klar för idag</Button>}
      </div>

      {hidden ? (
        <div className="space-y-1 text-sm text-foreground/70">
          <p>Markerad som klar för idag.</p>
          {dismissedAt ? <p>Senast markerad klar: {formatDateTime(dismissedAt)}</p> : null}
        </div>
      ) : (
        children
      )}
    </div>
  );
}


