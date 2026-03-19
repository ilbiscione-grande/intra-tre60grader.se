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

  return NextResponse.json(
    {
      ...data,
      invoice_sources: ((sources ?? []) as InvoiceSourceRow[]),
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
