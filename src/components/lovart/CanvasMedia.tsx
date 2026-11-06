'use client';

/* eslint-disable @next/next/no-img-element -- Canvas assets already use server-generated preview variants. */
import { memo, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';

interface CanvasImageMediaProps {
  source: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  lowDetail: boolean;
  priority?: boolean;
}

function ResilientCanvasImage({ source, previewUrl, thumbnailUrl, lowDetail, priority = false }: CanvasImageMediaProps) {
  // Keep the detailed preview for this mounted asset; zooming out must not
  // repeatedly replace it with a thumbnail. Offscreen unmounts still release it.
  const [promoted, setPromoted] = useState(!lowDetail);
  const [displaySource, setDisplaySource] = useState<string>();
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  useEffect(() => { if (!lowDetail) setPromoted(true); }, [lowDetail]);
  const candidates = useMemo(() => Array.from(new Set(
    (promoted ? [previewUrl, source, thumbnailUrl] : [thumbnailUrl, previewUrl, source])
      .filter((value): value is string => Boolean(value)),
  )), [promoted, previewUrl, source, thumbnailUrl]);
  const pendingSource = candidates.find(candidate => !failedSources.has(candidate));

  if (!displaySource && !pendingSource) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-100 px-3 text-center text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        图片加载失败，请重新打开画布重试
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900">
      {!displaySource && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
      )}
      {Array.from(new Set([displaySource, pendingSource].filter((value): value is string => Boolean(value)))).map(imageSource => <img
        key={imageSource}
        src={imageSource}
        alt={imageSource === displaySource ? '画布图片' : ''}
        aria-hidden={imageSource !== displaySource}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'low'}
        decoding="async"
        draggable={false}
        onLoad={() => { if (imageSource === pendingSource) setDisplaySource(imageSource); }}
        onError={() => {
          setFailedSources(current => new Set([...current, imageSource]));
          setDisplaySource(current => current === imageSource ? undefined : current);
        }}
        className={`absolute inset-0 h-full w-full rounded-lg object-contain pointer-events-none select-none ${imageSource === displaySource ? 'opacity-100' : 'opacity-0'}`}
      />)}
    </div>
  );
}

export const CanvasImageMedia = memo(function CanvasImageMedia({
  source,
  previewUrl,
  thumbnailUrl,
  lowDetail,
  priority = false,
}: CanvasImageMediaProps) {
  const assetKey = JSON.stringify([source, previewUrl, thumbnailUrl]);
  return <ResilientCanvasImage key={assetKey} source={source} previewUrl={previewUrl} thumbnailUrl={thumbnailUrl} lowDetail={lowDetail} priority={priority} />;
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

export const CanvasAudioMedia = memo(function CanvasAudioMedia({ source }: { source: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 rounded-xl bg-gradient-to-br from-fuchsia-50 to-violet-100 p-4 dark:from-fuchsia-950/40 dark:to-violet-950/50">
      <div className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-200">音频素材</div>
      <audio src={source} controls preload="metadata" className="w-full" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} />
    </div>
  );
});
