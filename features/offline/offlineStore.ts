'use client';

import { create } from 'zustand';

type OfflineState = {
  queuedCount: number;
  conflictCount: number;
  failedCount: number;
  setCounts: (counts: Pick<OfflineState, 'queuedCount' | 'conflictCount' | 'failedCount'>) => void;
};

export const useOfflineStore = create<OfflineState>((set) => ({
  queuedCount: 0,
  conflictCount: 0,
  failedCount: 0,
  setCounts: (counts) => set(counts)
}));