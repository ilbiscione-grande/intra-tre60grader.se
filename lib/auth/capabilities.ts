import type { Capability, Role } from '@/lib/types';

const LEGACY_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  member: [],
  finance: ['finance', 'reporting'],
  admin: ['finance', 'project_lead', 'reporting', 'team_admin'],
  auditor: ['reporting']
};

export function getEffectiveCapabilities(role: Role, capabilities: Capability[] | null | undefined) {
  return Array.from(new Set([...(capabilities ?? []), ...LEGACY_ROLE_CAPABILITIES[role]]));
}

export function hasCapability(capabilities: Capability[] | null | undefined, capability: Capability) {
  return (capabilities ?? []).includes(capability);
}

export function hasEffectiveCapability(role: Role, capabilities: Capability[] | null | undefined, capability: Capability) {
  return getEffectiveCapabilities(role, capabilities).includes(capability);
}

export function hasAnyEffectiveCapability(role: Role, capabilities: Capability[] | null | undefined, required: Capability[]) {
  return required.some((capability) => hasEffectiveCapability(role, capabilities, capability));
}

export function canViewFinance(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || role === 'auditor' || hasEffectiveCapability(role, capabilities, 'finance');
}

export function canWriteFinance(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || hasEffectiveCapability(role, capabilities, 'finance');
}

export function canViewProjectSummary(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || hasAnyEffectiveCapability(role, capabilities, ['finance', 'project_lead']);
}

export function canManageTeam(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || hasEffectiveCapability(role, capabilities, 'team_admin');
}

export function canViewReporting(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || role === 'auditor' || hasAnyEffectiveCapability(role, capabilities, ['finance', 'reporting']);
}
