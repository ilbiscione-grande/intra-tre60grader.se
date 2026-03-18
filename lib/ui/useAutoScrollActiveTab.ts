'use client';

import { useEffect, useRef } from 'react';

export function useAutoScrollActiveTab<T extends string>(activeTab: T) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const container = containerRef.current;
    const activeItem = itemRefs.current[activeTab];
    if (!container || !activeItem) return;

    const nextLeft = Math.max(0, activeItem.offsetLeft - 4);
    container.scrollTo({ left: nextLeft, behavior: 'smooth' });
  }, [activeTab]);

  function registerItem(tab: T) {
    return (node: HTMLButtonElement | null) => {
      itemRefs.current[tab] = node;
    };
  }

  return { containerRef, registerItem };
}
