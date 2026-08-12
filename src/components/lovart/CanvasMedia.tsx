'use client';

/* eslint-disable @next/next/no-img-element -- Canvas assets already use server-generated preview variants. */
import { memo } from 'react';
import { Play } from 'lucide-react';

interface CanvasImageMediaProps {
  source: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  lowDetail: boolean;
}

export const CanvasImageMedia = memo(function CanvasImageMedia({
  source,
  previewUrl,
  thumbnailUrl,
  lowDetail,
}: CanvasImageMediaProps) {
  const displaySource = lowDetail
    ? thumbnailUrl || previewUrl || source
    : previewUrl || source;
  return (
    <img
      src={displaySource}
      alt="画布图片"
      loading="lazy"
      decoding="async"
      draggable={false}
      className="h-full w-full rounded-lg object-contain pointer-events-none select-none"
    />
  );
});

interface CanvasVideoMediaProps {
  elementId: string;
  source: string;
  posterUrl?: string;
  active: boolean;
  onActivate: (elementId: string) => void;
}

export const CanvasVideoMedia = memo(function CanvasVideoMedia({
  elementId,
  source,
  posterUrl,
  active,
  onActivate,
}: CanvasVideoMediaProps) {
  if (active) {
    return (
      <video
        src={source}
        poster={posterUrl}
        className="h-full w-full object-cover select-none"
        controls
        autoPlay
        loop
        playsInline
        preload="metadata"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      />
    );
  }

  return (
    <div className="group/video relative h-full w-full overflow-hidden rounded-lg bg-slate-950 text-white">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt="视频封面"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(71,85,105,0.55),rgba(2,6,23,0.96))]" />
      )}
      <span className="pointer-events-none absolute inset-0 bg-black/10 transition group-hover/video:bg-black/25" />
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onActivate(elementId);
        }}
        className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 shadow-xl backdrop-blur-sm transition-transform group-hover/video:scale-110"
        aria-label="播放视频"
      >
        <Play size={20} fill="currentColor" className="ml-0.5" />
      </button>
    </div>
  );
});
