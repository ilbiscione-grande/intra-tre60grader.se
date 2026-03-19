'use client';

import QuickCreateMenu from '@/components/common/QuickCreateMenu';
import NotificationMenu from '@/components/common/NotificationMenu';
import UserMenu from '@/components/common/UserMenu';
import { useAppContext } from '@/components/providers/AppContext';
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
  const { companyId } = useAppContext();

  return (
    <header className="safe-top sticky top-0 z-[120] border-b border-border bg-card/90 px-4 pb-3 pt-2 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
        <div className="flex items-center gap-2">
          <NotificationMenu companyId={companyId} compact />
          <QuickCreateMenu role={role} compact />
          <UserMenu userEmail={userEmail} compact />
        </div>
      </div>
    </header>
  );
}
