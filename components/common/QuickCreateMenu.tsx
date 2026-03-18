'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { FilePlus2, FolderPlus, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Role } from '@/lib/types';

type QuickCreateItem = {
  href: Route;
  label: string;
  roles: Role[];
  icon: React.ComponentType<{ className?: string }>;
};

const items: QuickCreateItem[] = [
  {
    href: '/projects',
    label: 'Nytt projekt',
    roles: ['member', 'finance', 'admin'],
    icon: FolderPlus
  },
  {
    href: '/customers',
    label: 'Ny kund',
    roles: ['member', 'finance', 'admin'],
    icon: UserPlus
  },
  {
    href: '/finance/verifications/new',
    label: 'Ny verifikation',
    roles: ['finance', 'admin'],
    icon: FilePlus2
  }
];

export default function QuickCreateMenu({ role, compact = false }: { role: Role; compact?: boolean }) {
  const visibleItems = items.filter((item) => item.roles.includes(role));

  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="end" className="w-[220px]">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
