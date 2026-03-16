'use client';

import CompanySwitcher from '@/components/common/CompanySwitcher';
import UserMenu from '@/components/common/UserMenu';

export default function MobileHeader({
  title,
  companyName,
  userEmail
}: {
  title: string;
  companyName: string;
  userEmail?: string;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border bg-card/90 px-4 pb-3 pt-2 backdrop-blur">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <UserMenu userEmail={userEmail} />
        </div>
        <CompanySwitcher compact />
      </div>
    </header>
  );
}