'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { FilePlus2, FolderPlus, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { canAccessCustomers } from '@/lib/auth/navigation';
import { canWriteFinance } from '@/lib/auth/capabilities';
import type { Capability, Role } from '@/lib/types';

type QuickCreateItem = {
  href: Route;
  label: string;
  visible: (role: Role, capabilities: Capability[]) => boolean;
  icon: React.ComponentType<{ className?: string }>;
};

const items: QuickCreateItem[] = [
  {
    href: '/projects?create=project',
    label: 'Nytt projekt',
    visible: () => true,
    icon: FolderPlus
  },
  {
    href: '/customers',
    label: 'Ny kund',
    visible: (role, capabilities) => canAccessCustomers(role, capabilities),
    icon: UserPlus
  },
  {
    href: '/finance/verifications/new',
    label: 'Ny verifikation',
    visible: (role, capabilities) => canWriteFinance(role, capabilities),
    icon: FilePlus2
  }
];

export default function QuickCreateMenu({
  role,
  capabilities,
  compact = false
}: {
  role: Role;
  capabilities: Capability[];
  compact?: boolean;
}) {
  const visibleItems = items.filter((item) => item.visible(role, capabilities));
  const router = useRouter();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size={compact ? 'icon' : 'sm'}
          className={compact ? 'rounded-full' : 'gap-2 rounded-full pl-3 pr-4'}
          aria-label="Lägg till"
        >
          <Plus className="h-4 w-4" />
          {!compact ? <span>Lägg till</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="z-[1000] w-[220px]"
      >
        {visibleItems.length === 0 ? (
          <div className="px-2 py-3 text-sm text-foreground/65">Inga genvägar tillgängliga.</div>
        ) : null}
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                prefetch
                onMouseEnter={() => router.prefetch(item.href)}
                onTouchStart={() => router.prefetch(item.href)}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
