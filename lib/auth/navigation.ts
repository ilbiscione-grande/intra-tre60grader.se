import type { Capability, Role } from '@/lib/types';
import { canManageTeam, canViewFinance, canViewProjectSummary, canViewReporting } from '@/lib/auth/capabilities';

export function canAccessOrders(role: Role, capabilities: Capability[] | null | undefined) {
  return canViewFinance(role, capabilities);
}

export function canAccessCustomers(role: Role, capabilities: Capability[] | null | undefined) {
  return role === 'admin' || role === 'finance' || canViewFinance(role, capabilities) || canViewProjectSummary(role, capabilities);
}

export function canAccessFinance(role: Role, capabilities: Capability[] | null | undefined) {
  return canViewFinance(role, capabilities);
}

export function canAccessReports(role: Role, capabilities: Capability[] | null | undefined) {
  return canViewReporting(role, capabilities);
}

export function canAccessTeam(role: Role, capabilities: Capability[] | null | undefined) {
  return canManageTeam(role, capabilities);
}

export function shouldShowDesktopSidebar(role: Role, capabilities: Capability[] | null | undefined) {
  if (role === 'admin' || role === 'finance' || role === 'auditor') return true;
  return canAccessCustomers(role, capabilities)
    || canAccessOrders(role, capabilities)
    || canAccessFinance(role, capabilities)
    || canAccessReports(role, capabilities)
    || canAccessTeam(role, capabilities);
}
