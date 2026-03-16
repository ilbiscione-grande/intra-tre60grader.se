import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type CompanyRow = {
  name: string | null;
  org_no: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  billing_email: string | null;
};

type VerificationRow = {
  id: string;
  date: string;
  description: string;
  fiscal_year: number | null;
  verification_no: number | null;
  status: string;
};

type VerificationLineRow = {
  verification_id: string;
  account_no: string;
  debit: number;
  credit: number;
};

type CoaRow = {
  account_no: string;
  name: string;
};

type LedgerBalanceRow = {
  account_no: string;
  balance: number;
};

type SieValidationSeverity = 'error' | 'warning';

type SieValidationIssue = {
  severity: SieValidationSeverity;
  code:
    | 'INVALID_PERIOD'
    | 'COMPANY_NOT_FOUND'
    | 'ORG_NO_MISSING'
    | 'NO_VERIFICATION_LINES'
    | 'MISSING_VERIFICATION_NO'
    | 'INVALID_ACCOUNT_NO'
    | 'INVALID_LINE_AMOUNT'
    | 'UNBALANCED_VERIFICATION'
    | 'DUPLICATE_VERIFICATION_NO';
  message: string;
  verification_id?: string;
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function escapeText(value: string | null | undefined) {
  return (value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .trim();
}

function toSieDate(value: string) {
  return value.replace(/-/g, '');
}

function isIsoDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function accountNoIsValid(accountNo: string) {
  return /^\d{3,10}$/.test(accountNo);
}

function getUnknownMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('company_id');
  const periodStart = searchParams.get('period_start');
  const periodEnd = searchParams.get('period_end');
  const status = searchParams.get('status');
  const strict = searchParams.get('strict') !== '0';
  const validateOnly = searchParams.get('validate_only') === '1';

  if (!companyId || !isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) {
    return NextResponse.json({ error: 'Ogiltig period. Ange period_start och period_end i format YYYY-MM-DD.' }, { status: 400 });
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

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('name,org_no,address_line1,address_line2,postal_code,city,country,phone,billing_email')
    .eq('id', companyId)
    .maybeSingle<CompanyRow>();

  if (companyError) return NextResponse.json({ error: companyError.message }, { status: 500 });

  const validationIssues: SieValidationIssue[] = [];

  if (!company) {
    validationIssues.push({
      severity: 'error',
      code: 'COMPANY_NOT_FOUND',
      message: 'Bolaget hittades inte för vald export.'
    });
  }

  if (!company?.org_no) {
    validationIssues.push({
      severity: 'error',
      code: 'ORG_NO_MISSING',
      message: 'Bolagets organisationsnummer saknas. Fyll i det under Inställningar innan SIE-export.'
    });
  }

  let verificationQuery = supabase
    .from('verifications')
    .select('id,date,description,fiscal_year,verification_no,status')
    .eq('company_id', companyId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: true })
    .order('verification_no', { ascending: true });

  verificationQuery = !status || status === 'all' ? verificationQuery.eq('status', 'booked') : verificationQuery.eq('status', status);

  const { data: verifications, error: verificationsError } = await verificationQuery.returns<VerificationRow[]>();
  if (verificationsError) return NextResponse.json({ error: verificationsError.message }, { status: 500 });

  const verificationIds = (verifications ?? []).map((row) => row.id);
  const { data: lines, error: linesError } = verificationIds.length
    ? await supabase
        .from('verification_lines')
        .select('verification_id,account_no,debit,credit')
        .in('verification_id', verificationIds)
        .order('verification_id', { ascending: true })
        .returns<VerificationLineRow[]>()
    : { data: [], error: null };

  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });

  const supabaseUntyped = supabase as unknown as {
    from: (relation: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, opts: { ascending: boolean }) => Promise<{ data: CoaRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data: coaRows, error: coaError } = await supabaseUntyped
    .from('chart_of_accounts')
    .select('account_no,name')
    .eq('company_id', companyId)
    .order('account_no', { ascending: true });

  if (coaError) return NextResponse.json({ error: coaError.message }, { status: 500 });

  const dayBeforeStart = new Date(`${periodStart}T00:00:00Z`);
  dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);
  const openingAsOf = dayBeforeStart.toISOString().slice(0, 10);

  const { data: openingRows, error: openingError } = await supabase.rpc('trial_balance_report', {
    p_company_id: companyId,
    p_as_of: openingAsOf
  });
  if (openingError) return NextResponse.json({ error: openingError.message }, { status: 500 });

  const { data: closingRows, error: closingError } = await supabase.rpc('trial_balance_report', {
    p_company_id: companyId,
    p_as_of: periodEnd
  });
  if (closingError) return NextResponse.json({ error: closingError.message }, { status: 500 });

  const opening = Array.isArray(openingRows) ? (openingRows as unknown as LedgerBalanceRow[]) : [];
  const closing = Array.isArray(closingRows) ? (closingRows as unknown as LedgerBalanceRow[]) : [];

  const linesByVerification = new Map<string, VerificationLineRow[]>();
  const accountSet = new Set<string>();

  for (const line of lines ?? []) {
    const current = linesByVerification.get(line.verification_id) ?? [];
    current.push(line);
    linesByVerification.set(line.verification_id, current);
    accountSet.add(line.account_no);
  }

  for (const coa of coaRows ?? []) accountSet.add(coa.account_no);

  const usedVoucherKeys = new Set<string>();

  for (const verification of verifications ?? []) {
    if (!verification.verification_no || !verification.fiscal_year) {
      validationIssues.push({
        severity: 'error',
        code: 'MISSING_VERIFICATION_NO',
        message: 'Verifikation saknar räkenskapsår eller verifikationsnummer.',
        verification_id: verification.id
      });
    }

    const verLines = linesByVerification.get(verification.id) ?? [];
    if (verLines.length === 0) {
      validationIssues.push({
        severity: 'error',
        code: 'NO_VERIFICATION_LINES',
        message: 'Verifikation saknar verifikationsrader.',
        verification_id: verification.id
      });
      continue;
    }

    if (verification.verification_no && verification.fiscal_year) {
      const key = `${verification.fiscal_year}:${verification.verification_no}`;
      if (usedVoucherKeys.has(key)) {
        validationIssues.push({
          severity: 'error',
          code: 'DUPLICATE_VERIFICATION_NO',
          message: `Dubblett av verifikationsnummer upptäckt (${key}).`,
          verification_id: verification.id
        });
      }
      usedVoucherKeys.add(key);
    }

    let sum = 0;
    for (const line of verLines) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);

      if (!accountNoIsValid(line.account_no)) {
        validationIssues.push({
          severity: 'error',
          code: 'INVALID_ACCOUNT_NO',
          message: `Ogiltigt kontonummer: ${line.account_no}`,
          verification_id: verification.id
        });
      }

      if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        validationIssues.push({
          severity: 'error',
          code: 'INVALID_LINE_AMOUNT',
          message: 'Varje rad ska ha antingen debet eller kredit med positivt belopp.',
          verification_id: verification.id
        });
      }

      sum += debit - credit;
    }

    if (Math.abs(sum) > 0.005) {
      validationIssues.push({
        severity: 'error',
        code: 'UNBALANCED_VERIFICATION',
        message: `Verifikationen balanserar inte (diff ${money(sum)}).`,
        verification_id: verification.id
      });
    }
  }

  const errorCount = validationIssues.filter((issue) => issue.severity === 'error').length;

  if (validateOnly || (strict && errorCount > 0)) {
    return NextResponse.json(
      {
        ok: errorCount === 0,
        strict,
        validate_only: validateOnly,
        company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        verifications: (verifications ?? []).length,
        issues: validationIssues
      },
      { status: errorCount === 0 ? 200 : 422 }
    );
  }

  const now = new Date();
  const generatedDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const companyName = escapeText(company?.name ?? 'Okant foretag');
  const orgNo = escapeText(company?.org_no ?? '');
  const contact = escapeText(company?.billing_email ?? '');
  const addressLine1 = escapeText(company?.address_line1 ?? '');
  const addressLine2 = escapeText(company?.address_line2 ?? '');
  const postalCity = escapeText([company?.postal_code, company?.city].filter(Boolean).join(' '));
  const country = escapeText(company?.country ?? 'SE');
  const phone = escapeText(company?.phone ?? '');

  const coaNameByNo = new Map((coaRows ?? []).map((row) => [row.account_no, row.name]));
  const content: string[] = [];

  content.push('#FLAGGA 0');
  content.push('#FORMAT PC8');
  content.push('#SIETYP 4');
  content.push('#PROGRAM "ProjectifyBookie" "2.1"');
  content.push(`#GEN ${generatedDate}`);
  content.push(`#FNAMN "${companyName}"`);
  content.push(`#ORGNR ${orgNo}`);
  content.push('#VALUTA SEK');
  content.push('#KPTYP BAS2015');
  content.push(`#ADRESS "${contact}" "${escapeText(`${addressLine1} ${addressLine2}`)}" "${postalCity}" "${phone}"`);
  content.push(`#LAND "${country}"`);
  content.push(`#RAR 0 ${toSieDate(periodStart)} ${toSieDate(periodEnd)}`);

  for (const accountNo of [...accountSet].sort((a, b) => a.localeCompare(b, 'sv'))) {
    content.push(`#KONTO ${accountNo} "${escapeText(coaNameByNo.get(accountNo) ?? '')}"`);
  }

  for (const row of opening) {
    const acc = String((row as unknown as Record<string, unknown>).account_no ?? '');
    const balance = Number((row as unknown as Record<string, unknown>).balance ?? 0);
    if (!acc || Math.abs(balance) < 0.0001) continue;
    content.push(`#IB 0 ${acc} ${money(balance)}`);
  }

  for (const verification of verifications ?? []) {
    const series = 'A';
    const no = verification.verification_no as number;
    const label = escapeText(verification.description ?? '');
    const date = toSieDate(verification.date);

    content.push(`#VER ${series} ${no} ${date} "${label}" ${generatedDate}`);
    content.push('{');

    for (const line of linesByVerification.get(verification.id) ?? []) {
      const amount = Number(line.debit ?? 0) > 0 ? Number(line.debit ?? 0) : -Number(line.credit ?? 0);
      content.push(`#TRANS ${line.account_no} {} ${money(amount)} ${date} ""`);
    }

    content.push('}');
  }

  for (const row of closing) {
    const acc = String((row as unknown as Record<string, unknown>).account_no ?? '');
    const balance = Number((row as unknown as Record<string, unknown>).balance ?? 0);
    if (!acc || Math.abs(balance) < 0.0001) continue;
    content.push(`#UB 0 ${acc} ${money(balance)}`);
  }

  const body = `${content.join('\r\n')}\r\n`;
  const fileName = `sie4-${companyId}-${periodStart}-${periodEnd}.se`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
}
