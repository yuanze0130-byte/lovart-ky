import { useCallback, useState } from 'react';

export interface CanvasPan {
  x: number;
  y: number;
}

export function useCanvasViewport() {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<CanvasPan>({ x: 0, y: 0 });

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.1, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.1, 0.1));
  }, []);

  return {
    scale,
    pan,
    setScale,
    setPan,
    zoomIn,
    zoomOut,
  };
}
