'use client';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { openDB } from 'idb';
import { useState } from 'react';

const queryPersister = {
  persistClient: async (client: unknown) => {
    const db = await openDB('projectify-bookie', 1, {
      upgrade(dbInstance) {
        if (!dbInstance.objectStoreNames.contains('queryCache')) {
          dbInstance.createObjectStore('queryCache');
        }
      }
    });

    await db.put('queryCache', client, 'tanstack-cache');
  },
  restoreClient: async () => {
    const db = await openDB('projectify-bookie', 1, {
      upgrade(dbInstance) {
        if (!dbInstance.objectStoreNames.contains('queryCache')) {
          dbInstance.createObjectStore('queryCache');
        }
      }
    });

    return db.get('queryCache', 'tanstack-cache');
  },
  removeClient: async () => {
    const db = await openDB('projectify-bookie', 1, {
      upgrade(dbInstance) {
        if (!dbInstance.objectStoreNames.contains('queryCache')) {
          dbInstance.createObjectStore('queryCache');
        }
      }
    });

    await db.delete('queryCache', 'tanstack-cache');
  }
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 1000 * 60 * 60 * 24,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}