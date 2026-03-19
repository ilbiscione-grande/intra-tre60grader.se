'use client';

import QuickCreateMenu from '@/components/common/QuickCreateMenu';
import UserMenu from '@/components/common/UserMenu';
import type { Role } from '@/lib/types';

export default function MobileHeader({
  role,
  companyName,
  userEmail
}: {
  role: Role;
  companyName: string;
  userEmail?: string;
}) {
  return (
    <header className="safe-top sticky top-0 z-[70] border-b border-border bg-card/90 px-4 pb-3 pt-2 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
        <div className="flex items-center gap-2">
          <QuickCreateMenu role={role} compact />
          <UserMenu userEmail={userEmail} compact />
        </div>
      </div>
    </header>
  );
}
