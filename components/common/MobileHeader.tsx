'use client';

import UserMenu from '@/components/common/UserMenu';

export default function MobileHeader({
  companyName,
  userEmail
}: {
  companyName: string;
  userEmail?: string;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border bg-card/90 px-4 pb-3 pt-2 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
        <UserMenu userEmail={userEmail} compact />
      </div>
    </header>
  );
}
