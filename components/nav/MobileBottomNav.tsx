'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { BriefcaseBusiness, Building2, ScrollText, Activity, ListTodo, Settings } from 'lucide-react';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { canAccessCustomers, canAccessFinance, canAccessOrders } from '@/lib/auth/navigation';
import { cn } from '@/lib/ui/cn';
import type { Capability, Role } from '@/lib/types';

type NavItem = {
  href: Route;
  label: string;
  visible: (role: Role, capabilities: Capability[]) => boolean;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { href: '/todo' as Route, label: 'Att göra', visible: () => true, icon: ListTodo },
  { href: '/projects', label: 'Projekt', visible: () => true, icon: BriefcaseBusiness },
  { href: '/customers', label: 'Kunder', visible: (role, capabilities) => canAccessCustomers(role, capabilities), icon: Building2 },
  { href: '/orders', label: 'Ordrar', visible: (role, capabilities) => canAccessOrders(role, capabilities), icon: ScrollText },
  { href: '/finance', label: 'Ekonomi', visible: (role, capabilities) => canAccessFinance(role, capabilities), icon: Activity },
  { href: '/settings', label: 'Inställn.', visible: (role) => role === 'member', icon: Settings }
];

export default function MobileBottomNav({ role, capabilities }: { role: Role; capabilities: Capability[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = navItems.filter((item) => item.visible(role, capabilities));
  const columns = Math.min(Math.max(visibleItems.length, 1), 7);

  useEffect(() => {
    visibleItems.forEach((item) => {
      if (!pathname?.startsWith(item.href)) {
        router.prefetch(item.href);
      }
    });
  }, [pathname, router, visibleItems]);

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 px-3 pt-2 backdrop-blur">
      <div
        className="mx-auto grid max-w-xl gap-2 pb-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onTouchStart={() => router.prefetch(item.href)}
              className={cn(
                buttonVariants({ variant: isActive ? 'default' : 'secondary', size: 'sm' }),
                'h-12 min-w-0 flex-col gap-1 px-1 text-[10px]'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

