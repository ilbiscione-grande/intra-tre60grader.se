'use client';

import { useEffect } from 'react';
import { useAppContext } from '@/components/providers/AppContext';
import { getQueueCounts, processQueue } from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import { useOnlineStatus } from '@/lib/ui/useOnlineStatus';

export default function AutoSync() {
  const { companyId } = useAppContext();
  const isOnline = useOnlineStatus();
  const setCounts = useOfflineStore((s) => s.setCounts);

  useEffect(() => {
    let active = true;

    async function tick() {
      if (isOnline) {
        await processQueue(companyId);
      }

      const counts = await getQueueCounts();
      if (active) {
        setCounts(counts);
      }
    }

    tick().catch(() => null);
    const interval = window.setInterval(() => {
      tick().catch(() => null);
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [companyId, isOnline, setCounts]);

  return null;
}