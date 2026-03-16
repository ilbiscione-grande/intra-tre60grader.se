import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('company_id');
  const periodStart = searchParams.get('period_start');
  const periodEnd = searchParams.get('period_end');
  const status = searchParams.get('status');

  if (!companyId || !periodStart || !periodEnd) {
    return NextResponse.json({ error: 'Missing required query params' }, { status: 400 });
  }

  const { data: member } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member || (member.role !== 'finance' && member.role !== 'admin' && member.role !== 'auditor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabase
    .from('verifications')
    .select('id,date,description,total,status,source,created_at,created_by,voided_at,voided_by,void_reason,attachment_path,fiscal_year,verification_no,reversed_from_id')
    .eq('company_id', companyId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    'id',
    'fiscal_year',
    'verification_no',
    'date',
    'description',
    'total',
    'status',
    'source',
    'created_at',
    'created_by',
    'voided_at',
    'voided_by',
    'void_reason',
    'attachment_path',
    'reversed_from_id'
  ];

  const lines = [headers.join(',')];
  for (const row of data ?? []) {
    lines.push(headers.map((key) => escapeCsv((row as Record<string, unknown>)[key])).join(','));
  }

  const csv = `${lines.join('\n')}\n`;
  const fileName = `verifications-${companyId}-${periodStart}-${periodEnd}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
}
