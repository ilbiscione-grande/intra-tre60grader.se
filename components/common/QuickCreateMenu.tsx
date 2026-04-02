'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Plus, Timer } from 'lucide-react';
import { useState } from 'react';
import ActionSheet from '@/components/common/ActionSheet';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTimeTracker } from '@/components/providers/TimeTrackerProvider';
import { useBreakpointMode } from '@/lib/ui/useBreakpointMode';
import { getDesktopQuickCreateItems, getMobileQuickActions } from '@/lib/mobile/quickActions';
import type { Capability, Role } from '@/lib/types';

export default function QuickCreateMenu({
  role,
  capabilities,
  compact = false
}: {
  role: Role;
  capabilities: Capability[];
  compact?: boolean;
}) {
  const router = useRouter();
  const { hasActiveTimer, openControlsDialog, openStartDialog } = useTimeTracker();
  const mode = useBreakpointMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopItems = getDesktopQuickCreateItems(role, capabilities);
  const mobileActions = getMobileQuickActions(role, capabilities, hasActiveTimer);

  if (mode === 'mobile') {
    return (
      <>
        <Button
          variant="default"
          size={compact ? 'icon' : 'sm'}
          className={compact ? 'rounded-full' : 'gap-2 rounded-full pl-3 pr-4'}
          aria-label="Lägg till"
          onClick={() => setMobileOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {!compact ? <span>Lägg till</span> : null}
        </Button>

        <ActionSheet
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title="Snabbåtgärder"
          description="Samma kärnåtgärder oavsett var du jobbar i mobilen."
        >
          <div className="grid grid-cols-2 gap-2">
            {mobileActions.map((item) => {
              const Icon = item.icon;
              const isTimeAction = item.id === 'time';

              if (isTimeAction) {
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-16 flex-col items-start gap-1 rounded-2xl px-3 py-3 text-left"
                    onClick={() => {
                      setMobileOpen(false);
                      if (hasActiveTimer) {
                        openControlsDialog();
                        return;
                      }
                      openStartDialog();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="whitespace-normal text-xs text-foreground/60">{item.description}</span>
                  </Button>
                );
              }

              return (
                <Button
                  key={item.id}
                  variant="outline"
                  asChild
                  className="h-auto min-h-16 flex-col items-start gap-1 rounded-2xl px-3 py-3 text-left"
                >
                  <Link href={item.href as Route} onClick={() => setMobileOpen(false)}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="whitespace-normal text-xs text-foreground/60">{item.description}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </ActionSheet>
      </>
    );
  }

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
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            openStartDialog();
          }}
          >
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            <span>Ny tidrapportering</span>
          </div>
        </DropdownMenuItem>
        {desktopItems.length === 0 ? (
          <div className="px-2 py-3 text-sm text-foreground/65">Inga genvägar tillgängliga.</div>
        ) : null}
        {desktopItems.map((item) => {
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
