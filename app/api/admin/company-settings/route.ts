import { NextResponse, type NextRequest } from 'next/server';
import { requireCompanyPermission, requireElevatedAdminSession } from '@/lib/auth/companyPermissions';
import { getRequestIp, safeLogSecurityEvent } from '@/lib/security/server';

type CompanySettingsBody = {
  companyId?: string;
  name?: string;
  org_no?: string | null;
  vat_no?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  bankgiro?: string | null;
  plusgiro?: string | null;
  iban?: string | null;
  bic?: string | null;
  invoice_prefix?: string | null;
  invoice_priority_threshold?: number;
  default_payment_terms_days?: number;
  late_payment_interest_rate?: number | null;
  invoice_terms_note?: string | null;
};

type SupabaseUntyped = {
  from: (table: 'companies') => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function nullIfEmpty(value: string | null | undefined) {
  const clean = (value ?? '').trim();
  return clean.length === 0 ? null : clean;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CompanySettingsBody | null;
  const companyId = body?.companyId;
  const name = (body?.name ?? '').trim();

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: 'Företagsnamn krävs' }, { status: 400 });
  }

  const auth = await requireCompanyPermission(companyId, 'finance.governance');
  if (!auth.ok || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stepUp = await requireElevatedAdminSession();
  if (!stepUp.ok) {
    await safeLogSecurityEvent({
      companyId,
      userId: auth.userId,
      scope: 'admin.company_settings',
      eventType: 'company_settings.step_up_blocked',
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

  const payload = {
    name,
    org_no: nullIfEmpty(body?.org_no),
    vat_no: nullIfEmpty(body?.vat_no),
    billing_email: nullIfEmpty(body?.billing_email),
    phone: nullIfEmpty(body?.phone),
    address_line1: nullIfEmpty(body?.address_line1),
    address_line2: nullIfEmpty(body?.address_line2),
    postal_code: nullIfEmpty(body?.postal_code),
    city: nullIfEmpty(body?.city),
    country: nullIfEmpty(body?.country),
    bankgiro: nullIfEmpty(body?.bankgiro),
    plusgiro: nullIfEmpty(body?.plusgiro),
    iban: nullIfEmpty(body?.iban),
    bic: nullIfEmpty(body?.bic),
    invoice_prefix: nullIfEmpty(body?.invoice_prefix),
    invoice_priority_threshold: Math.max(0, Number(body?.invoice_priority_threshold ?? 10000)),
    default_payment_terms_days: Math.max(0, Math.min(365, Math.round(Number(body?.default_payment_terms_days ?? 30)))),
    late_payment_interest_rate: body?.late_payment_interest_rate == null || Number.isNaN(Number(body.late_payment_interest_rate))
      ? null
      : Number(body.late_payment_interest_rate),
    invoice_terms_note: nullIfEmpty(body?.invoice_terms_note)
  };

  const supabase = auth.supabase as unknown as SupabaseUntyped;
  const { error } = await supabase.from('companies').update(payload).eq('id', companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await safeLogSecurityEvent({
    companyId,
    userId: auth.userId,
    scope: 'admin.company_settings',
    eventType: 'company_settings.updated',
    severity: 'info',
    ip: getRequestIp(request),
    userAgent: request.headers.get('user-agent'),
    payload: {
      updated_fields: Object.keys(payload)
    }
  });

  return NextResponse.json({ ok: true });
}
