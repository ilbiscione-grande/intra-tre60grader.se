'use client';

import DesktopShell from '@/components/layout/DesktopShell';
import MobileShell from '@/components/layout/MobileShell';
import AutoSync from '@/components/common/AutoSync';
import { useAppPreferences } from '@/components/providers/AppPreferencesProvider';
import type { Role } from '@/lib/types';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';

export default function AppShell({
  role,
  companyName,
  userEmail,
  children
}: {
  role: Role;
  companyName: string;
  userEmail?: string;
  children: React.ReactNode;
}) {
  const breakpointMode = useBreakpointMode();
  const { interfaceMode } = useAppPreferences();

  const mode =
    interfaceMode === 'auto'
      ? breakpointMode
      : interfaceMode === 'mobile'
        ? 'mobile'
        : 'desktop';

  if (mode === 'mobile') {
    return (
      <>
        <AutoSync />
        <MobileShell role={role} companyName={companyName} userEmail={userEmail}>
          {children}
        </MobileShell>
      </>
    );
  }

  return (
    <>
      <AutoSync />
      <DesktopShell role={role} companyName={companyName} userEmail={userEmail}>
        {children}
      </DesktopShell>
    </>
  );
}
