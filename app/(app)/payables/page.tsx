'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';

type Supplier = {
  id: string;
  name: string;
};

type SupplierInvoice = {
  id: string;
  supplier_id: string;
  supplier_invoice_no: string;
  status: 'issued' | 'paid' | 'void';
  issue_date: string;
  due_date: string;
  total: number;
  paid_total: number;
  open_amount: number;
  currency: string;
  created_at: string;
};

type PayablesRow = {
  supplier_invoice_id: string;
  supplier_invoice_no: string;
  supplier_name: string;
  due_date: string;
  issue_date: string;
  open_amount: number;
  paid_total: number;
  total: number;
  days_overdue: number;
  currency: string;
};

function message(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

function formatMoney(value: number, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
}

function parsePayablesReport(value: unknown) {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rowsRaw = Array.isArray(root.rows) ? root.rows : [];
  const summaryRaw = root.summary && typeof root.summary === 'object' && !Array.isArray(root.summary)
    ? (root.summary as Record<string, unknown>)
    : {};

  const rows = rowsRaw
    .map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      supplier_invoice_id: String(row.supplier_invoice_id ?? ''),
      supplier_invoice_no: String(row.supplier_invoice_no ?? ''),
      supplier_name: String(row.supplier_name ?? ''),
      due_date: String(row.due_date ?? ''),
      issue_date: String(row.issue_date ?? ''),
      open_amount: Number(row.open_amount ?? 0),
      paid_total: Number(row.paid_total ?? 0),
      total: Number(row.total ?? 0),
      days_overdue: Number(row.days_overdue ?? 0),
      currency: String(row.currency ?? 'SEK')
    })) as PayablesRow[];

  return {
    as_of: String(root.as_of ?? new Date().toISOString().slice(0, 10)),
    rows,
    summary: {
      invoice_count: Number(summaryRaw.invoice_count ?? 0),
      open_total: Number(summaryRaw.open_total ?? 0),
      overdue_total: Number(summaryRaw.overdue_total ?? 0)
    }
  };
}

