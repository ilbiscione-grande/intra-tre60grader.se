import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission } from '@/lib/auth/companyPermissions';

type SupabaseUntyped = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const auth = await requireCompanyPermission(companyId, 'finance.read');
  if (!auth.ok || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const snapshotId = context.params.id;
  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { data: snapshot, error } = await supabase
    .from('company_backup_snapshots')
    .select('id,company_id,snapshot_kind,label,period_start,period_end,retain_until,payload_checksum,payload_bytes,row_counts,payload,created_by,created_at,restore_tested_at,restore_test_result')
    .eq('company_id', companyId)
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!snapshot) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="backup-${companyId}-${snapshotId}.json"`,
      'Content-Length': String(Buffer.byteLength(body, 'utf8'))
    }
  });
}