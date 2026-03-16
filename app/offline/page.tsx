'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getQueueCounts } from '@/features/offline/syncQueue';

export default function OfflinePage() {
  const [counts, setCounts] = useState({ queuedCount: 0, conflictCount: 0, failedCount: 0 });

  useEffect(() => {
    getQueueCounts().then(setCounts).catch(() => null);
  }, []);

  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle>Offline</CardTitle>
          <p className="text-sm">Du är offline. Cachat innehåll visas när möjligt.</p>
        </CardHeader>
        <CardContent>
                    <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <p>Köade ändringar: <strong>{counts.queuedCount}</strong></p>
            <p>Konflikter: <strong>{counts.conflictCount}</strong></p>
            <p>Misslyckade: <strong>{counts.failedCount}</strong></p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
