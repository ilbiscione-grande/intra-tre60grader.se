'use client';

import { useEffect, useState } from 'react';

export type BreakpointMode = 'mobile' | 'desktop';

const DESKTOP_MIN_WIDTH = 1024;

export function useBreakpointMode(): BreakpointMode {
  const [mode, setMode] = useState<BreakpointMode>('mobile');

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

    const updateMode = () => {
      setMode(mediaQuery.matches ? 'desktop' : 'mobile');
    };

    updateMode();
    mediaQuery.addEventListener('change', updateMode);

    return () => mediaQuery.removeEventListener('change', updateMode);
  }, []);

  return mode;
}
