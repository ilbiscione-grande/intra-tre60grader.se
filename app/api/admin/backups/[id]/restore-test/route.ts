import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission, requireElevatedAdminSession } from '@/lib/auth/companyPermissions';
import { getRequestIp, safeLogSecurityEvent } from '@/lib/security/server';

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
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const companyId = body?.companyId;

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const auth = await requireCompanyPermission(companyId, 'finance.governance');
  if (!auth.ok || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stepUp = await requireElevatedAdminSession();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.backups',
      eventType: 'backup.step_up_blocked',
      severity: 'warning',
      ip: getRequestIp(request),
      userAgent: request.headers.get('user-agent'),
      payload: {
        reason: stepUp.error,
        last_sign_in_at: stepUp.lastSignInAt,
        snapshot_id: context.params.id,
        needs_mfa: stepUp.needsMfa
      }
    });

    return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });
  }

  const snapshotId = context.params.id;
  const supabase = auth.supabase as unknown as SupabaseUntyped;

  const { data: checkSnapshot, error: checkError } = await supabase
    .from('company_backup_snapshots')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', snapshotId)
    .maybeSingle();

  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 500 });
  if (!checkSnapshot) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase.rpc('run_company_backup_restore_test', {
    p_snapshot_id: snapshotId
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.backups',
    eventType: 'backup.restore_test.ran',
    severity: 'info',
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      snapshot_id: snapshotId,
      ok: (data as Record<string, unknown> | null)?.ok ?? null
    }
  });

  return NextResponse.json({ result: data ?? null });
}
