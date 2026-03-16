'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import DesktopSidebar from '@/components/nav/DesktopSidebar';
import CompanySwitcher from '@/components/common/CompanySwitcher';
import OfflineBanner from '@/components/common/OfflineBanner';
import UserMenu from '@/components/common/UserMenu';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/types';

function pageTitle(pathname: string | null) {
  if (!pathname) return 'Projectify + Bookie';
  if (pathname.startsWith('/projects')) return 'Projekt';
  if (pathname.startsWith('/finance')) return 'Ekonomi';
  if (pathname.startsWith('/customers')) return 'Kunder';
  if (pathname.startsWith('/orders')) return 'Ordrar';
  if (pathname.startsWith('/reports')) return 'Rapporter';
  if (pathname.startsWith('/invoices')) return 'Fakturor';
  if (pathname.startsWith('/sync')) return 'Synkcenter';
  if (pathname.startsWith('/team')) return 'Medlemmar';
  if (pathname.startsWith('/settings')) return 'Inställningar';
  return 'Projectify + Bookie';
}

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
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
        <header className="border-b border-border bg-card/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Växla sidomeny">
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </Button>
              <div>
                <p className="text-xs uppercase tracking-wide text-foreground/70">{companyName}</p>
                <h1 className="text-xl font-semibold">{pageTitle(pathname)}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CompanySwitcher />
              <UserMenu userEmail={userEmail} />
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}


