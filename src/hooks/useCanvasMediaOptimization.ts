import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { optimizeCanvasImageAsset, optimizeCanvasVideoAsset } from '@/lib/canvas-media-optimization';
import { updateGenerationHistoryMedia } from '@/lib/generation-history';

interface UseCanvasMediaOptimizationParams {
  elements: CanvasElement[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  pan: { x: number; y: number };
  scale: number;
  enabled?: boolean;
}

const OPTIMIZATION_OVERSCAN_PX = 300;

function isMediaNearViewport(
  element: CanvasElement,
  panX: number,
  panY: number,
  scale: number,
) {
  if (typeof window === 'undefined') return false;
  const safeScale = Math.max(scale, 0.01);
  const left = (-panX - OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const top = (-panY - OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const right = (-panX + window.innerWidth + OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const bottom = (-panY + window.innerHeight + OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const width = element.width || (element.type === 'video' ? 400 : 480);
  const height = element.height || (element.type === 'video' ? 300 : 360);
  return element.x + width >= left
    && element.x <= right
    && element.y + height >= top
    && element.y <= bottom;
}

function needsImageOptimization(element: CanvasElement) {
  return element.type === 'image'
    && Boolean(element.content)
    && (!element.previewUrl || !element.thumbnailUrl || element.content?.startsWith('data:'));
}

function needsVideoOptimization(element: CanvasElement) {
  return element.type === 'video'
    && Boolean(element.content)
    && (!element.posterUrl || element.content?.startsWith('data:'));
}

export function useCanvasMediaOptimization({
  elements,
  setElements,
  pan,
  scale,
  enabled = true,
}: UseCanvasMediaOptimizationParams) {
  const { x: panX, y: panY } = pan;
  const runningKeysRef = useRef(new Set<string>());
  const failedKeysRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const [queueTick, setQueueTick] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (runningKeysRef.current.size > 0) return;
    const candidate = elements.find((element) => {
      if (!isMediaNearViewport(element, panX, panY, scale)) return false;
      if (!needsImageOptimization(element) && !needsVideoOptimization(element)) return false;
      const key = `${element.id}:${element.content}`;
      return !runningKeysRef.current.has(key) && !failedKeysRef.current.has(key);
    });
    if (!candidate?.content) return;

    const key = `${candidate.id}:${candidate.content}`;
    let started = false;
    const run = async () => {
      started = true;
      runningKeysRef.current.add(key);
      try {
        if (candidate.type === 'image') {
          const optimized = await optimizeCanvasImageAsset(candidate.content!);
          if (!mountedRef.current) return;
          setElements((current) => current.map((element) => (
            element.id === candidate.id && element.content === candidate.content
              ? { ...element, ...optimized }
              : element
          )));
          void updateGenerationHistoryMedia(candidate.id, {
            content: optimized.content,
            previewUrl: optimized.previewUrl,
            thumbnailUrl: optimized.thumbnailUrl,
            width: optimized.originalWidth,
            height: optimized.originalHeight,
          });
        } else if (candidate.type === 'video') {
          const optimized = await optimizeCanvasVideoAsset(candidate.content!);
          if (!mountedRef.current) return;
          setElements((current) => current.map((element) => (
            element.id === candidate.id && element.content === candidate.content
              ? { ...element, ...optimized }
              : element
          )));
          void updateGenerationHistoryMedia(candidate.id, {
            content: optimized.content,
            posterUrl: optimized.posterUrl,
            width: optimized.originalWidth,
            height: optimized.originalHeight,
          });
        }
      } catch (error) {
        failedKeysRef.current.add(key);
        console.warn('[canvas-media] 素材预览优化失败，继续使用原始素材', error);
      } finally {
        runningKeysRef.current.delete(key);
        if (mountedRef.current) setQueueTick((value) => value + 1);
      }
    };

    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const requestIdle = idleWindow.requestIdleCallback?.bind(window);
    const idleId = requestIdle
      ? requestIdle(() => void run(), { timeout: 1200 })
      : window.setTimeout(() => void run(), 120);
    return () => {
      if (!started) {
        if (requestIdle) idleWindow.cancelIdleCallback?.(idleId);
        else window.clearTimeout(idleId);
      }
    };
  }, [elements, enabled, panX, panY, queueTick, scale, setElements]);
}
