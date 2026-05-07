import { useEffect, useState } from 'react';

export interface ViewportSize {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT_SIZE: ViewportSize = {
  width: 1440,
  height: 900,
};

export function useViewportSize() {
  const [viewportSize, setViewportSize] = useState<ViewportSize>(DEFAULT_VIEWPORT_SIZE);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    syncViewportSize();
    window.addEventListener('resize', syncViewportSize);
    return () => window.removeEventListener('resize', syncViewportSize);
  }, []);

  return viewportSize;
}
