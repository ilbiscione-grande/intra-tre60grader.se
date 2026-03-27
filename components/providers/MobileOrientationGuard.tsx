'use client';

import { useEffect } from 'react';

const MOBILE_MEDIA_QUERY = '(max-width: 768px)';

type SupportedOrientationLock =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>;
  unlock?: () => void;
};

export default function MobileOrientationGuard() {
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const orientation = screen.orientation as ScreenOrientationWithLock | undefined;

    async function syncOrientationLock() {
      if (!orientation?.lock) return;

      try {
        if (mediaQuery.matches) {
          await orientation.lock('portrait');
          return;
        }

        orientation.unlock?.();
      } catch {
        // Browsers often restrict orientation lock outside installed/fullscreen mobile contexts.
      }
    }

    void syncOrientationLock();

    const handleChange = () => {
      void syncOrientationLock();
    };

    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener('resize', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, []);

  return null;
}
