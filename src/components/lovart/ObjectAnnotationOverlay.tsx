import React from 'react';
import type { AnnotationObject as DetectedObject } from '@/lib/object-annotation';

interface ObjectAnnotationOverlayProps {
  imageBounds: { left: number; top: number; width: number; height: number };
  object: DetectedObject | null;
  isDetecting?: boolean;
  onClose: () => void;
}

export function ObjectAnnotationOverlay({ imageBounds, object, isDetecting, onClose }: ObjectAnnotationOverlayProps) {
  return (
    <>
      <div
        className="absolute pointer-events-none rounded-xl border-2 border-dashed border-gray-400/80 bg-gray-400/5 shadow-[0_0_0_1px_rgba(156,163,175,0.12)]"
        style={{
          left: imageBounds.left,
          top: imageBounds.top,
          width: imageBounds.width,
          height: imageBounds.height,
          zIndex: 65,
        }}
      />

      {object && (
        <>
          <div
            className="absolute pointer-events-none rounded-xl border-2 border-gray-700 bg-gray-500/10 shadow-[0_0_0_1px_rgba(55,65,81,0.16),0_10px_30px_rgba(15,23,42,0.12)]"
            style={{
              left: imageBounds.left + object.bbox.x,
              top: imageBounds.top + object.bbox.y,
              width: object.bbox.width,
              height: object.bbox.height,
              zIndex: 75,
            }}
          >
            <div className="absolute -top-8 left-0 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-medium text-white shadow-lg">
              {object.label || '对象'}{typeof object.score === 'number' ? ` · ${Math.round(object.score * 100)}%` : ''}
            </div>
          </div>

          {Array.isArray(object.polygon) && object.polygon.length > 2 && (
            <svg
              className="absolute pointer-events-none overflow-visible"
              style={{
                left: imageBounds.left,
                top: imageBounds.top,
                width: imageBounds.width,
                height: imageBounds.height,
                zIndex: 76,
              }}
              viewBox={`0 0 ${imageBounds.width} ${imageBounds.height}`}
            >
              <polygon
                points={object.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="rgba(107,114,128,0.12)"
                stroke="rgba(55,65,81,0.9)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            </svg>
          )}
        </>
      )}

      <div
        className="absolute flex items-center gap-3 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-xs text-gray-700 shadow-lg"
        style={{
          left: imageBounds.left,
          top: Math.max(12, imageBounds.top - 52),
          zIndex: 80,
        }}
      >
        <span>{isDetecting ? '正在识别对象...' : '标记模式：点击图片中的对象'}</span>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
        >
          退出
        </button>
      </div>
    </>
  );
}
