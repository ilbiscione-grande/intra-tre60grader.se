'use client';

import { useRef } from 'react';

type SwipeTabOptions<T extends string> = {
  tabs: readonly T[];
  activeTab: T;
  onChange: (tab: T) => void;
  threshold?: number;
};

export function useSwipeTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  threshold = 56
}: SwipeTabOptions<T>) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1) return;

    if (deltaX < 0 && currentIndex < tabs.length - 1) {
      onChange(tabs[currentIndex + 1]);
    }

    if (deltaX > 0 && currentIndex > 0) {
      onChange(tabs[currentIndex - 1]);
    }
  }

  return { onTouchStart, onTouchEnd };
}
