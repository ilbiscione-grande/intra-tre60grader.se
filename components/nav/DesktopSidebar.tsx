'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, Receipt, ScrollText, Settings, Shield, WalletCards, Landmark } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';
import type { Role } from '@/lib/types';

type NavItem = {
  href: Route;
  label: string;
  roles: Role[];
  icon: React.ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { href: '/projects', label: 'Projekt', roles: ['member', 'finance', 'admin'], icon: BriefcaseBusiness },
  { href: '/customers', label: 'Kunder', roles: ['member', 'finance', 'admin'], icon: Building2 },
  { href: '/orders', label: 'Ordrar', roles: ['member', 'finance', 'admin'], icon: ScrollText },
  { href: '/finance', label: 'Ekonomi', roles: ['finance', 'admin', 'auditor'], icon: Activity },
  { href: '/reports', label: 'Rapporter', roles: ['finance', 'admin', 'auditor'], icon: BarChart3 },
  { href: '/invoices', label: 'Fakturor', roles: ['finance', 'admin', 'auditor'], icon: Receipt },
  { href: '/receivables', label: 'Kundreskontra', roles: ['finance', 'admin', 'auditor'], icon: WalletCards },
  { href: '/payables', label: 'Leverantörsreskontra', roles: ['finance', 'admin', 'auditor'], icon: Landmark },
  { href: '/sync', label: 'Synk', roles: ['member', 'finance', 'admin'], icon: Activity },
  { href: '/settings', label: 'Inställningar', roles: ['member', 'finance', 'admin', 'auditor'], icon: Settings },
  { href: '/team', label: 'Medlemmar', roles: ['admin'], icon: Shield }
];

export default function DesktopSidebar({
  role,
  collapsed,
  onToggle
}: {
  role: Role;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'border-r border-border bg-card/80 backdrop-blur transition-all duration-200',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className={cn('flex items-center px-3 py-4', collapsed ? 'justify-center' : 'justify-between px-4')}>
        {collapsed ? <span className="text-lg font-semibold">PB</span> : <span className="text-xl font-semibold">Projectify + Bookie</span>}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1 text-foreground/70 hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? 'Expandera sidomeny' : 'Fäll ihop sidomeny'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className={cn('space-y-1 pb-4', collapsed ? 'px-2' : 'px-3')}>
        {items
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  buttonVariants({ variant: pathname?.startsWith(item.href) ? 'default' : 'ghost' }),
                  collapsed ? 'w-full justify-center px-0' : 'w-full justify-start'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', collapsed ? '' : 'mr-2')} />
                {!collapsed ? item.label : null}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}




