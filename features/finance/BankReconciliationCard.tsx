'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';

type BankTransaction = {
  id: string;
  booking_date: string;
  amount: number;
  currency: string;
  description: string;
  reference: string | null;
  status: 'new' | 'suggested' | 'matched' | 'ignored';
};

type BankMatch = {
  id: string;
  bank_transaction_id: string;
  invoice_id: string | null;
  confidence: number;
  status: 'suggested' | 'confirmed' | 'rejected';
  reason: string | null;
};

type InvoiceLite = {
  id: string;
  invoice_no: string;
  total: number;
  due_date: string;
  status: string;
  currency: string;
};

type ImportRow = {
  booking_date: string;
  amount: number;
  description: string;
  reference: string | null;
  counterparty: string | null;
  external_id: string | null;
  currency: string;
};

function parseAmount(raw: string) {
  const clean = raw.replace(/\s|\u00A0/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const value = Number(clean);
  return Number.isFinite(value) ? value : NaN;
}

function parseDate(raw: string) {
  const input = raw.trim();
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const m1 = input.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;

  const m2 = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  return null;
}

function splitCsvLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  result.push(current.trim());
  return result;
}

function pickHeader(headers: string[], aliases: string[]) {
  const normalized = headers.map((h) =>
    h
      .toLowerCase()
      .replace(/[\s_]+/g, '')
      .replace(/[^a-z0-9åäö]/g, '')
  );

  const aliasSet = new Set(
    aliases.map((a) =>
      a
        .toLowerCase()
        .replace(/[\s_]+/g, '')
        .replace(/[^a-z0-9åäö]/g, '')
    )
  );

  for (let i = 0; i < normalized.length; i += 1) {
    if (aliasSet.has(normalized[i])) return i;
  }
  return -1;
}

function parseBankCsv(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter);

  const idxDate = pickHeader(headers, ['bookingdate', 'booking_date', 'bookingdatum', 'bokfordatum', 'bokforingsdatum', 'date', 'datum']);
  const idxAmount = pickHeader(headers, ['amount', 'belopp']);
  const idxDescription = pickHeader(headers, ['description', 'beskrivning', 'text', 'meddelande']);
  const idxReference = pickHeader(headers, ['reference', 'referens', 'ocr', 'messageid']);
  const idxCounterparty = pickHeader(headers, ['counterparty', 'motpart', 'namn']);
  const idxExternalId = pickHeader(headers, ['externalid', 'id', 'transactionid', 'transaktionsid']);
  const idxCurrency = pickHeader(headers, ['currency', 'valuta']);

  if (idxDate < 0 || idxAmount < 0) {
    throw new Error('CSV måste innehålla kolumner för datum och belopp.');
  }

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    const date = parseDate(cols[idxDate] ?? '');
    const amount = parseAmount(cols[idxAmount] ?? '');

    if (!date || !Number.isFinite(amount)) continue;

    rows.push({
      booking_date: date,
      amount: Math.round(amount * 100) / 100,
      description: idxDescription >= 0 ? (cols[idxDescription] ?? '').trim() : 'Banktransaktion',
      reference: idxReference >= 0 ? (cols[idxReference] ?? '').trim() || null : null,
      counterparty: idxCounterparty >= 0 ? (cols[idxCounterparty] ?? '').trim() || null : null,
      external_id: idxExternalId >= 0 ? (cols[idxExternalId] ?? '').trim() || null : null,
      currency: idxCurrency >= 0 ? (cols[idxCurrency] ?? '').trim().toUpperCase() || 'SEK' : 'SEK'
    });
  }

  return rows;
}

function toMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

