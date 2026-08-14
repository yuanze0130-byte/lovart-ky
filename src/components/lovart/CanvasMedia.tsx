'use client';

/* eslint-disable @next/next/no-img-element -- Canvas assets already use server-generated preview variants. */
import { memo, useMemo, useState } from 'react';
import { Play } from 'lucide-react';

interface CanvasImageMediaProps {
  source: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  lowDetail: boolean;
}

function ResilientCanvasImage({ candidates }: { candidates: string[] }) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const displaySource = candidates[candidateIndex];

  if (!displaySource) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-100 px-3 text-center text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        图片加载失败，请重新打开画布重试
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
      )}
      <img
        src={displaySource}
        alt="画布图片"
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setCandidateIndex((current) => current + 1);
        }}
        className={`relative h-full w-full rounded-lg object-contain pointer-events-none select-none transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}

export const CanvasImageMedia = memo(function CanvasImageMedia({
  source,
  previewUrl,
  thumbnailUrl,
  lowDetail,
}: CanvasImageMediaProps) {
  const candidates = useMemo(() => Array.from(new Set(
    (lowDetail
      ? [thumbnailUrl, previewUrl, source]
      : [previewUrl, source, thumbnailUrl]
    ).filter((value): value is string => Boolean(value)),
  )), [lowDetail, previewUrl, source, thumbnailUrl]);
  const candidateKey = candidates.join('\u0000');
  return <ResilientCanvasImage key={candidateKey} candidates={candidates} />;
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
