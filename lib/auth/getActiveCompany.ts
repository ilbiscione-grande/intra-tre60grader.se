import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext, isStaff } from '@/lib/auth/authContext';
import type { AvailableCompany, Capability, Role } from '@/lib/types';

type MembershipRow = {
  company_id: string;
  role: Role | 'employee';
};

type CompanyRow = {
  id: string;
  name: string;
};

type CapabilityRow = {
  company_id: string;
  capability: Capability;
};

type CompanyAccess = {
  companies: AvailableCompany[];
  active: AvailableCompany | null;
};

function normalizeCompanyRole(role: MembershipRow['role']): Role {
  if (role === 'employee') {
    return 'member';
  }

  return role;
}

export async function getCompanyAccess(): Promise<CompanyAccess> {
  const authContext = await getAuthContext();

  if (!isStaff(authContext)) {
    return { companies: [], active: null };
  }

  const supabase = createClient();
  const cookieStore = cookies();

  // Get all company memberships for the user
  const { data: memberships, error: membershipsError } = await supabase
    .from('company_members')
    .select('company_id,role')
    .eq('user_id', authContext.user_id)
    .order('company_id', { ascending: true })
    .returns<MembershipRow[]>();

  if (membershipsError || !memberships || memberships.length === 0) {
    return { companies: [], active: null };
  }

  const companyIds = memberships.map((m) => m.company_id);

  const { data: companiesData } = await supabase
    .from('companies')
    .select('id,name')
    .in('id', companyIds)
    .returns<CompanyRow[]>();

  const { data: capabilitiesData } = await supabase
    .from('company_member_capabilities')
    .select('company_id,capability')
    .eq('user_id', authContext.user_id)
    .in('company_id', companyIds)
    .returns<CapabilityRow[]>();

  const nameById = new Map((companiesData ?? []).map((c) => [c.id, c.name]));
  const capabilitiesByCompanyId = new Map<string, Capability[]>();

  for (const row of capabilitiesData ?? []) {
    const current = capabilitiesByCompanyId.get(row.company_id) ?? [];
    current.push(row.capability);
    capabilitiesByCompanyId.set(row.company_id, current);
  }

  const companies: AvailableCompany[] = memberships
    .filter((m) => nameById.has(m.company_id))
    .map((m) => ({
      companyId: m.company_id,
      companyName: nameById.get(m.company_id)!,
      role: normalizeCompanyRole(m.role),
      capabilities: capabilitiesByCompanyId.get(m.company_id) ?? []
    }));

  const requestedCompanyId = cookieStore.get('active_company_id')?.value ?? null;
  const activeCompanyId = requestedCompanyId || authContext.default_company_id || companies[0]?.companyId;
  const active = companies.find((c) => c.companyId === activeCompanyId) || null;

  return { companies, active };
}

export async function getUserCompanies() {
  const access = await getCompanyAccess();
  return access.companies;
}

export async function getActiveCompany() {
  const access = await getCompanyAccess();
  return access.active;
}
