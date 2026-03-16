'use client';

import { useMemo } from 'react';
import { useOnlineStatus } from '@/lib/ui/useOnlineStatus';
import { useOfflineStore } from '@/features/offline/offlineStore';

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { queuedCount, conflictCount } = useOfflineStore();

  const message = useMemo(() => {
    if (!isOnline) return 'Offline: ändringar köas lokalt';
    if (conflictCount > 0) return `${conflictCount} konflikt(er) kräver manuell hantering`;
    if (queuedCount > 0) return `${queuedCount} köade ändringar synkas`;
    return null;
  }, [conflictCount, isOnline, queuedCount]);

  if (!message) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
      {message}
    </div>
  );
}