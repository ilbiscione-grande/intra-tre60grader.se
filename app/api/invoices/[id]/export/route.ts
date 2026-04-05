import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';

type InvoiceExportRow = {
  id: string;
  company_id: string;
  project_id: string;
  order_id: string | null;
  invoice_no: string;
  kind: string;
  credit_for_invoice_id: string | null;
  status: string;
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
  company_snapshot?: Json;
  customer_snapshot?: Json;
  lines_snapshot?: Json;
  rpc_result?: Json;
  created_at: string;
  attachment_path: string | null;
  collection_stage: string;
  collection_note: string | null;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  inkasso_sent_at: string | null;
};

type InvoiceSourceRow = {
  company_id: string;
  invoice_id: string;
  order_id: string;
  order_no: string;
  order_status: string;
  project_id: string;
  project_title: string;
  source_position: number;
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

type ExportInvoiceLineTrace = {
  invoice_line_id: string;
  invoice_line_title: string;
  order_id: string | null;
  order_no: string | null;
  order_line_id: string | null;
  order_line_title: string | null;
  trace_mode: 'exact_order_line' | 'order_linked' | 'unresolved';
  allocated_gross_total: number;
};

function asLines(value: Json | undefined): Array<{
  id: string;
  title: string;
  order_id: string | null;
}> {
  if (!Array.isArray(value)) return [];

  return value
    .map((line, index) => {
      const row = line && typeof line === 'object' && !Array.isArray(line) ? (line as Record<string, unknown>) : null;
      if (!row) return null;

      return {
        id: String(row.id ?? index),
        title: String(row.title ?? ''),
        order_id: typeof row.order_id === 'string' ? row.order_id : null
      };
    })
    .filter((item): item is { id: string; title: string; order_id: string | null } => item !== null);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const compact = new URL(request.url).searchParams.get('compact') === '1';

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const selectColumns = compact
    ? 'id,company_id,project_id,order_id,invoice_no,kind,credit_for_invoice_id,status,collection_stage,collection_note,reminder_1_sent_at,reminder_2_sent_at,inkasso_sent_at,attachment_path,currency,issue_date,supply_date,due_date,payment_terms_text,seller_vat_no,buyer_reference,subtotal,vat_total,total,created_at'
    : 'id,company_id,project_id,order_id,invoice_no,kind,credit_for_invoice_id,status,collection_stage,collection_note,reminder_1_sent_at,reminder_2_sent_at,inkasso_sent_at,attachment_path,currency,issue_date,supply_date,due_date,payment_terms_text,seller_vat_no,buyer_reference,subtotal,vat_total,total,company_snapshot,customer_snapshot,lines_snapshot,rpc_result,created_at';

  const { data, error } = await supabase
    .from('invoices')
    .select(selectColumns)
    .eq('id', params.id)
    .maybeSingle<InvoiceExportRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (compact) {
    const body = {
      ...data,
      export_mode: 'compact',
      notes: 'Compact export excludes snapshots and rpc_result to reduce payload size.'
    };

    return NextResponse.json(body, {
      headers: {
        'Content-Disposition': `attachment; filename="invoice-${data.invoice_no}-compact.json"`,
        'X-Export-Mode': 'compact'
      }
    });
  }

  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('id,amount,payment_date,method,reference,note,direction,overpayment_amount,attachment_path,booking_verification_id,reversed_from_payment_id,created_at')
    .eq('company_id', data.company_id)
    .eq('invoice_id', data.id)
    .order('payment_date', { ascending: true });

  const { data: reminders } = await supabase
    .from('invoice_reminders')
    .select('id,stage,fee,note,sent_at,created_at')
    .eq('company_id', data.company_id)
    .eq('invoice_id', data.id)
    .order('sent_at', { ascending: true });

  const { data: sources, error: sourcesError } = await supabase.rpc('get_invoice_sources', {
    p_invoice_id: data.id
  });

  if (sourcesError) {
    return NextResponse.json({ error: sourcesError.message }, { status: 500 });
  }

  const { data: sourceLines, error: sourceLinesError } = await supabase
    .from('invoice_source_lines')
    .select('order_id,order_line_id,allocated_total')
    .eq('company_id', data.company_id)
    .eq('invoice_id', data.id)
    .returns<InvoiceSourceLineRow[]>();

  if (sourceLinesError) {
    return NextResponse.json({ error: sourceLinesError.message }, { status: 500 });
  }

  const invoiceLines = asLines(data.lines_snapshot);
  const invoiceLineIds = invoiceLines.map((line) => line.id).filter((value) => isUuidLike(value));
  const invoiceOrderIds = Array.from(
    new Set(
      invoiceLines
        .map((line) => line.order_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const { data: orderLines, error: orderLinesError } = invoiceLineIds.length
    ? await supabase
        .from('order_lines')
        .select('id,title,order_id')
        .eq('company_id', data.company_id)
        .in('id', invoiceLineIds)
        .returns<OrderLineLookupRow[]>()
    : { data: [] as OrderLineLookupRow[], error: null };

  if (orderLinesError) {
    return NextResponse.json({ error: orderLinesError.message }, { status: 500 });
  }

  const { data: orders, error: ordersError } = invoiceOrderIds.length
    ? await supabase
        .from('orders')
        .select('id,order_no')
        .eq('company_id', data.company_id)
        .in('id', invoiceOrderIds)
        .returns<OrderLookupRow[]>()
    : { data: [] as OrderLookupRow[], error: null };

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const sourceLinesByOrderLineId = new Map<string, InvoiceSourceLineRow[]>();
  for (const row of sourceLines ?? []) {
    const current = sourceLinesByOrderLineId.get(row.order_line_id) ?? [];
    current.push(row);
    sourceLinesByOrderLineId.set(row.order_line_id, current);
  }

  const orderLineById = new Map((orderLines ?? []).map((row) => [row.id, row]));
  const orderById = new Map((orders ?? []).map((row) => [row.id, row]));

  const line_trace: ExportInvoiceLineTrace[] = invoiceLines.map((line) => {
    const exactLinks = isUuidLike(line.id) ? sourceLinesByOrderLineId.get(line.id) ?? [] : [];
    const resolvedOrderId = exactLinks[0]?.order_id ?? line.order_id ?? null;
    const orderMeta = resolvedOrderId ? orderById.get(resolvedOrderId) : null;
    const orderLineMeta = isUuidLike(line.id) ? orderLineById.get(line.id) ?? null : null;

    return {
      invoice_line_id: line.id,
      invoice_line_title: line.title,
      order_id: resolvedOrderId,
      order_no: orderMeta?.order_no ?? null,
      order_line_id: orderLineMeta?.id ?? null,
      order_line_title: orderLineMeta?.title ?? null,
      trace_mode: orderLineMeta ? 'exact_order_line' : resolvedOrderId ? 'order_linked' : 'unresolved',
      allocated_gross_total: exactLinks.reduce((sum, row) => sum + Number(row.allocated_total ?? 0), 0)
    };
  });

  return NextResponse.json(
    {
      ...data,
      invoice_sources: ((sources ?? []) as InvoiceSourceRow[]),
      invoice_source_lines: sourceLines ?? [],
      line_trace,
      payments: payments ?? [],
      reminders: reminders ?? [],
      export_mode: 'full'
    },
    {
      headers: {
        'Content-Disposition': `attachment; filename="invoice-${data.invoice_no}.json"`,
        'X-Export-Mode': 'full'
      }
    }
  );
}
