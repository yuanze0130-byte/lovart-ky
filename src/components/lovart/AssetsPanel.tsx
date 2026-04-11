'use client';

import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Video, LocateFixed, PlusSquare, PanelRightClose, PanelRightOpen, Wand2, Clapperboard, ArrowUp, ArrowDown, X, Sparkles, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { getStoryboardAspectMeta, type ProjectAsset, type StoryboardItem, type StoryboardLayoutMode, type StoryboardAspectRatio } from '@/hooks/useProjectAssets';

interface AssetsPanelProps {
  assets: ProjectAsset[];
  storyboard: StoryboardItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onInsertAsset: (asset: ProjectAsset) => void;
  onLocateAsset: (asset: ProjectAsset) => void;
  onUseAsImageReference: (asset: ProjectAsset) => void;
  onUseAsVideoReference: (asset: ProjectAsset) => void;
  onAddToStoryboard: (asset: ProjectAsset) => void;
  onLocateStoryboardItem: (item: StoryboardItem) => void;
  onMoveStoryboardItem: (itemId: string, direction: 'up' | 'down') => void;
  onRemoveStoryboardItem: (itemId: string) => void;
  onRenameStoryboardItem: (itemId: string, title: string) => void;
  onUpdateStoryboardBrief: (itemId: string, brief: string) => void;
  onUpdateStoryboardDuration: (itemId: string, durationSec: number) => void;
  onUpdateStoryboardAspectRatio: (itemId: string, aspectRatio: StoryboardAspectRatio) => void;
  onResetStoryboardAspectRatioFromAsset: (itemId: string) => void;
  onUpdateAllStoryboardAspectRatios: (aspectRatio: StoryboardAspectRatio) => void;
  onResetAllStoryboardAspectRatiosFromAssets: () => void;
  storyboardLayout: StoryboardLayoutMode;
  onStoryboardLayoutChange: (layout: StoryboardLayoutMode) => void;
  onCreateVideoFromStoryboard: (item: StoryboardItem) => void;
  onCreateStoryboardFlow: () => void;
}

