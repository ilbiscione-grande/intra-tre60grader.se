'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { BriefcaseBusiness, Building2, CircleHelp, Clock3, House, Landmark, ListTodo, Receipt, ScrollText, Settings, Shield, WalletCards, BarChart3, Menu, Activity, CheckSquare2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ActionSheet from '@/components/common/ActionSheet';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { canAccessCustomers, canAccessFinance, canAccessOrders, canAccessReports, canAccessTeam } from '@/lib/auth/navigation';
import { cn } from '@/lib/ui/cn';
import type { Capability, Role } from '@/lib/types';

type MenuItem = {
  href: Route;
  label: string;
  visible: (role: Role, capabilities: Capability[]) => boolean;
  icon: React.ComponentType<{ className?: string }>;
  group: 'arbete' | 'relationer' | 'ekonomi' | 'ovrigt';
};

const menuItems: MenuItem[] = [
  { href: '/todo' as Route, label: 'Att göra', visible: () => true, icon: ListTodo, group: 'arbete' },
  { href: '/projects', label: 'Projekt', visible: () => true, icon: BriefcaseBusiness, group: 'arbete' },
  { href: '/sync', label: 'Synk', visible: () => true, icon: Activity, group: 'arbete' },
  { href: '/customers', label: 'Kunder', visible: (role, capabilities) => canAccessCustomers(role, capabilities), icon: Building2, group: 'relationer' },
  { href: '/orders', label: 'Ordrar', visible: (role, capabilities) => canAccessOrders(role, capabilities), icon: ScrollText, group: 'relationer' },
  { href: '/team', label: 'Medlemmar', visible: (role, capabilities) => canAccessTeam(role, capabilities), icon: Shield, group: 'relationer' },
  { href: '/finance', label: 'Ekonomi', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Activity, group: 'ekonomi' },
  { href: '/invoices', label: 'Fakturor', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Receipt, group: 'ekonomi' },
  { href: '/receivables', label: 'Kundreskontra', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: WalletCards, group: 'ekonomi' },
  { href: '/payables', label: 'Leverantörsreskontra', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Landmark, group: 'ekonomi' },
  { href: '/reports', label: 'Rapporter', visible: (role, capabilities) => canAccessReports(role, capabilities), icon: BarChart3, group: 'ekonomi' },
  { href: '/help' as Route, label: 'Hjälp', visible: () => true, icon: CircleHelp, group: 'ovrigt' },
  { href: '/settings', label: 'Inställningar', visible: () => true, icon: Settings, group: 'ovrigt' }
];

export default function MobileBottomNav({ role, capabilities }: { role: Role; capabilities: Capability[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleMenuItems = menuItems.filter((item) => item.visible(role, capabilities));
  const groupedMenuItems = useMemo(
    () => ({
      arbete: visibleMenuItems.filter((item) => item.group === 'arbete'),
      relationer: visibleMenuItems.filter((item) => item.group === 'relationer'),
      ekonomi: visibleMenuItems.filter((item) => item.group === 'ekonomi'),
      ovrigt: visibleMenuItems.filter((item) => item.group === 'ovrigt')
    }),
    [visibleMenuItems]
  );

  useEffect(() => {
    visibleMenuItems.forEach((item) => {
      if (!pathname?.startsWith(item.href)) {
        router.prefetch(item.href);
      }
    });
  }, [pathname, router, visibleMenuItems]);

  return (
    <>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-3 pt-2 backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-2 pb-1">
          <Link
            href={'/todo' as Route}
            prefetch
            onTouchStart={() => router.prefetch('/todo' as Route)}
            className={cn(
              buttonVariants({ variant: pathname?.startsWith('/todo') ? 'default' : 'secondary', size: 'sm' }),
              'h-12 min-w-0 flex-col gap-1 px-1 text-[10px]'
            )}
          >
            <House className="h-4 w-4" />
            <span className="leading-none">Hem</span>
          </Link>

          <Link
            href={'/projects' as Route}
            prefetch
            onTouchStart={() => router.prefetch('/projects')}
            className={cn(
              buttonVariants({ variant: pathname?.startsWith('/projects') ? 'default' : 'secondary', size: 'sm' }),
              'h-12 min-w-0 flex-col gap-1 px-1 text-[10px]'
            )}
          >
            <BriefcaseBusiness className="h-4 w-4" />
            <span className="leading-none">Projekt</span>
          </Link>

          <button
            type="button"
            onClick={() => (hasActiveTimer ? openControlsDialog() : openStartDialog())}
            className={cn(
              buttonVariants({ variant: hasActiveTimer ? 'default' : 'secondary', size: 'sm' }),
              'relative h-12 min-w-0 flex-col gap-1 px-1 text-[10px]'
            )}
          >
            <Clock3 className="h-4 w-4" />
            <span className="leading-none">Tid</span>
            {hasActiveTimer ? <span className="absolute right-3 top-2.5 h-2 w-2 rounded-full bg-emerald-400" /> : null}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(
              buttonVariants({ variant: menuOpen ? 'default' : 'secondary', size: 'sm' }),
              'h-12 min-w-0 flex-col gap-1 px-1 text-[10px]'
            )}
          >
            <Menu className="h-4 w-4" />
            <span className="leading-none">Meny</span>
          </button>
        </div>
      </nav>

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Meny" description="Full åtkomst till appens alla avdelningar.">
        <div className="space-y-4">
          <MenuSection
            title="Arbete"
            items={groupedMenuItems.arbete}
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
          />
          <MenuSection
            title="Relationer"
            items={groupedMenuItems.relationer}
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
          />
          <MenuSection
            title="Ekonomi"
            items={groupedMenuItems.ekonomi}
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
          />
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">Snabbt</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start rounded-2xl"
                onClick={() => {
                  setMenuOpen(false);
                  if (hasActiveTimer) {
                    openControlsDialog();
                    return;
                  }
                  openStartDialog();
                }}
              >
                <Clock3 className="mr-2 h-4 w-4" />
                Tid
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-start rounded-2xl"
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/todo' as Route);
                }}
              >
                <CheckSquare2 className="mr-2 h-4 w-4" />
                Att göra
              </Button>
            </div>
          </div>
          <MenuSection
            title="Övrigt"
            items={groupedMenuItems.ovrigt}
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
          />
        </div>
      </ActionSheet>
    </>
  );
}

function MenuSection({
  title,
  items,
  pathname,
  onNavigate
}: {
  title: string;
  items: MenuItem[];
  pathname: string | null;
  onNavigate: () => void;
}) {
  const router = useRouter();

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);

          return (
            <Link
              key={`${title}-${item.href}`}
              href={item.href}
              prefetch
              onClick={onNavigate}
              onTouchStart={() => router.prefetch(item.href)}
              className={cn(
                buttonVariants({ variant: active ? 'default' : 'outline', size: 'sm' }),
                'h-11 justify-start rounded-2xl px-3 text-sm'
              )}
            >
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

