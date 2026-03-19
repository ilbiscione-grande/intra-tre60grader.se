'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { BriefcaseBusiness, Building2, ScrollText, Activity, Landmark } from 'lucide-react';
import { useEffect } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';
import type { Role } from '@/lib/types';

type NavItem = {
  href: Route;
  label: string;
  roles: Role[];
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { href: '/projects', label: 'Projekt', roles: ['member', 'finance', 'admin'], icon: BriefcaseBusiness },
  { href: '/customers', label: 'Kunder', roles: ['member', 'finance', 'admin'], icon: Building2 },
  { href: '/orders', label: 'Ordrar', roles: ['member', 'finance', 'admin'], icon: ScrollText },
  { href: '/finance', label: 'Ekonomi', roles: ['finance', 'admin', 'auditor'], icon: Activity },
  { href: '/payables', label: 'Lev.resk', roles: ['finance', 'admin', 'auditor'], icon: Landmark }
];

export default function MobileBottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = navItems.filter((item) => item.roles.includes(role));
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

