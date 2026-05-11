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

export function PanoramaViewer({
  src,
  alt,
  className = '',
  heightClassName = 'h-full',
  overlay,
  badge,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startOffsetX: number } | null>(null);

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

  const renderedWidth = useMemo(() => {
    if (!containerWidth || !containerHeight) return 0;
    if (!naturalSize || !naturalSize.width || !naturalSize.height) {
      return containerWidth * 1.8;
    }

    const widthByHeight = containerHeight * (naturalSize.width / naturalSize.height);
    return Math.max(widthByHeight, containerWidth * 1.8);
  }, [containerHeight, containerWidth, naturalSize]);

  const maxOffset = Math.max(0, renderedWidth - containerWidth);

  useEffect(() => {
    setOffsetX((prev) => {
      if (maxOffset <= 0) return 0;
      if (prev === 0) return maxOffset / 2;
      return Math.min(maxOffset, Math.max(0, prev));
    });
  }, [maxOffset]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    dragStateRef.current = {
      startX: event.clientX,
      startOffsetX: offsetX,
    };
    setIsDragging(true);
    container.setPointerCapture(event.pointerId);
  }, [offsetX]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startX;
    const nextOffset = dragState.startOffsetX - deltaX;
    setOffsetX(Math.min(maxOffset, Math.max(0, nextOffset)));
  }, [maxOffset]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

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
    >
      <div className={`absolute inset-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const target = event.currentTarget;
            setNaturalSize({ width: target.naturalWidth, height: target.naturalHeight });
          }}
          className="pointer-events-none absolute left-0 top-0 h-full max-w-none"
          style={{
            width: renderedWidth > 0 ? `${renderedWidth}px` : '180%',
            transform: `translate3d(${-offsetX}px, 0, 0)`,
            willChange: isDragging ? 'transform' : undefined,
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-slate-950/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-slate-950/70 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/70 to-transparent" />
      </div>
      {badge}
      {overlay}
    </div>
  );
}
