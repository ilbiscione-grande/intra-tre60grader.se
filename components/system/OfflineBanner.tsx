'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';
import { type OfflineState, offlineStateConfig } from '@/components/system/tokens';

type OfflineBannerProps = {
  state: OfflineState;
  queuedCount?: number;
  conflictCount?: number;
  onViewConflict?: () => void;
};

export function OfflineBanner({ state, queuedCount = 0, conflictCount = 0, onViewConflict }: OfflineBannerProps) {
  const config = offlineStateConfig[state];

  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', config.className)} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {state === 'offline' ? <WifiOff className="h-4 w-4" /> : null}
          {state === 'syncing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
          {state === 'conflict' ? <AlertTriangle className="h-4 w-4" /> : null}
          <span>{config.message}</span>
        </div>
        <div className="flex items-center gap-2">
          {queuedCount > 0 ? <Badge className="bg-black/10 text-current">Kö {queuedCount}</Badge> : null}
          {conflictCount > 0 ? <Badge className="bg-black/10 text-current">Konflikter {conflictCount}</Badge> : null}
          {state === 'conflict' ? (
            <Button variant="secondary" size="sm" onClick={onViewConflict} className="min-h-touch">
              Visa
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
