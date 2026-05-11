'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface PanoramaViewerProps {
  src: string;
  alt: string;
  className?: string;
  heightClassName?: string;
  overlay?: React.ReactNode;
  badge?: React.ReactNode;
}

function wrapOffset(value: number, width: number) {
  if (width <= 0) return 0;
  const wrapped = value % width;
  return wrapped < 0 ? wrapped + width : wrapped;
}

interface PanoramaStageProps {
  src: string;
  alt: string;
  className?: string;
  heightClassName?: string;
  overlay?: React.ReactNode;
  badge?: React.ReactNode;
  showExpandButton?: boolean;
  expandButtonLabel?: string;
  onExpand?: () => void;
}

function PanoramaStage({
  src,
  alt,
  className = '',
  heightClassName = 'h-full',
  overlay,
  badge,
  showExpandButton = true,
  expandButtonLabel = '沉浸预览',
  onExpand,
}: PanoramaStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [yaw, setYaw] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [displayYaw, setDisplayYaw] = useState(0);
  const dragStateRef = useRef<{ startX: number; startYaw: number; lastX: number; lastTime: number; velocity: number } | null>(null);
  const inertiaRef = useRef<number | null>(null);
  const displayYawRef = useRef(0);
  const displayFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setContainerWidth(container.clientWidth);
      setContainerHeight(container.clientHeight);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const paneWidth = useMemo(() => {
    if (!containerWidth || !containerHeight) return 0;
    const base = naturalSize && naturalSize.width && naturalSize.height
      ? containerHeight * (naturalSize.width / naturalSize.height)
      : containerWidth * 1.8;
    return Math.max(base, containerWidth * 1.6);
  }, [containerHeight, containerWidth, naturalSize]);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    stopInertia();
    const now = performance.now();
    dragStateRef.current = {
      startX: event.clientX,
      startYaw: yaw,
      lastX: event.clientX,
      lastTime: now,
      velocity: 0,
    };
    setIsDragging(true);
    container.setPointerCapture(event.pointerId);
  }, [stopInertia, yaw]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || !containerWidth) return;

    const now = performance.now();
    const deltaX = event.clientX - dragState.startX;
    const degreesPerPixel = 0.18;
    setYaw(dragState.startYaw - deltaX * degreesPerPixel);

    const deltaTime = Math.max(1, now - dragState.lastTime);
    const deltaPos = event.clientX - dragState.lastX;
    dragState.velocity = (deltaPos / deltaTime) * degreesPerPixel;
    dragState.lastX = event.clientX;
    dragState.lastTime = now;
  }, [containerWidth]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    setIsDragging(false);

    const initialVelocity = dragState?.velocity ?? 0;
    if (Math.abs(initialVelocity) < 0.01) return;

    stopInertia();
    let currentVelocity = initialVelocity;
    let currentYaw = yaw;
    let lastFrame = performance.now();

    const step = (time: number) => {
      const deltaMs = time - lastFrame;
      lastFrame = time;
      currentYaw += currentVelocity * (deltaMs / 16.67);
      currentVelocity *= Math.pow(0.90, deltaMs / 16.67);
      setYaw(currentYaw);

      if (Math.abs(currentVelocity) < 0.005) {
        inertiaRef.current = null;
        return;
      }

      inertiaRef.current = requestAnimationFrame(step);
    };

    inertiaRef.current = requestAnimationFrame(step);
  }, [stopInertia, yaw]);

  useEffect(() => () => stopInertia(), [stopInertia]);

  useEffect(() => {
    if (displayFrameRef.current !== null) {
      cancelAnimationFrame(displayFrameRef.current);
    }

    const step = () => {
      const current = displayYawRef.current;
      const next = current + (yaw - current) * 0.18;
      displayYawRef.current = next;
      setDisplayYaw(next);
      displayFrameRef.current = requestAnimationFrame(step);
    };

    displayFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (displayFrameRef.current !== null) {
        cancelAnimationFrame(displayFrameRef.current);
        displayFrameRef.current = null;
      }
    };
  }, [yaw]);

  const viewOffset = useMemo(() => wrapOffset((displayYaw / 360) * paneWidth, paneWidth), [paneWidth, displayYaw]);
  const normalizedYaw = (((displayYaw % 360) + 360) % 360) / 360;
  const parallaxShift = (normalizedYaw - 0.5) * 18;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-[inherit] bg-slate-950 select-none ${heightClassName} ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={(event) => {
        if (dragStateRef.current) {
          handlePointerEnd(event);
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onExpand?.();
      }}
    >
      <div className={`absolute inset-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute left-1/2 top-0 h-full flex items-stretch"
            style={{
              width: paneWidth > 0 ? `${paneWidth * 3}px` : '300%',
              transform: `translate3d(calc(-50% - ${viewOffset}px), 0, 0)`,
              willChange: isDragging ? 'transform' : undefined,
            }}
          >
            {[0, 1, 2].map((index) => (
              <img
                key={index}
                src={src}
                alt={alt}
                draggable={false}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
                }}
                className="pointer-events-none h-full w-auto max-w-none shrink-0 select-none object-cover"
                style={{
                  width: paneWidth > 0 ? `${paneWidth}px` : '100%',
                  transform: `translate3d(${parallaxShift * (index - 1) * 0.35}px, 0, 0) scale(${isDragging ? 1.015 : 1.008})`,
                  transformOrigin: 'center center',
                }}
              />
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-slate-950/86 via-slate-950/34 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-slate-950/86 via-slate-950/34 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-slate-950/30 via-slate-950/10 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/88 via-slate-950/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-[14%] inset-y-[12%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.05)_24%,rgba(255,255,255,0)_62%)] opacity-75 blur-2xl" />
        <div className="pointer-events-none absolute inset-y-5 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/22 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/55 backdrop-blur-sm">
          immersive panorama
        </div>
        {showExpandButton && onExpand && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onExpand();
            }}
            className="absolute right-3 top-3 z-20 rounded-full border border-white/12 bg-black/35 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/78 backdrop-blur-sm transition hover:bg-black/50"
          >
            {expandButtonLabel}
          </button>
        )}
      </div>
      {badge}
      {overlay}
    </div>
  );
}

export function PanoramaViewer({
  src,
  alt,
  className = '',
  heightClassName = 'h-full',
  overlay,
  badge,
}: PanoramaViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  return (
    <>
      <PanoramaStage
        src={src}
        alt={alt}
        className={className}
        heightClassName={heightClassName}
        overlay={overlay}
        badge={badge}
        onExpand={() => setIsFullscreen(true)}
      />

      {isFullscreen && (
        <div
          className="fixed inset-0 z-[120] bg-black/88 backdrop-blur-md"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 text-white/80">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">panorama viewer</div>
              <div className="mt-1 text-sm font-medium text-white/88">{alt}</div>
              <div className="mt-1 text-xs text-white/50">左键拖动旋转查看 · 双击或 ESC 退出</div>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsFullscreen(false);
              }}
              className="rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/86 transition hover:bg-white/16"
            >
              关闭
            </button>
          </div>

          <div className="absolute inset-x-6 bottom-6 top-20 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_100px_rgba(0,0,0,0.45)]">
            <PanoramaStage
              src={src}
              alt={alt}
              className="rounded-[24px]"
              heightClassName="h-full"
              badge={(
                <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/86 backdrop-blur-sm">
                  immersive panorama
                </div>
              )}
              overlay={(
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/16 to-transparent px-5 py-4 text-[11px] text-white/65">
                  Drag to rotate · seamless wraparound view
                </div>
              )}
              showExpandButton={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
