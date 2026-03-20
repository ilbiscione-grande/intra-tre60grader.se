import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

type CompanyMemberRow = Database['public']['Tables']['company_members']['Row'];

async function requireMember(companyId: string) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401, message: 'Unauthorized' };
  }

  const { data: member, error } = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle<Pick<CompanyMemberRow, 'user_id'>>();

  if (error || !member) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return { ok: true as const, status: 200, message: 'ok' };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const auth = await requireMember(companyId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const supabase = createClient();
  const { data: members, error } = await supabase
    .from('company_members')
    .select('id,company_id,user_id,role,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .returns<Array<Pick<CompanyMemberRow, 'id' | 'company_id' | 'user_id' | 'role' | 'created_at'>>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();
  const enriched = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: userData } = await admin.auth.admin.getUserById(member.user_id);
      const email = userData.user?.email ?? null;
      const handle = email?.split('@')[0]?.toLowerCase() ?? null;

      return {
        ...member,
        email,
        handle
      };
    })
  );

  return NextResponse.json({ members: enriched });
}
