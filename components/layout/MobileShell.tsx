'use client';

import { usePathname } from 'next/navigation';
import MobileBottomNav from '@/components/nav/MobileBottomNav';
import MobileHeader from '@/components/common/MobileHeader';
import OfflineBanner from '@/components/common/OfflineBanner';
import type { Role } from '@/lib/types';

function pageTitle(pathname: string | null) {
  if (!pathname) return 'Projekt';
  if (pathname.startsWith('/projects')) return 'Projekt';
  if (pathname.startsWith('/finance')) return 'Ekonomi';
  if (pathname.startsWith('/customers')) return 'Kunder';
  if (pathname.startsWith('/orders')) return 'Ordrar';
  if (pathname.startsWith('/reports')) return 'Rapporter';
  if (pathname.startsWith('/invoices')) return 'Fakturor';
  if (pathname.startsWith('/sync')) return 'Synk';
  if (pathname.startsWith('/team')) return 'Medlemmar';
  if (pathname.startsWith('/settings')) return 'Inställningar';
  return 'Projekt';
}

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
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:hidden">
      <MobileHeader title={pageTitle(pathname)} companyName={companyName} userEmail={userEmail} />
      <OfflineBanner />
      <main className="safe-bottom px-4 pb-24 pt-4">{children}</main>
      <MobileBottomNav role={role} />
    </div>
  );
}

