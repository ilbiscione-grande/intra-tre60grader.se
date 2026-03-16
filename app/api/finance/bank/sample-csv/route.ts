import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type MemberRole = 'member' | 'finance' | 'admin' | 'auditor';

type InvoiceSampleRow = {
  id: string;
  invoice_no: string;
  total: number;
  due_date: string;
  issue_date: string;
  currency: string;
  status: string;
};

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const { data: member } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<{ role: MemberRole }>();

  if (!member || !['finance', 'admin', 'auditor'].includes(member.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('invoices')
    .select('id,invoice_no,total,due_date,issue_date,currency,status')
    .eq('company_id', companyId)
    .in('status', ['issued', 'sent'])
    .order('due_date', { ascending: true })
    .limit(25)
    .returns<InvoiceSampleRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invoices = data ?? [];
  if (invoices.length === 0) {
    return NextResponse.json(
      { error: 'Inga öppna fakturor (issued/sent) hittades att skapa match-demo från.' },
      { status: 400 }
    );
  }

  const rows: string[] = [];
  rows.push('booking_date,amount,description,reference,counterparty,external_id,currency');

  invoices.forEach((inv, index) => {
    const bookingDate = inv.due_date || inv.issue_date;
    const amount = Number(inv.total).toFixed(2);
    const reference = inv.invoice_no;
    const description = `Inbetalning ${inv.invoice_no}`;
    const counterparty = 'Demo-kund';
    const externalId = `DEMO-${bookingDate.replace(/-/g, '')}-${String(index + 1).padStart(4, '0')}`;
    const currency = inv.currency || 'SEK';

    rows.push(
      [
        bookingDate,
        amount,
        csvEscape(description),
        csvEscape(reference),
        csvEscape(counterparty),
        csvEscape(externalId),
        currency
      ].join(',')
    );
  });

  const body = `${rows.join('\n')}\n`;
  const fileName = `bankutdrag_match_demo_${companyId}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
}