export default function BankReconciliationCard({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [daysTolerance, setDaysTolerance] = useState('5');
  const [amountTolerance, setAmountTolerance] = useState('1.00');

  const query = useQuery({
    queryKey: ['bank-reconciliation', companyId],
    queryFn: async () => {
      const supabaseUntyped = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
              in: (column: string, values: string[]) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
            };
          };
        };
      };

      const [{ data: txData, error: txError }, { data: matchData, error: matchError }] = await Promise.all([
        supabaseUntyped
          .from('bank_transactions')
          .select('id,booking_date,amount,currency,description,reference,status')
          .eq('company_id', companyId)
          .order('booking_date', { ascending: false }),
        supabaseUntyped
          .from('bank_transaction_matches')
          .select('id,bank_transaction_id,invoice_id,confidence,status,reason')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
      ]);

      if (txError) throw new Error(txError.message);
      if (matchError) throw new Error(matchError.message);

      const transactions = ((txData ?? []) as unknown as BankTransaction[]).slice(0, 300);
      const matches = ((matchData ?? []) as unknown as BankMatch[]).filter((m) => m.status !== 'rejected');

      const invoiceIds = [...new Set(matches.map((m) => m.invoice_id).filter((id): id is string => Boolean(id)))];
      let invoices: InvoiceLite[] = [];

      if (invoiceIds.length > 0) {
        const { data: invoiceData, error: invoiceError } = await supabaseUntyped
          .from('invoices')
          .select('id,invoice_no,total,due_date,status,currency')
          .eq('company_id', companyId)
          .in('id', invoiceIds);

        if (invoiceError) throw new Error(invoiceError.message);
        invoices = (invoiceData ?? []) as unknown as InvoiceLite[];
      }

      return { transactions, matches, invoices };
    }
  });

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };

      const { data, error } = await supabaseUntyped.rpc('import_bank_transactions', {
        p_company_id: companyId,
        p_rows: rows,
        p_source: 'csv',
        p_file_name: selectedFileName || null
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (result) => {
      const inserted = Number(result?.rows_inserted ?? 0);
      const duplicates = Number(result?.rows_duplicates ?? 0);
      toast.success(`Import klar. ${inserted} nya, ${duplicates} dubletter.`);
      await queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', companyId] });
    },
    onError: (error) => toast.error(toMessage(error, 'Kunde inte importera banktransaktioner'))
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };

      const { data, error } = await supabaseUntyped.rpc('auto_match_bank_transactions', {
        p_company_id: companyId,
        p_days_tolerance: Math.max(0, Number(daysTolerance || 5)),
        p_amount_tolerance: Math.max(0, Number(amountTolerance || 1))
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (result) => {
      toast.success(`Auto-match klar. Kontrollerade ${Number(result?.checked ?? 0)}, föreslagna ${Number(result?.suggested ?? 0)}.`);
      await queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', companyId] });
    },
    onError: (error) => toast.error(toMessage(error, 'Kunde inte köra auto-match'))
  });

  const confirmMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };

      const { error } = await supabaseUntyped.rpc('confirm_bank_transaction_match', {
        p_match_id: matchId,
        p_payment_method: 'bank'
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Match bekräftad och betalning registrerad.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-invoice-todo', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['receivables-open-report', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['receivables-reconciliation-report', companyId] })
      ]);
    },
    onError: (error) => toast.error(toMessage(error, 'Kunde inte bekräfta match'))
  });

  const rejectMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };

      const { error } = await supabaseUntyped.rpc('reject_bank_transaction_match', {
        p_match_id: matchId,
        p_reason: 'Manuellt avvisad'
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Match avvisad.');
      await queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', companyId] });
    },
    onError: (error) => toast.error(toMessage(error, 'Kunde inte avvisa match'))
  });

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setSelectedFileName(file.name);
      const text = await file.text();
      const rows = parseBankCsv(text);
      if (rows.length === 0) {
        toast.error('Inga giltiga transaktionsrader hittades i filen.');
        return;
      }
      await importMutation.mutateAsync(rows);
    } catch (error) {
      toast.error(toMessage(error, 'Kunde inte läsa/importera filen'));
    } finally {
      event.target.value = '';
    }
  }

  const transactions = query.data?.transactions ?? [];
  const matches = query.data?.matches ?? [];
  const invoices = query.data?.invoices ?? [];

  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  const suggestedMatches = matches.filter((m) => m.status === 'suggested').slice(0, 100);
  const matchedCount = transactions.filter((t) => t.status === 'matched').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Bankavstämning</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={'/help/bankavstamning' as Route}>Hur fungerar bankavstämning?</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-6">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm">Importera kontoutdrag (CSV)</span>
            <Input type="file" accept=".csv,.txt" onChange={onFileChange} disabled={importMutation.isPending} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Datumtolerans (dagar)</span>
            <Input type="number" min="0" value={daysTolerance} onChange={(e) => setDaysTolerance(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Beloppstolerans</span>
            <Input type="number" min="0" step="0.01" value={amountTolerance} onChange={(e) => setAmountTolerance(e.target.value)} />
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button variant="outline" className="w-full" asChild>
              <a href={`/api/finance/bank/sample-csv?companyId=${encodeURIComponent(companyId)}`}>Ladda ner match-demo CSV</a>
            </Button>
            <Button className="w-full" onClick={() => autoMatchMutation.mutate()} disabled={autoMatchMutation.isPending || transactions.length === 0}>
              {autoMatchMutation.isPending ? 'Matchar...' : 'Kör auto-match'}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4 text-sm">
          <div className="rounded-lg border p-3"><p>Transaktioner</p><p className="font-semibold">{transactions.length}</p></div>
          <div className="rounded-lg border p-3"><p>Föreslagna matchningar</p><p className="font-semibold">{suggestedMatches.length}</p></div>
          <div className="rounded-lg border p-3"><p>Matchade</p><p className="font-semibold">{matchedCount}</p></div>
          <div className="rounded-lg border p-3"><p>Fil</p><p className="font-semibold truncate">{selectedFileName || '-'}</p></div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Föreslagna matchningar</h3>
          {suggestedMatches.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm">Inga matchningsförslag ännu.</p>
          ) : (
            suggestedMatches.map((match) => {
              const tx = transactions.find((row) => row.id === match.bank_transaction_id);
              const invoice = match.invoice_id ? invoiceById.get(match.invoice_id) : null;

              return (
                <div key={match.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{tx?.booking_date ?? '-'} • {Number(tx?.amount ?? 0).toFixed(2)} {tx?.currency ?? 'SEK'}</p>
                  <p className="text-foreground/70">{tx?.description ?? '-'}</p>
                  <p className="text-foreground/70">Förslag: {invoice ? `${invoice.invoice_no} (${Number(invoice.total).toFixed(2)} ${invoice.currency})` : 'Ingen faktura'}</p>
                  <p className="text-foreground/70">Träffsäkerhet: {Number(match.confidence ?? 0).toFixed(2)}%</p>
                  {match.reason ? <p className="text-foreground/70">Motivering: {match.reason}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => confirmMutation.mutate(match.id)} disabled={confirmMutation.isPending}>Bekräfta</Button>
                    <Button size="sm" variant="secondary" onClick={() => rejectMutation.mutate(match.id)} disabled={rejectMutation.isPending}>Avvisa</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Senaste banktransaktioner</h3>
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Text</TableHead>
                <TableHead>Referens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Belopp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-foreground/70">Inga importerade banktransaktioner.</TableCell></TableRow>
              ) : (
                transactions.slice(0, 80).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.booking_date}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell>{tx.reference ?? '-'}</TableCell>
                    <TableCell>{tx.status}</TableCell>
                    <TableCell className="text-right">{Number(tx.amount).toFixed(2)} {tx.currency}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}