export function AssetsPanel({
  assets,
  storyboard,
  collapsed,
  onToggleCollapse,
  onInsertAsset,
  onLocateAsset,
  onUseAsImageReference,
  onUseAsVideoReference,
  onAddToStoryboard,
  onLocateStoryboardItem,
  onMoveStoryboardItem,
  onRemoveStoryboardItem,
  onRenameStoryboardItem,
  onUpdateStoryboardBrief,
  onUpdateStoryboardDuration,
  onUpdateStoryboardAspectRatio,
  onResetStoryboardAspectRatioFromAsset,
  onUpdateAllStoryboardAspectRatios,
  onResetAllStoryboardAspectRatiosFromAssets,
  storyboardLayout,
  onStoryboardLayoutChange,
  onCreateVideoFromStoryboard,
  onCreateStoryboardFlow,
}: AssetsPanelProps) {
  const [activeTab, setActiveTab] = useState<'assets' | 'storyboard'>('assets');
  const [expandedStoryboardId, setExpandedStoryboardId] = useState<string | null>(null);

  const grouped = useMemo(() => ({
    image: assets.filter((asset) => asset.type === 'image'),
    video: assets.filter((asset) => asset.type === 'video'),
  }), [assets]);

  const storyboardOrientationSummary = useMemo(() => {
    const orientationOrder = ['portrait', 'landscape', 'square'] as const;
    const orientationLabelMap: Record<(typeof orientationOrder)[number], string> = {
      portrait: 'Portrait',
      landscape: 'Landscape',
      square: 'Square',
    };

    const counts = storyboard.reduce<Record<(typeof orientationOrder)[number], number>>((acc, item) => {
      const meta = getStoryboardAspectMeta(item.aspectRatio ?? '9:16');
      acc[meta.orientation] += 1;
      return acc;
    }, {
      portrait: 0,
      landscape: 0,
      square: 0,
    });

    return orientationOrder
      .filter((orientation) => counts[orientation] > 0)
      .map((orientation) => `${orientationLabelMap[orientation]} × ${counts[orientation]}`);
  }, [storyboard]);

  const storyboardAspectSummary = useMemo(() => {
    const aspectOrder: StoryboardAspectRatio[] = ['9:16', '16:9', '4:5', '1:1'];
    const counts = storyboard.reduce<Record<StoryboardAspectRatio, number>>((acc, item) => {
      const aspectRatio = item.aspectRatio ?? '9:16';
      acc[aspectRatio] += 1;
      return acc;
    }, {
      '9:16': 0,
      '16:9': 0,
      '4:5': 0,
      '1:1': 0,
    });

    return aspectOrder
      .filter((aspectRatio) => counts[aspectRatio] > 0)
      .map((aspectRatio) => ({
        aspectRatio,
        count: counts[aspectRatio],
        meta: getStoryboardAspectMeta(aspectRatio),
      }));
  }, [storyboard]);

  const storyboardRuntimeSummary = useMemo(() => {
    const totalDurationSec = storyboard.reduce((sum, item) => sum + (item.durationSec ?? 5), 0);
    const averageDurationSec = storyboard.length > 0 ? totalDurationSec / storyboard.length : 0;
    const portraitShots = storyboard.filter((item) => getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation === 'portrait').length;
    const landscapeShots = storyboard.filter((item) => getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation === 'landscape').length;
    const squareShots = storyboard.filter((item) => getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation === 'square').length;
    const dominantOrientationEntry = ([
      ['portrait', portraitShots],
      ['landscape', landscapeShots],
      ['square', squareShots],
    ] as const).reduce((best, current) => current[1] > best[1] ? current : best, ['portrait', 0] as const);
    const dominantOrientationLabelMap = {
      portrait: 'Portrait-led',
      landscape: 'Landscape-led',
      square: 'Square-led',
    } as const;

    return {
      totalDurationSec,
      averageDurationSec,
      portraitShots,
      landscapeShots,
      squareShots,
      hasMixedOrientation: [portraitShots, landscapeShots, squareShots].filter((count) => count > 0).length > 1,
      dominantOrientation: dominantOrientationEntry[1] > 0 ? dominantOrientationEntry[0] : null,
      dominantOrientationLabel: dominantOrientationEntry[1] > 0 ? dominantOrientationLabelMap[dominantOrientationEntry[0]] : null,
    };
  }, [storyboard]);

  if (collapsed) {
    return (
      <div className="absolute right-4 top-20 z-40">
        <button
          onClick={onToggleCollapse}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-black/72 dark:hover:bg-white/8"
          title="展开资产面板"
        >
          <PanelRightOpen size={18} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-20 bottom-4 z-40 w-[340px] rounded-3xl border border-gray-200 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-black/78 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">资产与结果</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">当前项目素材与生成结果</div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100"
          title="收起资产面板"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-white/10">
        <button
          onClick={() => setActiveTab('assets')}
          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
            activeTab === 'assets'
              ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8'
          }`}
        >
          资产
        </button>
        <button
          onClick={() => setActiveTab('storyboard')}
          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
            activeTab === 'storyboard'
              ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8'
          }`}
        >
          分镜
        </button>
      </div>

      <div className="h-[calc(100%-108px)] overflow-y-auto px-3 py-3">
        {activeTab === 'assets' ? (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <ImageIcon size={14} />
                图片资产 · {grouped.image.length}
              </div>
              <div className="space-y-2">
                {grouped.image.length > 0 ? grouped.image.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onInsert={onInsertAsset}
                    onLocate={onLocateAsset}
                    onUseAsImageReference={onUseAsImageReference}
                    onUseAsVideoReference={onUseAsVideoReference}
                    onAddToStoryboard={onAddToStoryboard}
                  />
                )) : <EmptyHint text="还没有图片资产" />}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Video size={14} />
                视频资产 · {grouped.video.length}
              </div>
              <div className="space-y-2">
                {grouped.video.length > 0 ? grouped.video.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onInsert={onInsertAsset}
                    onLocate={onLocateAsset}
                    onUseAsImageReference={onUseAsImageReference}
                    onUseAsVideoReference={onUseAsVideoReference}
                    onAddToStoryboard={onAddToStoryboard}
                  />
                )) : <EmptyHint text="还没有视频资产" />}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            {storyboard.length > 0 && (
              <div className="space-y-3 rounded-3xl border border-gray-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.02)_100%)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Production Board</div>
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{storyboard.length} 个镜头，支持批量落盘为带画幅感知的视频节点。</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{storyboardLayout === 'vertical' ? 'Shot Queue Controller' : 'Storyboard Flow Controller'}</div>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600 dark:bg-white/8 dark:text-gray-300">
                    {storyboardLayout === 'vertical' ? 'Vertical flow' : 'Horizontal flow'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Shots</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboard.length}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Layout</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardLayout === 'vertical' ? 'Vertical' : 'Horizontal'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Aspect mix</div>
                    <div className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{Array.from(new Set(storyboard.map((item) => item.aspectRatio ?? '9:16'))).join(' · ')}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Render mix</div>
                    <div className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{Array.from(new Set(storyboard.map((item) => item.outputSize ?? getStoryboardAspectMeta(item.aspectRatio ?? '9:16').videoSize))).join(' · ')}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Runtime</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.totalDurationSec}s total</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Pacing</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.averageDurationSec.toFixed(1)}s avg</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Orientation</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.dominantOrientationLabel || 'Mixed'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Batch intent</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboard.length > 1 ? 'Multi-shot board' : 'Single-shot board'}</div>
                  </div>
                </div>
                {storyboardAspectSummary.length > 0 && (
                  <div className="space-y-2 rounded-2xl border border-gray-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Batch frame preset</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">一键统一全部镜头画幅</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['9:16', '16:9', '4:5', '1:1'] as StoryboardAspectRatio[]).map((aspectRatio) => {
                        const meta = getStoryboardAspectMeta(aspectRatio);
                        return (
                          <button
                            key={aspectRatio}
                            onClick={() => onUpdateAllStoryboardAspectRatios(aspectRatio)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:bg-white/6 dark:text-gray-200 dark:hover:border-sky-400/30 dark:hover:bg-sky-400/12 dark:hover:text-sky-100"
                          >
                            {aspectRatio} · {meta.shortLabel}
                          </button>
                        );
                      })}
                      <button
                        onClick={onResetAllStoryboardAspectRatiosFromAssets}
                        className="rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                      >
                        跟随素材原画幅
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      {storyboardAspectSummary.map(({ aspectRatio, count, meta }) => (
                        <span
                          key={aspectRatio}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200"
                        >
                          {aspectRatio} · {meta.shortLabel} × {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {storyboardOrientationSummary.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Orientation mix</span>
                      {storyboardOrientationSummary.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                      <div className="flex items-center justify-between gap-2">
                        <div className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Board note</div>
                        <div className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-medium text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                          {storyboard.length > 1 ? `${storyboardLayout === 'horizontal' ? 'Flow strip' : 'Shot queue'} · ${storyboard.length} shots` : 'Single shot'}
                        </div>
                      </div>
                      <div className="mt-1 leading-5 text-gray-600 dark:text-gray-300">
                        {storyboardRuntimeSummary.hasMixedOrientation
                          ? '当前是混合画幅分镜流，批量落盘会保留每个镜头自己的画幅与输出尺寸。'
                          : '当前分镜画幅统一，适合直接批量落盘为一致规格的视频节点。'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">Auto node sizing</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">Per-shot frame memory</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">Board-aware video prompt</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/8">
                  <button
                    onClick={() => onStoryboardLayoutChange('vertical')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors ${storyboardLayout === 'vertical' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/14 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
                  >
                    <RectangleVertical size={14} />
                    竖排
                  </button>
                  <button
                    onClick={() => onStoryboardLayoutChange('horizontal')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors ${storyboardLayout === 'horizontal' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/14 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
                  >
                    <RectangleHorizontal size={14} />
                    横排
                  </button>
                </div>
                <button
                  onClick={onCreateStoryboardFlow}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gradient-to-r dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500 dark:hover:brightness-110"
                >
                  <Sparkles size={15} />
                  批量生成镜头流
                </button>
              </div>
            )}
            {storyboard.length > 0 && (
              <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                <span>Shot Cards</span>
                <span>{storyboard.length} items</span>
              </div>
            )}
            {storyboard.length > 0 ? storyboard.map((item, index) => {
              const aspectMeta = getStoryboardAspectMeta(item.aspectRatio ?? '9:16');
              const OrientationIcon = aspectMeta.orientation === 'landscape'
                ? RectangleHorizontal
                : aspectMeta.orientation === 'square'
                  ? Square
                  : RectangleVertical;
              const isExpanded = expandedStoryboardId === item.id;
              return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5"
              >
                <button
                  onClick={() => setExpandedStoryboardId((prev) => prev === item.id ? null : item.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/8"
                >
                  <div className="flex w-[96px] shrink-0 flex-col items-center gap-2">
                    <div className={`relative w-full overflow-hidden rounded-xl bg-gray-100 ring-1 ring-black/5 dark:bg-black dark:ring-white/10 ${aspectMeta.frameClass}`}>
                      <div className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
                        {item.aspectRatio ?? '9:16'}
                      </div>
                      {item.type === 'image' ? (
                        <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                      ) : (
                        <video src={item.thumbnailUrl} className="h-full w-full object-cover" muted playsInline />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      <OrientationIcon size={11} />
                      <span>{aspectMeta.label}</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                          {isExpanded ? 'Shot Card — Expanded' : 'Shot Card — Compact'}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          <span>Shot {String(index + 1).padStart(2, '0')}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-white/10 dark:text-gray-300">
                            {item.type === 'image' ? 'Image Source' : 'Video Source'}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-full border border-gray-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                        {isExpanded ? '收起细节' : '展开细节'}
                      </div>
                    </div>
                    <input
                      value={item.title}
                      onChange={(e) => onRenameStoryboardItem(item.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded-md bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:bg-gray-50 dark:text-gray-100 dark:focus:bg-white/8"
                      placeholder={`Shot ${String(index + 1).padStart(2, '0')}`}
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                      <span className="rounded-full border border-gray-200 bg-white/80 px-2 py-0.5 dark:border-white/10 dark:bg-white/8">{storyboardLayout === 'horizontal' ? 'Storyboard Flow' : 'Shot Queue'}</span>
                      <span className="rounded-full border border-gray-200 bg-white/80 px-2 py-0.5 dark:border-white/10 dark:bg-white/8">{isExpanded ? 'Detailed View' : 'Quick View'}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Duration</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={item.durationSec ?? 5}
                        onChange={(e) => onUpdateStoryboardDuration(item.id, Number(e.target.value || 5))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-16 rounded-md border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 outline-none focus:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:focus:bg-white/8"
                      />
                      <span className="text-xs text-gray-400">sec</span>
                    </div>
                    {isExpanded ? (
                    <div className="mt-2 space-y-2">
                      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Shot Meta</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Shot</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Frame</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.aspectRatio ?? '9:16'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Source</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Delta</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{(item.sourceAspectRatio ?? item.aspectRatio ?? '9:16') === (item.aspectRatio ?? '9:16') ? 'Locked' : `${item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'} → ${item.aspectRatio ?? '9:16'}`}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Canvas</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{aspectMeta.displaySize}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Output</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.outputSize ?? aspectMeta.videoSize}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Aspect</span>
                        <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500 dark:bg-white/8 dark:text-gray-300">
                          <OrientationIcon size={12} />
                          <span>{aspectMeta.shortLabel}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Batch slot</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{storyboardLayout === 'horizontal' ? `Column ${index + 1}` : `Row ${index + 1}`}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Sequence</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">
                            {storyboard.length === 1 ? 'Single' : index === 0 ? (storyboardLayout === 'horizontal' ? 'Start →' : 'Head ↓') : index === storyboard.length - 1 ? 'End' : (storyboardLayout === 'horizontal' ? 'Next →' : 'Queue ↓')}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Shot Note</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/8 dark:text-gray-300">{aspectMeta.orientation}</span>
                        </div>
                        <div className="mt-1">
                          当前镜头按 <span className="font-medium text-gray-800 dark:text-gray-100">{item.aspectRatio ?? '9:16'}</span> / <span className="font-medium text-gray-800 dark:text-gray-100">{item.outputSize ?? aspectMeta.videoSize}</span> 落成视频节点，并保留画幅感知。
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                          <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">Source {item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'}</span>
                          <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">Frame {item.aspectRatio ?? '9:16'}</span>
                          <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{(item.sourceAspectRatio ?? item.aspectRatio ?? '9:16') === (item.aspectRatio ?? '9:16') ? 'Locked' : 'Remapped'}</span>
                          <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</span>
                        </div>
                      </div>
                      <select
                        value={item.aspectRatio ?? '9:16'}
                        onChange={(e) => onUpdateStoryboardAspectRatio(item.id, e.target.value as StoryboardAspectRatio)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-700 outline-none focus:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:focus:bg-white/8"
                      >
                        <option value="9:16">9:16 · Portrait · 720x1280</option>
                        <option value="16:9">16:9 · Landscape · 1280x720</option>
                        <option value="4:5">4:5 · Portrait · 1024x1280</option>
                        <option value="1:1">1:1 · Square · 1024x1024</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Frame preset</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{aspectMeta.label}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Render output</div>
                          <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.outputSize ?? aspectMeta.videoSize}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => onResetStoryboardAspectRatioFromAsset(item.id)}
                        className="w-full rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                      >
                        恢复为素材原画幅
                      </button>
                      <textarea
                        value={item.sourcePrompt || ''}
                        onChange={(e) => onUpdateStoryboardBrief(item.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        rows={3}
                        className="mt-2 w-full resize-none rounded-md bg-transparent text-xs text-gray-500 outline-none placeholder:text-gray-400 focus:bg-gray-50 dark:text-gray-400 dark:focus:bg-white/8"
                        placeholder="写这个镜头的 brief：主体动作、镜头运动、风格、节奏、构图…"
                      />
                    </div>
                  ) : (
                    <div className="mt-1.5 space-y-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Shot Meta</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:border-sky-400/20 dark:bg-sky-400/12 dark:text-sky-100">{item.aspectRatio ?? '9:16'}</span>
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200">{item.outputSize ?? aspectMeta.videoSize}</span>
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200">{storyboard.length === 1 ? 'Single' : index === 0 ? (storyboardLayout === 'horizontal' ? 'Start →' : 'Head ↓') : index === storyboard.length - 1 ? 'End' : (storyboardLayout === 'horizontal' ? 'Next →' : 'Queue ↓')}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        <span className="rounded-full border border-gray-200/80 bg-white/70 px-2.5 py-1 text-gray-500 dark:border-white/10 dark:bg-white/6 dark:text-gray-400">{(item.sourceAspectRatio ?? item.aspectRatio ?? '9:16') === (item.aspectRatio ?? '9:16') ? 'Locked' : `${item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'} → ${item.aspectRatio ?? '9:16'}`}</span>
                        <span className="rounded-full border border-dashed border-gray-300 bg-transparent px-2.5 py-1 text-gray-400 dark:border-white/15 dark:text-gray-500">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</span>
                      </div>
                      <div className="rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                          <span>Shot Note</span>
                          <span>{(item.sourceAspectRatio ?? item.aspectRatio ?? '9:16') === (item.aspectRatio ?? '9:16') ? 'Follow' : 'Remapped'}</span>
                        </div>
                        <div className="line-clamp-2">{item.sourcePrompt || `${item.aspectRatio ?? '9:16'} / ${item.outputSize ?? aspectMeta.videoSize} 默认输出。`}</div>
                      </div>
                    </div>
                  )}
                  </div>
                </button>
                <div className="border-t border-gray-100 p-3 dark:border-white/10">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                    <span>Shot Actions</span>
                    <span>{storyboardLayout === 'horizontal' ? 'Flow Footer' : 'Queue Footer'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onCreateVideoFromStoryboard(item)}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-100 dark:bg-sky-400/14 dark:text-sky-200 dark:hover:bg-sky-400/22"
                      title={`按 ${item.aspectRatio ?? '9:16'} / ${item.outputSize ?? aspectMeta.videoSize} 创建视频节点`}
                    >
                      <Sparkles size={14} />
                      生成对应视频节点
                    </button>
                    <button
                      onClick={() => onLocateStoryboardItem(item)}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
                    >
                      <LocateFixed size={14} />
                      定位原始镜头
                    </button>
                    <button
                      onClick={() => onMoveStoryboardItem(item.id, 'up')}
                      disabled={index === 0}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
                    >
                      <ArrowUp size={14} />
                      上移
                    </button>
                    <button
                      onClick={() => onMoveStoryboardItem(item.id, 'down')}
                      disabled={index === storyboard.length - 1}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
                    >
                      <ArrowDown size={14} />
                      下移
                    </button>
                    <button
                      onClick={() => onRemoveStoryboardItem(item.id)}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      <X size={14} />
                      移除
                    </button>
                  </div>
                </div>
              </div>
              );
            }) : <EmptyHint text="还没有分镜内容" />}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  onInsert,
  onLocate,
  onUseAsImageReference,
  onUseAsVideoReference,
  onAddToStoryboard,
}: {
  asset: ProjectAsset;
  onInsert: (asset: ProjectAsset) => void;
  onLocate: (asset: ProjectAsset) => void;
  onUseAsImageReference: (asset: ProjectAsset) => void;
  onUseAsVideoReference: (asset: ProjectAsset) => void;
  onAddToStoryboard: (asset: ProjectAsset) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <div className="aspect-[16/10] overflow-hidden bg-gray-100 dark:bg-black">
        {asset.type === 'image' ? (
          <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" />
        ) : (
          <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          {asset.type === 'image' ? (
            <ImageIcon size={14} className="text-blue-500 dark:text-sky-300" />
          ) : (
            <Video size={14} className="text-purple-500 dark:text-purple-300" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{asset.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {asset.width && asset.height ? `${Math.round(asset.width)} × ${Math.round(asset.height)}` : asset.type === 'video' ? '视频结果' : '图片结果'}
            </div>
            {(asset.aspectRatio || asset.outputSize) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {asset.aspectRatio && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.aspectRatio}</span>
                )}
                {asset.orientation && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.orientation}</span>
                )}
                {asset.outputSize && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.outputSize}</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onInsert(asset)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-100 dark:bg-sky-400/14 dark:text-sky-200 dark:hover:bg-sky-400/22"
          >
            <PlusSquare size={14} />
            插入画布
          </button>
          <button
            onClick={() => onLocate(asset)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            title="定位到来源节点"
          >
            <LocateFixed size={14} />
            定位
          </button>
          {asset.type === 'image' && (
            <button
              onClick={() => onUseAsImageReference(asset)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <Wand2 size={14} />
              图像参考
            </button>
          )}
          {asset.type === 'image' && (
            <button
              onClick={() => onUseAsVideoReference(asset)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <Video size={14} />
              视频参考
            </button>
          )}
          <button
            onClick={() => onAddToStoryboard(asset)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8 ${asset.type === 'image' ? '' : 'col-span-2'}`}
          >
            <Clapperboard size={14} />
            加入分镜
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
      {text}
    </div>
  );
}
