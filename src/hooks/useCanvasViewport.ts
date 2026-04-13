import { useCallback, useState } from 'react';

export interface CanvasPan {
  x: number;
  y: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

export function useCanvasViewport() {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<CanvasPan>({ x: 0, y: 0 });

  const zoomTo = useCallback((nextScale: number, center?: { x: number; y: number }) => {
    setScale((prev) => {
      const clamped = Math.min(Math.max(nextScale, MIN_SCALE), MAX_SCALE);

      if (center) {
        setPan((prevPan) => ({
          x: center.x - ((center.x - prevPan.x) / prev) * clamped,
          y: center.y - ((center.y - prevPan.y) / prev) * clamped,
        }));
      }

      return clamped;
    });
  }, []);

  const zoomIn = useCallback((center?: { x: number; y: number }) => {
    zoomTo(scale + 0.1, center);
  }, [scale, zoomTo]);

  const zoomOut = useCallback((center?: { x: number; y: number }) => {
    zoomTo(scale - 0.1, center);
  }, [scale, zoomTo]);

  return {
    scale,
    pan,
    setScale,
    setPan,
    zoomTo,
    zoomIn,
    zoomOut,
  };
}
