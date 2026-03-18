'use client';

import { usePathname } from 'next/navigation';
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
  const pathname = usePathname();
  const isFullscreenFlow = pathname === '/finance/verifications/new';

  const mode =
    interfaceMode === 'auto'
      ? breakpointMode
      : interfaceMode === 'mobile'
        ? 'mobile'
        : 'desktop';

  if (isFullscreenFlow) {
    return (
      <>
        <AutoSync />
        <div className="min-h-screen bg-background">{children}</div>
      </>
    );
  }

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
