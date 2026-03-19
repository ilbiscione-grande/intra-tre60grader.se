'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import QuickCreateMenu from '@/components/common/QuickCreateMenu';
import NotificationMenu from '@/components/common/NotificationMenu';
import { useEffect, useState } from 'react';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import OfflineBanner from '@/components/common/OfflineBanner';
import MfaReminder from '@/components/security/MfaReminder';
import { useAppContext } from '@/components/providers/AppContext';
import UserMenu from '@/components/common/UserMenu';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/types';

const COLLAPSE_KEY = 'desktop_sidebar_collapsed';

export default function DesktopShell({
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
  const [collapsed, setCollapsed] = useState(false);
  const { companyId } = useAppContext();

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored === '1') {
      setCollapsed(true);
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="min-h-screen lg:flex">
      <DesktopSidebar role={role} collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-[70] border-b border-border bg-card/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Växla sidomeny">
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </Button>
              <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationMenu companyId={companyId} />
              <QuickCreateMenu role={role} />
              <UserMenu userEmail={userEmail} />
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className="flex-1 p-6">
          <MfaReminder />
          {children}
        </main>
      </div>
    </div>
  );
}


