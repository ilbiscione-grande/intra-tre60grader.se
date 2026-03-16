import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function fileSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
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
  const afterEventNoRaw = searchParams.get('after_event_no');
  const limitRaw = searchParams.get('limit');

  if (!companyId) {
    return NextResponse.json({ error: 'company_id krävs' }, { status: 400 });
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

  const afterEventNo = afterEventNoRaw ? Number(afterEventNoRaw) : null;
  const limit = limitRaw ? Number(limitRaw) : 5000;

  if (afterEventNo != null && (!Number.isFinite(afterEventNo) || afterEventNo < 0)) {
    return NextResponse.json({ error: 'after_event_no måste vara >= 0' }, { status: 400 });
  }

  if (!Number.isFinite(limit) || limit < 1 || limit > 50000) {
    return NextResponse.json({ error: 'limit måste vara 1..50000' }, { status: 400 });
  }

  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('finance_audit_chain_export', {
    p_company_id: companyId,
    p_after_event_no: afterEventNo,
    p_limit: limit
  });

  if (error) {
    return NextResponse.json({ error: error.message ?? 'Kunde inte exportera revisionskedja' }, { status: 500 });
  }

  const payload = JSON.stringify(data ?? {}, null, 2);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `finance-audit-chain-${fileSafe(companyId)}-${today}.json`;

  return new NextResponse(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
}
