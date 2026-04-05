'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
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
  rpc_result: Json;
};

type SnapshotRecord = Record<string, string | number | null | undefined>;

type InvoiceLine = {
  id: string;
  title: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  total: number;
  order_id: string | null;
  project_id: string | null;
};

type InvoiceSourceLineRow = {
  order_id: string;
  order_line_id: string;
  allocated_total: number;
};

type OrderLineLookupRow = {
  id: string;
  title: string;
  order_id: string;
};

type OrderLookupRow = {
  id: string;
  order_no: string | null;
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
        total: Number(row.total ?? 0),
        order_id: typeof row.order_id === 'string' ? row.order_id : null,
        project_id: typeof row.project_id === 'string' ? row.project_id : null
      };
    })
    .filter((item): item is InvoiceLine => item !== null);
}

function parseInvoiceRpcMeta(value: Json) {
  const rec = asObject(value);
  return {
    isPartial: String(rec.partial ?? '') === 'true',
    isLineSelection: rec.selection_mode === 'lines'
  };
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
        .select('id,invoice_no,currency,issue_date,supply_date,due_date,payment_terms_text,seller_vat_no,buyer_reference,subtotal,vat_total,total,company_snapshot,customer_snapshot,lines_snapshot,rpc_result')
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
  const invoiceRpcMeta = parseInvoiceRpcMeta(invoice.rpc_result);
  const invoiceOrderIds = useMemo(
    () => Array.from(new Set(lines.map((line) => line.order_id).filter((value): value is string => Boolean(value)))),
    [lines]
  );
  const invoiceLineIds = useMemo(
    () => lines.map((line) => line.id).filter((value) => isUuidLike(value)),
    [lines]
  );

  const sourceLineLinksQuery = useQuery<InvoiceSourceLineRow[]>({
    queryKey: ['invoice-print-source-line-links', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_source_lines')
        .select('order_id,order_line_id,allocated_total')
        .eq('company_id', companyId)
        .eq('invoice_id', id)
        .returns<InvoiceSourceLineRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const orderLinesLookupQuery = useQuery<OrderLineLookupRow[]>({
    queryKey: ['invoice-print-order-lines-lookup', companyId, id, invoiceLineIds.join(',')],
    queryFn: async () => {
      if (invoiceLineIds.length === 0) return [];

      const { data, error } = await supabase
        .from('order_lines')
        .select('id,title,order_id')
        .eq('company_id', companyId)
        .in('id', invoiceLineIds)
        .returns<OrderLineLookupRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: invoiceLineIds.length > 0
  });

  const ordersLookupQuery = useQuery<OrderLookupRow[]>({
    queryKey: ['invoice-print-orders-lookup', companyId, id, invoiceOrderIds.join(',')],
    queryFn: async () => {
      if (invoiceOrderIds.length === 0) return [];

      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no')
        .eq('company_id', companyId)
        .in('id', invoiceOrderIds)
        .returns<OrderLookupRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: invoiceOrderIds.length > 0
  });

  const orderLineLookupById = useMemo(
    () => new Map((orderLinesLookupQuery.data ?? []).map((row) => [row.id, row])),
    [orderLinesLookupQuery.data]
  );
  const orderLookupById = useMemo(
    () => new Map((ordersLookupQuery.data ?? []).map((row) => [row.id, row])),
    [ordersLookupQuery.data]
  );
  const sourceLineLinksByOrderLineId = useMemo(() => {
    const map = new Map<string, InvoiceSourceLineRow[]>();
    for (const row of sourceLineLinksQuery.data ?? []) {
      const current = map.get(row.order_line_id) ?? [];
      current.push(row);
      map.set(row.order_line_id, current);
    }
    return map;
  }, [sourceLineLinksQuery.data]);

  const lineTraceRows = useMemo(
    () =>
      lines.map((line) => {
        const exactLinks = isUuidLike(line.id) ? sourceLineLinksByOrderLineId.get(line.id) ?? [] : [];
        const resolvedOrderId = exactLinks[0]?.order_id ?? line.order_id ?? null;
        const orderMeta = resolvedOrderId ? orderLookupById.get(resolvedOrderId) : null;
        const orderLineMeta = isUuidLike(line.id) ? orderLineLookupById.get(line.id) ?? null : null;

        return {
          line,
          resolvedOrderId,
          orderNo: orderMeta?.order_no ?? null,
          orderLineTitle: orderLineMeta?.title ?? line.title,
          isExactOrderLine: isUuidLike(line.id),
          allocatedGrossTotal: exactLinks.reduce((sum, row) => sum + Number(row.allocated_total ?? 0), 0)
        };
      }),
    [lines, orderLineLookupById, orderLookupById, sourceLineLinksByOrderLineId]
  );

  return (
    <main className="mx-auto max-w-4xl p-8 text-sm text-black">
      <header className="mb-8 flex items-start justify-between gap-8">
        <div>
          <h1 className="text-2xl font-bold">Faktura {invoice.invoice_no}</h1>
          {invoiceRpcMeta.isPartial ? <p>Delfaktura</p> : null}
          {invoiceRpcMeta.isLineSelection ? <p>Skapad från valda orderrader</p> : null}
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
            <th className="py-2 text-left">Källa</th>
            <th className="py-2 text-right">Antal</th>
            <th className="py-2 text-right">A-pris</th>
            <th className="py-2 text-right">Moms %</th>
            <th className="py-2 text-right">Radtotal</th>
          </tr>
        </thead>
        <tbody>
          {lineTraceRows.map(({ line, resolvedOrderId, orderNo, orderLineTitle, isExactOrderLine, allocatedGrossTotal }) => (
            <tr key={line.id} className="border-b align-top">
              <td className="py-2">{line.title}</td>
              <td className="py-2">
                <div className="space-y-1 text-xs">
                  {resolvedOrderId ? (
                    <p>
                      <Link href={`/orders/${resolvedOrderId}`} className="underline underline-offset-2">
                        {orderNo ? `Order ${orderNo}` : 'Öppna order'}
                      </Link>
                    </p>
                  ) : null}
                  <p>{isExactOrderLine ? `Orderrad: ${orderLineTitle}` : 'Beloppsbaserad delrad'}</p>
                  {allocatedGrossTotal > 0 ? <p>Allokerat brutto: {formatMoney(allocatedGrossTotal, invoice.currency)}</p> : null}
                </div>
              </td>
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
