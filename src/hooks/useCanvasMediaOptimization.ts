import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { optimizeCanvasImageAsset, optimizeCanvasVideoAsset } from '@/lib/canvas-media-optimization';
import { updateGenerationHistoryMedia } from '@/lib/generation-history';

interface UseCanvasMediaOptimizationParams {
  elements: CanvasElement[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  pan: { x: number; y: number };
  scale: number;
  viewportWidth?: number;
  viewportHeight?: number;
  enabled?: boolean;
}

const OPTIMIZATION_OVERSCAN_PX = 300;
const MEDIA_OPTIMIZATION_MAX_ATTEMPTS = 3;
const MEDIA_OPTIMIZATION_RETRY_BASE_MS = 15_000;
const MEDIA_FINGERPRINT_SAMPLES = 64;

interface MediaOptimizationFailure {
  attempts: number;
  retryAt: number;
}

function getMediaOptimizationKey(element: CanvasElement) {
  const source = element.content || '';
  const stride = Math.max(1, Math.floor(source.length / MEDIA_FINGERPRINT_SAMPLES));
  let fingerprint = 2_166_136_261;
  for (let index = 0; index < source.length; index += stride) {
    fingerprint = Math.imul(fingerprint ^ source.charCodeAt(index), 16_777_619);
  }
  if (source.length > 0) {
    fingerprint = Math.imul(fingerprint ^ source.charCodeAt(source.length - 1), 16_777_619);
  }
  return `${element.id}:${source.length}:${fingerprint >>> 0}`;
}

function isMediaNearViewport(
  element: CanvasElement,
  panX: number,
  panY: number,
  scale: number,
  viewportWidth?: number,
  viewportHeight?: number,
) {
  if (typeof window === 'undefined') return false;
  const safeScale = Math.max(scale, 0.01);
  const visibleWidth = viewportWidth && viewportWidth > 0 ? viewportWidth : window.innerWidth;
  const visibleHeight = viewportHeight && viewportHeight > 0 ? viewportHeight : window.innerHeight;
  const left = (-panX - OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const top = (-panY - OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const right = (-panX + visibleWidth + OPTIMIZATION_OVERSCAN_PX) / safeScale;
  const bottom = (-panY + visibleHeight + OPTIMIZATION_OVERSCAN_PX) / safeScale;
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
  viewportWidth,
  viewportHeight,
  enabled = true,
}: UseCanvasMediaOptimizationParams) {
  const { x: panX, y: panY } = pan;
  const runningKeysRef = useRef(new Set<string>());
  const failedKeysRef = useRef(new Map<string, MediaOptimizationFailure>());
  const mountedRef = useRef(true);
  const elementsRef = useRef(elements);
  const [queueTick, setQueueTick] = useState(0);
  elementsRef.current = elements;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (runningKeysRef.current.size > 0) return;
    const now = Date.now();
    let nextRetryAt = Number.POSITIVE_INFINITY;
    const candidate = elements.find((element) => {
      if (!isMediaNearViewport(element, panX, panY, scale, viewportWidth, viewportHeight)) return false;
      if (!needsImageOptimization(element) && !needsVideoOptimization(element)) return false;
      const key = getMediaOptimizationKey(element);
      if (runningKeysRef.current.has(key)) return false;
      const failure = failedKeysRef.current.get(key);
      if (!failure) return true;
      if (failure.attempts >= MEDIA_OPTIMIZATION_MAX_ATTEMPTS) return false;
      if (failure.retryAt <= now) return true;
      nextRetryAt = Math.min(nextRetryAt, failure.retryAt);
      return false;
    });
    if (!candidate?.content) {
      if (Number.isFinite(nextRetryAt)) {
        const retryTimer = window.setTimeout(
          () => setQueueTick((value) => value + 1),
          Math.max(250, nextRetryAt - now),
        );
        return () => window.clearTimeout(retryTimer);
      }
      return;
    }

    const key = getMediaOptimizationKey(candidate);
    let started = false;
    const run = async () => {
      started = true;
      runningKeysRef.current.add(key);
      try {
        if (candidate.type === 'image') {
          const optimized = await optimizeCanvasImageAsset(candidate.content!);
          if (!mountedRef.current) return;
          if (!elementsRef.current.some((element) => element.id === candidate.id && element.content === candidate.content)) return;
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
          if (!elementsRef.current.some((element) => element.id === candidate.id && element.content === candidate.content)) return;
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
        const attempts = (failedKeysRef.current.get(key)?.attempts || 0) + 1;
        failedKeysRef.current.set(key, {
          attempts,
          retryAt: Date.now() + MEDIA_OPTIMIZATION_RETRY_BASE_MS * (2 ** (attempts - 1)),
        });
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
  }, [elements, enabled, panX, panY, queueTick, scale, setElements, viewportHeight, viewportWidth]);
}
