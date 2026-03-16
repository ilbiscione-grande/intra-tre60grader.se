'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/providers/AppContext';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

type PrintInvoiceRow = {
  id: string;
  invoice_no: string;
  currency: string;
  issue_date: string;
  supply_date: string | null;
  due_date: string;
  payment_terms_text: string | null;
  seller_vat_no: string | null;
  buyer_reference: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company_snapshot: Json;
  customer_snapshot: Json;
  lines_snapshot: Json;
};

type SnapshotRecord = Record<string, string | number | null | undefined>;

type InvoiceLine = {
  id: string;
  title: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  total: number;
};

function asObject(value: Json): SnapshotRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as SnapshotRecord;
  return {};
}

function asLines(value: Json): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((line, index) => {
      const row = line && typeof line === 'object' && !Array.isArray(line) ? (line as Record<string, unknown>) : null;
      if (!row) return null;
      return {
        id: String(row.id ?? index),
        title: String(row.title ?? ''),
        qty: Number(row.qty ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        vat_rate: Number(row.vat_rate ?? 0),
        total: Number(row.total ?? 0)
      };
    })
    .filter((item): item is InvoiceLine => item !== null);
}

function formatMoney(value: number, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
}

export default function InvoicePrintPage() {
  const { companyId } = useAppContext();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const query = useQuery<PrintInvoiceRow | null>({
    queryKey: ['invoice-print', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,currency,issue_date,supply_date,due_date,payment_terms_text,seller_vat_no,buyer_reference,subtotal,vat_total,total,company_snapshot,customer_snapshot,lines_snapshot')
        .eq('company_id', companyId)
        .eq('id', id)
        .maybeSingle<PrintInvoiceRow>();
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (!query.data) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [query.data]);

  if (!query.data) return <p className="p-6">Laddar faktura...</p>;

  const invoice = query.data;
  const company = asObject(invoice.company_snapshot);
  const customer = asObject(invoice.customer_snapshot);
  const lines = asLines(invoice.lines_snapshot);

  return (
    <main className="mx-auto max-w-4xl p-8 text-sm text-black">
      <header className="mb-8 flex items-start justify-between gap-8">
        <div>
          <h1 className="text-2xl font-bold">Faktura {invoice.invoice_no}</h1>
          <p>Fakturadatum: {new Date(invoice.issue_date).toLocaleDateString('sv-SE')}</p>
          <p>Leverans-/prestationsdatum: {new Date(invoice.supply_date ?? invoice.issue_date).toLocaleDateString('sv-SE')}</p>
          <p>Förfallodatum: {new Date(invoice.due_date).toLocaleDateString('sv-SE')}</p>
          <p>Betalningsvillkor: {invoice.payment_terms_text ?? '30 dagar netto'}</p>
          <p>Valuta: {invoice.currency}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{company.name ?? ''}</p>
          <p>Org.nr: {company.org_no ?? ''}</p>
          <p>Momsnr: {invoice.seller_vat_no ?? company.vat_no ?? '-'}</p>
          <p>{company.address_line1 ?? ''}</p>
          {company.address_line2 ? <p>{company.address_line2}</p> : null}
          <p>{company.postal_code ?? ''} {company.city ?? ''}</p>
          <p>{company.country ?? ''}</p>
          {company.phone ? <p>Tel: {company.phone}</p> : null}
          {company.billing_email ? <p>{company.billing_email}</p> : null}
        </div>
      </header>

      <section className="mb-6 rounded border p-4">
        <p className="font-medium">Fakturamottagare</p>
        <p>{customer.name ?? '-'}</p>
        {customer.org_no ? <p>Org.nr: {customer.org_no}</p> : null}
        {customer.vat_no ? <p>Momsnr: {customer.vat_no}</p> : null}
        {customer.address_line1 ? <p>{customer.address_line1}</p> : null}
        {customer.address_line2 ? <p>{customer.address_line2}</p> : null}
        {(customer.postal_code || customer.city) ? <p>{customer.postal_code ?? ''} {customer.city ?? ''}</p> : null}
        {customer.country ? <p>{customer.country}</p> : null}
        {invoice.buyer_reference ? <p>Kundreferens: {invoice.buyer_reference}</p> : null}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Titel</th>
            <th className="py-2 text-right">Antal</th>
            <th className="py-2 text-right">A-pris</th>
            <th className="py-2 text-right">Moms %</th>
            <th className="py-2 text-right">Radtotal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b">
              <td className="py-2">{line.title}</td>
              <td className="py-2 text-right">{line.qty.toFixed(2)}</td>
              <td className="py-2 text-right">{line.unit_price.toFixed(2)}</td>
              <td className="py-2 text-right">{line.vat_rate.toFixed(2)}</td>
              <td className="py-2 text-right">{line.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-6 ml-auto w-80 space-y-1">
        <p>Delsumma: {formatMoney(Number(invoice.subtotal), invoice.currency)}</p>
        <p>Moms: {formatMoney(Number(invoice.vat_total), invoice.currency)}</p>
        <p className="text-lg font-semibold">Total: {formatMoney(Number(invoice.total), invoice.currency)}</p>
      </section>

      <section className="mt-8 border-t pt-3 text-xs text-black/80">
        <p>Betalningsvillkor: {invoice.payment_terms_text ?? '30 dagar netto'}.</p>
        {company.invoice_terms_note ? <p>{String(company.invoice_terms_note)}</p> : null}
        {company.late_payment_interest_rate ? <p>Dröjsmålsränta: {company.late_payment_interest_rate}%.</p> : null}
      </section>
    </main>
  );
}
