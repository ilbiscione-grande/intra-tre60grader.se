import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission } from '@/lib/auth/companyPermissions';

type SupabaseUntyped = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 25), 1), 100);

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireCompanyPermission(companyId, 'finance.governance');
  if (!auth.ok || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { data, error } = await supabase.rpc('security_events_report', {
    p_company_id: companyId,
    p_limit: limit
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: Array.isArray(data) ? data : [] });
}
