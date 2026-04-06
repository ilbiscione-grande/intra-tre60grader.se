'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/ui/cn';

const tabs = [
  { href: '/settings?tab=general', label: 'Allmänt', activeKey: 'general' },
  { href: '/settings?tab=profile', label: 'Profil', activeKey: 'profile' },
  { href: '/settings?tab=company', label: 'Bolag', activeKey: 'company' },
  { href: '/settings?tab=finance', label: 'Ekonomi', activeKey: 'finance' },
  { href: '/settings?tab=automation', label: 'Automation', activeKey: 'automation' },
  { href: '/settings?tab=security', label: 'Säkerhet', activeKey: 'security' }
] as const;

export default function SettingsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = pathname === '/settings/security' ? 'security' : searchParams.get('tab') ?? 'general';

  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.activeKey;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground/75 hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
