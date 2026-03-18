'use client';

import MobileBottomNav from '@/components/nav/MobileBottomNav';
import MobileHeader from '@/components/common/MobileHeader';
import OfflineBanner from '@/components/common/OfflineBanner';
import MfaReminder from '@/components/security/MfaReminder';
import type { Role } from '@/lib/types';

export default function MobileShell({
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
  return (
    <div className="min-h-screen lg:hidden">
      <MobileHeader companyName={companyName} userEmail={userEmail} />
      <OfflineBanner />
      <main className="safe-bottom px-4 pb-[7.5rem] pt-4">
        <MfaReminder />
        {children}
      </main>
      <MobileBottomNav role={role} />
    </div>
  );
}

