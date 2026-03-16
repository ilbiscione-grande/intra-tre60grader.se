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
        order: (column: string, options: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function parseDate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const auth = await requireCompanyPermission(companyId, 'finance.read');
  if (!auth.ok || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = auth.supabase as unknown as SupabaseUntyped;

  const { data: snapshots, error: snapshotError } = await supabase
    .from('company_backup_snapshots')
    .select('id,snapshot_kind,label,period_start,period_end,retain_until,payload_checksum,payload_bytes,row_counts,created_by,created_at,restore_tested_at,restore_test_result')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  const { data: policy, error: policyError } = await supabase
    .from('company_retention_policies')
    .select('company_id,retention_years,legal_hold,updated_at,created_at')
    .eq('company_id', companyId)
    .maybeSingle();

  if (policyError) return NextResponse.json({ error: policyError.message }, { status: 500 });

  return NextResponse.json({ snapshots: snapshots ?? [], policy: policy ?? null });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        label?: string;
        periodStart?: string | null;
        periodEnd?: string | null;
      }
    | null;

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
        needs_mfa: stepUp.needsMfa
      }
    });

    return NextResponse.json({ error: stepUp.error }, { status: stepUp.status });
  }

  const periodStart = parseDate(body?.periodStart ?? null);
  const periodEnd = parseDate(body?.periodEnd ?? null);

  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { data, error } = await supabase.rpc('create_company_backup_snapshot', {
    p_company_id: companyId,
    p_label: body?.label?.trim() || null,
    p_period_start: periodStart,
    p_period_end: periodEnd
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result = Array.isArray(data) ? data[0] ?? null : data ?? null;

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.backups',
    eventType: 'backup.snapshot.created',
    severity: 'info',
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      snapshot_id: (result as Record<string, unknown> | null)?.snapshot_id ?? null,
      period_start: periodStart,
      period_end: periodEnd
    }
  });

  return NextResponse.json({ result });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        retentionYears?: number;
        legalHold?: boolean;
      }
    | null;

  const companyId = body?.companyId;
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  const auth = await requireCompanyPermission(companyId, 'finance.governance');
  if (!auth.ok || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const retentionYears = Number(body?.retentionYears ?? 7);
  const legalHold = Boolean(body?.legalHold ?? false);

  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { data, error } = await supabase.rpc('set_company_retention_policy', {
    p_company_id: companyId,
    p_retention_years: retentionYears,
    p_legal_hold: legalHold
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data ?? null });
}