export default function PayablesPage() {
  const { companyId, role } = useAppContext();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const [supplierName, setSupplierName] = useState('');
  const [invoiceSupplierId, setInvoiceSupplierId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
  const [subtotal, setSubtotal] = useState('0');
  const [vatTotal, setVatTotal] = useState('0');

  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const suppliersQuery = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId],
    queryFn: async () => {
      const supabaseUntyped = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              is: (column: string, value: null) => {
                order: (column: string, options: { ascending: boolean }) => Promise<{ data: Supplier[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };

      const { data, error } = await supabaseUntyped
        .from('suppliers')
        .select('id,name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: role !== 'member'
  });

  const invoicesQuery = useQuery<SupplierInvoice[]>({
    queryKey: ['supplier-invoices', companyId],
    queryFn: async () => {
      const supabaseUntyped = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: SupplierInvoice[] | null; error: { message: string } | null }>;
            };
          };
        };
      };

      const { data, error } = await supabaseUntyped
        .from('supplier_invoices')
        .select('id,supplier_id,supplier_invoice_no,status,issue_date,due_date,total,paid_total,open_amount,currency,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: role !== 'member'
  });

  const payablesQuery = useQuery({
    queryKey: ['payables-open-report', companyId, asOf],
    queryFn: async () => {
      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { data, error } = await supabaseUntyped.rpc('payables_open_report', {
        p_company_id: companyId,
        p_as_of: asOf
      });

      if (error) throw new Error(error.message);
      return parsePayablesReport(data);
    },
    enabled: role !== 'member'
  });

  const createSupplierMutation = useMutation({
    mutationFn: async () => {
      const name = supplierName.trim();
      if (!name) throw new Error('Ange leverantörsnamn');

      const supabaseUntyped = supabase as unknown as {
        from: (table: string) => {
          insert: (values: Record<string, unknown>) => {
            select: (columns: string) => {
              single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
            };
          };
        };
      };

      const { data, error } = await supabaseUntyped
        .from('suppliers')
        .insert({ company_id: companyId, name })
        .select('id')
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (data) => {
      setSupplierName('');
      setInvoiceSupplierId(data?.id ?? '');
      await queryClient.invalidateQueries({ queryKey: ['suppliers', companyId] });
      toast.success('Leverantör skapad');
    },
    onError: (error) => toast.error(message(error, 'Kunde inte skapa leverantör'))
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!invoiceSupplierId) throw new Error('Välj leverantör');
      if (!supplierInvoiceNo.trim()) throw new Error('Ange leverantörsfakturanummer');

      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { error } = await supabaseUntyped.rpc('create_supplier_invoice', {
        p_company_id: companyId,
        p_supplier_id: invoiceSupplierId,
        p_supplier_invoice_no: supplierInvoiceNo.trim(),
        p_issue_date: issueDate,
        p_due_date: dueDate,
        p_subtotal: Number(subtotal || 0),
        p_vat_total: Number(vatTotal || 0),
        p_currency: 'SEK',
        p_description: null
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setSupplierInvoiceNo('');
      setSubtotal('0');
      setVatTotal('0');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['supplier-invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['payables-open-report', companyId, asOf] })
      ]);
      toast.success('Leverantörsfaktura registrerad');
    },
    onError: (error) => toast.error(message(error, 'Kunde inte skapa leverantörsfaktura'))
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!paymentInvoiceId) throw new Error('Välj leverantörsfaktura');
      const amount = Number(paymentAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ange giltigt belopp');

      const supabaseUntyped = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { error } = await supabaseUntyped.rpc('register_supplier_invoice_payment', {
        p_supplier_invoice_id: paymentInvoiceId,
        p_amount: amount,
        p_payment_date: paymentDate,
        p_method: 'bank',
        p_reference: null,
        p_note: null
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setPaymentAmount('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['supplier-invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['payables-open-report', companyId, asOf] })
      ]);
      toast.success('Leverantörsbetalning registrerad');
    },
    onError: (error) => toast.error(message(error, 'Kunde inte registrera betalning'))
  });

  const suppliers = suppliersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const report = payablesQuery.data;

  return (
    <RoleGate role={role} allow={['finance', 'admin', 'auditor']}>
      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/finance">Ekonomi</Link></Button>
          <Button variant="outline" asChild><Link href="/invoices">Kundfakturor</Link></Button>
          <Button variant="outline" asChild><Link href="/receivables">Kundreskontra</Link></Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Leverantörsreskontra</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span>Per datum</span>
              <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </label>
            <Metric label="Öppna fakturor" value={String(report?.summary.invoice_count ?? 0)} />
            <Metric label="Öppet belopp" value={`${Number(report?.summary.open_total ?? 0).toFixed(2)} kr`} />
            <Metric label="Förfallet" value={`${Number(report?.summary.overdue_total ?? 0).toFixed(2)} kr`} />
          </CardContent>
        </Card>

        {role !== 'auditor' ? (
          <Card>
            <CardHeader><CardTitle>Ny leverantör / leverantörsfaktura</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <Input placeholder="Ny leverantör (namn)" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                <Button onClick={() => createSupplierMutation.mutate()} disabled={createSupplierMutation.isPending}>Skapa leverantör</Button>
              </div>

              <div className="grid gap-2 md:grid-cols-6">
                <select className="h-10 rounded-md border px-3 text-sm" value={invoiceSupplierId} onChange={(e) => setInvoiceSupplierId(e.target.value)}>
                  <option value="">Välj leverantör</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <Input placeholder="Leverantörsfaktura nr" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                <Input type="number" step="0.01" placeholder="Delsumma" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
                <Input type="number" step="0.01" placeholder="Moms" value={vatTotal} onChange={(e) => setVatTotal(e.target.value)} />
              </div>
              <Button onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending}>Registrera leverantörsfaktura</Button>
            </CardContent>
          </Card>
        ) : null}

        {role !== 'auditor' ? (
          <Card>
            <CardHeader><CardTitle>Registrera betalning</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-4">
              <select className="h-10 rounded-md border px-3 text-sm" value={paymentInvoiceId} onChange={(e) => setPaymentInvoiceId(e.target.value)}>
                <option value="">Välj öppen leverantörsfaktura</option>
                {invoices.filter((i) => Number(i.open_amount) > 0 && i.status !== 'void').map((i) => (
                  <option key={i.id} value={i.id}>{i.supplier_invoice_no} - {Number(i.open_amount).toFixed(2)} {i.currency}</option>
                ))}
              </select>
              <Input type="number" step="0.01" placeholder="Belopp" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <Button onClick={() => payMutation.mutate()} disabled={payMutation.isPending}>Registrera utbetalning</Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Öppna leverantörsfakturor</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Leverantör</TableHead>
                  <TableHead>Faktura</TableHead>
                  <TableHead>Fakturadatum</TableHead>
                  <TableHead>Förfallo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Betalt</TableHead>
                  <TableHead className="text-right">Öppet</TableHead>
                  <TableHead className="text-right">Dagar sen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.rows.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-foreground/70">Inga öppna leverantörsfakturor.</TableCell></TableRow>
                ) : (
                  (report?.rows ?? []).map((row) => (
                    <TableRow key={row.supplier_invoice_id}>
                      <TableCell>{row.supplier_name || '-'}</TableCell>
                      <TableCell>{row.supplier_invoice_no}</TableCell>
                      <TableCell>{new Date(row.issue_date).toLocaleDateString('sv-SE')}</TableCell>
                      <TableCell>{new Date(row.due_date).toLocaleDateString('sv-SE')}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.total, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.paid_total, row.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(row.open_amount, row.currency)}</TableCell>
                      <TableCell className="text-right">{row.days_overdue > 0 ? row.days_overdue : 0}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </RoleGate>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-foreground/70">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
