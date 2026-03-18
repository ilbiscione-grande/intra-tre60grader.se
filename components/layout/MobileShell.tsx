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
      <MobileHeader role={role} companyName={companyName} userEmail={userEmail} />
      <OfflineBanner />
      <main className="px-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] pt-4">
        <MfaReminder />
        {children}
      </main>
      <MobileBottomNav role={role} />
    </div>
  );
}

