'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, BriefcaseBusiness, Building2, CheckSquare2, ChevronLeft, ChevronRight, CircleHelp, ListTodo, Receipt, ScrollText, Settings, Shield, WalletCards, Landmark } from 'lucide-react';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { canAccessCustomers, canAccessFinance, canAccessOrders, canAccessReports, canAccessTeam } from '@/lib/auth/navigation';
import { cn } from '@/lib/ui/cn';
import type { Capability, Role } from '@/lib/types';

type NavItem = {
  href: Route;
  label: string;
  visible: (role: Role, capabilities: Capability[]) => boolean;
  icon: React.ComponentType<{ className?: string }>;
};

const items: NavItem[] = [
  { href: '/todo' as Route, label: 'Att göra', visible: () => true, icon: ListTodo },
  { href: '/projects', label: 'Projekt', visible: () => true, icon: BriefcaseBusiness },
  { href: '/customers', label: 'Kunder', visible: (role, capabilities) => canAccessCustomers(role, capabilities), icon: Building2 },
  { href: '/orders', label: 'Ordrar', visible: (role, capabilities) => canAccessOrders(role, capabilities), icon: ScrollText },
  { href: '/billing' as Route, label: 'Fakturering', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: CheckSquare2 },
  { href: '/finance', label: 'Ekonomi', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Activity },
  { href: '/reports', label: 'Rapporter', visible: (role, capabilities) => canAccessReports(role, capabilities), icon: BarChart3 },
  { href: '/invoices', label: 'Fakturor', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Receipt },
  { href: '/receivables', label: 'Kundreskontra', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: WalletCards },
  { href: '/payables', label: 'Leverantörsreskontra', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Landmark },
  { href: '/sync', label: 'Synk', visible: () => true, icon: Activity },
  { href: '/help' as Route, label: 'Hjälp', visible: () => true, icon: CircleHelp },
  { href: '/settings', label: 'Inställningar', visible: () => true, icon: Settings },
  { href: '/team', label: 'Medlemmar', visible: (role, capabilities) => canAccessTeam(role, capabilities), icon: Shield }
];

export default function DesktopSidebar({
  role,
  capabilities,
  collapsed,
  onToggle
}: {
  role: Role;
  capabilities: Capability[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = items.filter((item) => item.visible(role, capabilities));

  useEffect(() => {
    visibleItems.forEach((item) => {
      if (!pathname?.startsWith(item.href)) {
        router.prefetch(item.href);
      }
    });
  }, [pathname, router, visibleItems]);

  return (
    <aside
      className={cn(
        'shrink-0 border-r border-border bg-card/80 backdrop-blur transition-all duration-200',
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
        {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                title={collapsed ? item.label : undefined}
                onMouseEnter={() => router.prefetch(item.href)}
                onTouchStart={() => router.prefetch(item.href)}
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




