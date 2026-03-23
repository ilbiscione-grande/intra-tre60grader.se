import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { canViewFinance, canWriteFinance } from '@/lib/auth/capabilities';
import type { Capability, Role } from '@/lib/types';

type CompanyMemberAccessRow = {
  role: Role;
  user_id: string;
};

type CapabilityRow = {
  capability: Capability;
};

async function getActorAccess(companyId: string) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, status: 401, error: 'Unauthorized', user: null, role: null, capabilities: [] as Capability[] };
  }

  const admin = createAdminClient() as unknown as {
    from: (table: string) => any;
  };

  const { data: member, error: memberError } = await admin
    .from('company_members')
    .select('role,user_id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError || !member) {
    return { ok: false as const, status: 403, error: 'Forbidden', user: null, role: null, capabilities: [] as Capability[] };
  }

  const { data: capabilityRows } = await admin
    .from('company_member_capabilities')
    .select('capability')
    .eq('company_id', companyId)
    .eq('user_id', user.id);

  return {
    ok: true as const,
    status: 200,
    error: null,
    user,
    role: (member as CompanyMemberAccessRow).role,
    capabilities: ((capabilityRows ?? []) as CapabilityRow[]).map((row) => row.capability)
  };
}

async function ensureProjectAndVerification(admin: ReturnType<typeof createAdminClient>, companyId: string, projectId: string, verificationId?: string) {
  const projectCheck = await (admin as unknown as { from: (table: string) => any })
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', projectId)
    .maybeSingle();

  if (projectCheck.error || !projectCheck.data) {
    return { ok: false as const, status: 404, error: 'Project not found' };
  }

  if (!verificationId) {
    return { ok: true as const };
  }

  const verificationCheck = await (admin as unknown as { from: (table: string) => any })
    .from('verifications')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', verificationId)
    .maybeSingle();

  if (verificationCheck.error || !verificationCheck.data) {
    return { ok: false as const, status: 404, error: 'Verification not found' };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!companyId || !projectId) {
    return NextResponse.json({ error: 'companyId and projectId are required' }, { status: 400 });
  }

  const actor = await getActorAccess(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  if (!canViewFinance(actor.role!, actor.capabilities)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient() as unknown as {
    from: (table: string) => any;
  };
  const validated = await ensureProjectAndVerification(admin as never, companyId, projectId);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const { data, error } = await admin
    .from('project_verifications')
    .select(`
      id,
      verification_id,
      created_at,
      verifications (
        id,
        date,
        description,
        total,
        status,
        fiscal_year,
        verification_no,
        created_at,
        attachment_path
      )
    `)
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row: any) => ({
    id: row.id,
    verification_id: row.verification_id,
    linked_at: row.created_at,
    ...(Array.isArray(row.verifications) ? row.verifications[0] : row.verifications)
  }));

  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        companyId?: string;
        projectId?: string;
        verificationId?: string;
      }
    | null;

  const companyId = body?.companyId;
  const projectId = body?.projectId;
  const verificationId = body?.verificationId;

  if (!companyId || !projectId || !verificationId) {
    return NextResponse.json({ error: 'companyId, projectId and verificationId are required' }, { status: 400 });
  }

  const actor = await getActorAccess(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  if (!canWriteFinance(actor.role!, actor.capabilities)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient() as unknown as {
    from: (table: string) => any;
  };
  const validated = await ensureProjectAndVerification(admin as never, companyId, projectId, verificationId);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const { error } = await admin.from('project_verifications').upsert(
    {
      company_id: companyId,
      project_id: projectId,
      verification_id: verificationId,
      created_by: actor.user!.id
    },
    { onConflict: 'project_id,verification_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId');
  const projectId = request.nextUrl.searchParams.get('projectId');
  const verificationId = request.nextUrl.searchParams.get('verificationId');

  if (!companyId || !projectId || !verificationId) {
    return NextResponse.json({ error: 'companyId, projectId and verificationId are required' }, { status: 400 });
  }

  const actor = await getActorAccess(companyId);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  if (!canWriteFinance(actor.role!, actor.capabilities)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient() as unknown as {
    from: (table: string) => any;
  };

  const { error } = await admin
    .from('project_verifications')
    .delete()
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('verification_id', verificationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
