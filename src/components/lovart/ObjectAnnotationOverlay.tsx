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
        className="absolute pointer-events-none rounded-xl border-2 border-dashed border-fuchsia-400/80 bg-fuchsia-400/5 shadow-[0_0_0_1px_rgba(232,121,249,0.12)]"
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
            className="absolute pointer-events-none rounded-xl border-2 border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_0_1px_rgba(217,70,239,0.18),0_10px_30px_rgba(217,70,239,0.15)]"
            style={{
              left: imageBounds.left + object.bbox.x,
              top: imageBounds.top + object.bbox.y,
              width: object.bbox.width,
              height: object.bbox.height,
              zIndex: 75,
            }}
          >
            <div className="absolute -top-8 left-0 rounded-full bg-fuchsia-600 px-3 py-1 text-[11px] font-medium text-white shadow-lg">
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
                fill="rgba(217,70,239,0.14)"
                stroke="rgba(192,38,211,0.95)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            </svg>
          )}
        </>
      )}

      <div
        className="absolute flex items-center gap-3 rounded-full border border-fuchsia-200 bg-white/95 px-4 py-2 text-xs text-gray-700 shadow-lg"
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
