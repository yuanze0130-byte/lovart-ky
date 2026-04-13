'use client';

import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Video, LocateFixed, PlusSquare, PanelRightClose, PanelRightOpen, Wand2, Clapperboard, ArrowUp, ArrowDown, X, Sparkles, RectangleHorizontal, RectangleVertical, Square, GripVertical, ArrowRight, Maximize2 } from 'lucide-react';
import { getStoryboardAspectMeta, getStoryboardVideoSizeOptions, getStoryboardRenderProfile, getStoryboardRenderProfileLabel, getRecommendedStoryboardLayout, getStoryboardBoardMode, getStoryboardSequenceHint, getStoryboardFrameDeltaLabel, getStoryboardFrameRoutingLabel, getStoryboardCoverageLabel, getStoryboardNodeDimensions, getStoryboardOrientationLabel, getStoryboardFrameAdaptationLabel, getStoryboardFrameAdaptationTone, summarizeStoryboardBatchHealth, summarizeStoryboardNodeSizing, summarizeProductionBoard, type ProjectAsset, type StoryboardItem, type StoryboardLayoutMode, type StoryboardAspectRatio, type StoryboardVideoSize, type StoryboardRenderProfile } from '@/hooks/useProjectAssets';

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
  onUpdateStoryboardOutputSize: (itemId: string, outputSize: StoryboardVideoSize) => void;
  onResetStoryboardAspectRatioFromAsset: (itemId: string) => void;
  onUpdateAllStoryboardAspectRatios: (aspectRatio: StoryboardAspectRatio) => void;
  onUpdateAllStoryboardDurations: (durationSec: number) => void;
  onUpdateAllStoryboardRenderProfiles: (renderProfile: StoryboardRenderProfile) => void;
  onNormalizeAllStoryboardOutputSizes: () => void;
  onResetAllStoryboardAspectRatiosFromAssets: () => void;
  onApplyStoryboardBoardPreset: (preset: 'portrait-reels' | 'landscape-cinematic' | 'poster-stack' | 'square-social') => void;
  onAutoStoryboardLayout: () => void;
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
  onUpdateStoryboardOutputSize,
  onResetStoryboardAspectRatioFromAsset,
  onUpdateAllStoryboardAspectRatios,
  onUpdateAllStoryboardDurations,
  onUpdateAllStoryboardRenderProfiles,
  onNormalizeAllStoryboardOutputSizes,
  onResetAllStoryboardAspectRatiosFromAssets,
  onApplyStoryboardBoardPreset,
  onAutoStoryboardLayout,
  storyboardLayout,
  onStoryboardLayoutChange,
  onCreateVideoFromStoryboard,
  onCreateStoryboardFlow,
}: AssetsPanelProps) {
  const [activeTab, setActiveTab] = useState<'assets' | 'storyboard'>('assets');
  const [expandedStoryboardIds, setExpandedStoryboardIds] = useState<string[]>([]);

  const grouped = useMemo(() => ({
    image: assets.filter((asset) => asset.type === 'image'),
    video: assets.filter((asset) => asset.type === 'video'),
  }), [assets]);

  const storyboardOrientationSummary = useMemo(() => {
    const orientationOrder = ['portrait', 'landscape', 'square'] as const;
    const orientationLabelMap: Record<(typeof orientationOrder)[number], string> = {
      portrait: '竖版',
      landscape: '横版',
      square: '方形',
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
    const aspectOrder: StoryboardAspectRatio[] = ['9:16', '16:9', '4:5', '1:1', '4:3', '3:4', '21:9', '3:2', '2:3'];
    const counts = storyboard.reduce<Record<StoryboardAspectRatio, number>>((acc, item) => {
      const aspectRatio = item.aspectRatio ?? '9:16';
      acc[aspectRatio] += 1;
      return acc;
    }, {
      '9:16': 0,
      '16:9': 0,
      '4:5': 0,
      '1:1': 0,
      '4:3': 0,
      '3:4': 0,
      '21:9': 0,
      '3:2': 0,
      '2:3': 0,
    });

    return aspectOrder
      .filter((aspectRatio) => counts[aspectRatio] > 0)
      .map((aspectRatio) => ({
        aspectRatio,
        count: counts[aspectRatio],
        meta: getStoryboardAspectMeta(aspectRatio),
      }));
  }, [storyboard]);

  const storyboardRenderSummary = useMemo(() => {
    const counts = storyboard.reduce<Record<StoryboardRenderProfile, number>>((acc, item) => {
      const renderProfile = item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? getStoryboardAspectMeta(item.aspectRatio ?? '9:16').videoSize);
      acc[renderProfile] += 1;
      return acc;
    }, {
      standard: 0,
      high: 0,
    });

    const dominantRenderProfile: StoryboardRenderProfile | null = counts.high > counts.standard
      ? 'high'
      : counts.standard > 0
        ? 'standard'
        : counts.high > 0
          ? 'high'
          : null;

    return {
      counts,
      dominantRenderProfile,
      hasMixedRenderProfiles: counts.high > 0 && counts.standard > 0,
    };
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
      portrait: '竖版主导',
      landscape: '横版主导',
      square: '方形主导',
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

  const recommendedLayout = useMemo<StoryboardLayoutMode>(() => getRecommendedStoryboardLayout(storyboard), [storyboard]);
  const productionBoardSummary = useMemo(() => summarizeProductionBoard(storyboard), [storyboard]);

  const boardHealth = useMemo(() => {
    const summary = summarizeStoryboardBatchHealth(storyboard);
    const nodeSizing = summarizeStoryboardNodeSizing(storyboard);

    return {
      aspectVariants: summary.uniqueAspects,
      renderVariants: summary.uniqueOutputs,
      remappedCount: summary.adaptiveCount,
      lockedCount: summary.lockedCount,
      croppedCount: summary.croppedCount,
      recomposedCount: summary.recomposedCount,
      durationVariants: summary.uniqueDurations,
      renderProfileVariants: summary.uniqueProfiles,
      adaptationLabel: summary.adaptationLabel,
      boardDensityLabel: summary.boardDensityLabel,
      dominantOrientationLabel: summary.dominantOrientationLabel,
      dominantAspectLabel: summary.dominantAspectLabel,
      dominantRenderProfileLabel: summary.dominantRenderProfileLabel,
      lockRateLabel: summary.lockRateLabel,
      dominantFootprint: nodeSizing.dominantFootprint,
      dominantFootprintCount: nodeSizing.dominantFootprintCount,
      widestFootprint: nodeSizing.widest.footprint,
      tallestFootprint: nodeSizing.tallest.footprint,
      largestFootprint: nodeSizing.largestArea.footprint,
      nodeFootprintVariants: nodeSizing.uniqueFootprints,
      isLayoutRecommended: storyboardLayout === recommendedLayout,
      hasUnifiedAspect: summary.uniqueAspects === 1,
      hasUnifiedDuration: summary.uniqueDurations === 1,
      hasUnifiedRenderProfile: summary.uniqueProfiles === 1,
      hasMixedOrientation: summary.hasMixedOrientation,
    };
  }, [recommendedLayout, storyboard, storyboardLayout]);

  const boardPresetCards = useMemo(() => ([
    { id: 'portrait-reels' as const, title: '短视频板', note: '9:16 · 竖版短视频流', aspect: '9:16', accent: 'from-fuchsia-500/20 via-purple-500/10 to-transparent' },
    { id: 'landscape-cinematic' as const, title: '电影镜头板', note: '16:9 · 横向叙事镜头', aspect: '16:9', accent: 'from-sky-500/20 via-blue-500/10 to-transparent' },
    { id: 'poster-stack' as const, title: '海报分镜板', note: '4:5 · 海报型分镜', aspect: '4:5', accent: 'from-amber-500/20 via-orange-500/10 to-transparent' },
    { id: 'square-social' as const, title: '社媒方版', note: '1:1 · 方形社媒版', aspect: '1:1', accent: 'from-emerald-500/20 via-teal-500/10 to-transparent' },
  ]), []);

  const expandAllStoryboardCards = () => {
    setExpandedStoryboardIds(storyboard.map((item) => item.id));
  };

  const collapseAllStoryboardCards = () => {
    setExpandedStoryboardIds([]);
  };

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
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">制作板</div>
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{storyboard.length} 个镜头，支持批量落盘为带画幅感知的视频节点。</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{storyboardLayout === 'vertical' ? '镜头队列控制器' : '分镜流程控制器'}</div>
                  </div>
                  <div className="space-y-1.5 text-right">
                    <div className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600 dark:bg-white/8 dark:text-gray-300">
                      {storyboardLayout === 'vertical' ? '纵向流程' : '横向流程'}
                    </div>
                    <div className="rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                      {storyboardRuntimeSummary.hasMixedOrientation ? '混合画幅制作板' : '统一画幅制作板'}
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200/80 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/6">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">制作板信号</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {boardHealth.isLayoutRecommended
                          ? `${storyboardLayout === 'horizontal' ? '横向' : '纵向'}轨道已对齐`
                          : `建议切换为${recommendedLayout === 'horizontal' ? '横向' : '纵向'}轨道`}
                      </div>
                    </div>
                    <div className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${boardHealth.isLayoutRecommended ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100' : 'bg-amber-50 text-amber-700 dark:bg-amber-400/12 dark:text-amber-100'}`}>
                      {boardHealth.isLayoutRecommended ? '已对齐' : '有偏移'}
                    </div>
                  </div>
                  <div className={`mt-2 rounded-2xl border px-3 py-2 text-[11px] dark:bg-white/6 ${productionBoardSummary.reviewRailState === 'clean' ? 'border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-400/20 dark:text-emerald-100' : productionBoardSummary.reviewRailState === 'watch' ? 'border-amber-200/80 bg-amber-50/70 text-amber-700 dark:border-amber-400/20 dark:text-amber-100' : 'border-sky-200/80 bg-sky-50/70 text-sky-700 dark:border-sky-400/20 dark:text-sky-100'}`}>
                    <div className="uppercase tracking-[0.14em] opacity-70">审阅轨</div>
                    <div className="mt-1 font-semibold">{productionBoardSummary.reviewRailSummary}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Lead</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.dominantOrientationLabel || '混合'}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅适配</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.adaptationLabel}</div>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Density</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.boardDensityLabel}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">镜头数</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboard.length}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">布局</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardLayout === 'vertical' ? '纵向' : '横向'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅组合</div>
                    <div className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{Array.from(new Set(storyboard.map((item) => item.aspectRatio ?? '9:16'))).join(' · ')}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">渲染组合</div>
                    <div className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{Array.from(new Set(storyboard.map((item) => item.outputSize ?? getStoryboardAspectMeta(item.aspectRatio ?? '9:16').videoSize))).join(' · ')}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">细节轨道</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRenderSummary.dominantRenderProfile ? getStoryboardRenderProfileLabel(storyboardRenderSummary.dominantRenderProfile) : '待定'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">质量组合</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRenderSummary.hasMixedRenderProfiles ? '混合质量' : storyboard.length > 0 ? '统一质量' : '待定'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">总时长</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">总计 {storyboardRuntimeSummary.totalDurationSec} 秒</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">节奏</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">平均 {storyboardRuntimeSummary.averageDurationSec.toFixed(1)} 秒</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">朝向</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.dominantOrientationLabel || '混合'}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-white/6">
                    <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">批量意图</div>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{storyboard.length > 1 ? '多镜头制作板' : '单镜头制作板'}</div>
                  </div>
                  <div className="col-span-2 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-gray-200/80 bg-white/75 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅轨道</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{boardHealth.hasUnifiedAspect ? '统一' : '混合'}</div>
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{boardHealth.aspectVariants} 个变体</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200/80 bg-white/75 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">节奏轨道</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{boardHealth.hasUnifiedDuration ? '统一' : '混合'}</div>
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{boardHealth.durationVariants} 个节奏层</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200/80 bg-white/75 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">细节轨道</div>
                      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{boardHealth.hasUnifiedRenderProfile ? '统一' : '混合'}</div>
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{boardHealth.renderProfileVariants} 个质量层</div>
                    </div>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                      <span>制作板就绪度</span>
                      <span>{storyboardRuntimeSummary.hasMixedOrientation ? '自适应画幅' : '锁定画幅'}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">布局适配</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.isLayoutRecommended ? '已对齐' : '建议切换'}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅路由</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.adaptationLabel}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅变体数</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.aspectVariants}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">渲染变体数</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.renderVariants}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                      <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">{boardHealth.boardDensityLabel}</span>
                      <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">{boardHealth.lockedCount} 已锁定</span>
                      {boardHealth.croppedCount > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100">{boardHealth.croppedCount} 安全裁切</span>}
                      {boardHealth.recomposedCount > 0 && <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/12 dark:text-sky-100">{boardHealth.recomposedCount} 已重构</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">竖版</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.portraitShots}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">横版</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.landscapeShots}</div>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                        <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">方形</div>
                        <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{storyboardRuntimeSummary.squareShots}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-gray-200/80 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/6">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1.5"><Maximize2 size={12} /> 节点尺寸</span>
                        <span>{boardHealth.nodeFootprintVariants} footprint variant{boardHealth.nodeFootprintVariants > 1 ? 's' : ''}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">主导尺寸</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.dominantFootprint || '待定'}</div>
                          <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{boardHealth.dominantFootprintCount > 0 ? `${boardHealth.dominantFootprintCount} nodes` : '暂无节点尺寸'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">最大画布面</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.largestFootprint}</div>
                          <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">board 主视觉占比最高</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">最宽轨道</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.widestFootprint}</div>
                          <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">适合横向 flow 节奏</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">最高轨道</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.tallestFootprint}</div>
                          <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">适合竖向 shot queue</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {storyboardAspectSummary.length > 0 && (
                  <div className="space-y-3 rounded-2xl border border-gray-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">批量画幅预设</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">一键统一全部镜头画幅与节奏</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['9:16', '16:9', '4:5', '1:1', '4:3', '3:4', '21:9', '3:2', '2:3'] as StoryboardAspectRatio[]).map((aspectRatio) => {
                        const meta = getStoryboardAspectMeta(aspectRatio);
                        const currentCount = storyboard.filter((item) => (item.aspectRatio ?? '9:16') === aspectRatio).length;
                        return (
                          <button
                            key={aspectRatio}
                            onClick={() => onUpdateAllStoryboardAspectRatios(aspectRatio)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:bg-white/6 dark:text-gray-200 dark:hover:border-sky-400/30 dark:hover:bg-sky-400/12 dark:hover:text-sky-100"
                          >
                            {aspectRatio} · {meta.shortLabel}{currentCount > 0 ? ` · ${currentCount}` : ''}
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
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/6">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Pacing preset</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">全部镜头</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[3, 5, 8, 12].map((duration) => (
                            <button
                              key={duration}
                              onClick={() => onUpdateAllStoryboardDurations(duration)}
                              className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200 dark:hover:border-sky-400/20 dark:hover:bg-sky-400/12 dark:hover:text-sky-100"
                            >
                              {duration}s
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/6">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Detail preset</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">board aware</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(['standard', 'high'] as StoryboardRenderProfile[]).map((renderProfile) => (
                            <button
                              key={renderProfile}
                              onClick={() => onUpdateAllStoryboardRenderProfiles(renderProfile)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${renderProfile === 'high' ? 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-400/12 dark:text-violet-100 dark:hover:bg-violet-400/18' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-100 dark:hover:bg-emerald-400/18'}`}
                            >
                              {getStoryboardRenderProfileLabel(renderProfile)}
                            </button>
                          ))}
                        </div>
                        <div className="mt-2 text-[10px] leading-5 text-gray-500 dark:text-gray-400">
                          统一 detail rail 时，会在当前画幅下自动挑选对应 output size。
                        </div>
                      </div>
                      <div className="col-span-2 rounded-2xl border border-gray-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/6">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Render rails</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">自适应节点尺寸</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] leading-5 text-gray-600 dark:text-gray-300">
                          <div>• 9:16：720×1280 / 1024×1792</div>
                          <div>• 16:9：1280×720 / 1792×1024</div>
                          <div>• 4:5：1024×1280</div>
                          <div>• 1:1：1024×1024</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={onNormalizeAllStoryboardOutputSizes}
                            className="rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/15 dark:text-gray-300 dark:hover:border-sky-400/20 dark:hover:bg-sky-400/12 dark:hover:text-sky-100"
                          >
                            统一为当前画幅推荐输出
                          </button>
                        </div>
                        <div className="mt-2 text-[10px] leading-5 text-gray-500 dark:text-gray-400">
                          按每个镜头当前的 aspect + detail rail，自动回到最匹配的 output size，避免混用不合适的 render 档位。
                        </div>
                      </div>
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
                      <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">朝向组合</span>
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
                        <div className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">制作板说明</div>
                        <div className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-medium text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                          {storyboard.length > 1 ? `${storyboardLayout === 'horizontal' ? '流程带' : '镜头队列'} · ${storyboard.length} 个镜头` : '单镜头'}
                        </div>
                      </div>
                      <div className="mt-1 leading-5 text-gray-600 dark:text-gray-300">
                        {storyboardRuntimeSummary.hasMixedOrientation
                          ? '当前是混合画幅分镜流，批量落盘会保留每个镜头自己的画幅与输出尺寸。'
                          : '当前分镜画幅统一，适合直接批量落盘为一致规格的视频节点。'}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">主导画幅</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.dominantAspectLabel || '待定'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                          <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">主导细节</div>
                          <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{boardHealth.dominantRenderProfileLabel || '待定'}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">自动节点尺寸</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">逐镜头画幅记忆</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">制作板感知视频提示</span>
                        {boardHealth.dominantFootprint && <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{boardHealth.dominantFootprint} 节点轨道</span>}
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3 rounded-2xl border border-gray-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">制作板预设</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">一键统一画幅 + 质量轨道</span>
                  </div>
                  <div className="rounded-2xl border border-dashed border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] leading-5 text-gray-500 dark:border-white/10 dark:bg-white/4 dark:text-gray-400">
                    推荐优先选择与当前主导画幅更接近的预设；如果想最大程度保留原镜头构图，优先保持 <span className="font-medium text-gray-700 dark:text-gray-200">{boardHealth.lockRateLabel}</span>。
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {boardPresetCards.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => onApplyStoryboardBoardPreset(preset.id)}
                        className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_12px_32px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/6 dark:hover:border-white/15`}
                      >
                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${preset.accent} opacity-80`} />
                        <div className="relative">
                          <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">{preset.title}</div>
                          <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{preset.note}</div>
                          <div className="mt-2 inline-flex rounded-full border border-gray-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-black/20 dark:text-gray-300">{preset.aspect}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">制作板布局</span>
                    <button
                      onClick={onAutoStoryboardLayout}
                      className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/8 dark:hover:text-gray-100"
                    >
                      自动 · {recommendedLayout === 'horizontal' ? '横排' : '竖排'}
                    </button>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <div className="rounded-2xl border border-gray-200/80 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">当前轨道</div>
                      <div className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{storyboardLayout === 'horizontal' ? '横向流程' : '纵向队列'}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200/80 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                      <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">推荐轨道</div>
                      <div className="mt-1 flex items-center gap-1.5 font-semibold text-gray-800 dark:text-gray-100">
                        <span>{recommendedLayout === 'horizontal' ? '横向流程' : '纵向队列'}</span>
                        {recommendedLayout !== storyboardLayout && <ArrowRight size={12} className="text-gray-400 dark:text-gray-500" />}
                      </div>
                    </div>
                  </div>
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
                  <div className="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                    {storyboardLayout === recommendedLayout
                      ? '当前布局已经与分镜画幅结构匹配。'
                      : `建议切到${recommendedLayout === 'horizontal' ? '横排' : '竖排'}，更适合当前镜头画幅分布。`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    <span className={`rounded-full border px-2 py-1 ${boardHealth.isLayoutRecommended ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100'}`}>
                      {boardHealth.isLayoutRecommended ? '布局已对齐' : '布局有偏移'}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{boardHealth.lockedCount} 已锁定</span>
                    <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{boardHealth.remappedCount} 已重映射</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={expandAllStoryboardCards}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/6 dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <GripVertical size={15} />
                    展开全部镜头卡
                  </button>
                  <button
                    onClick={collapseAllStoryboardCards}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/6 dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    <X size={15} />
                    收起全部镜头卡
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
                <span>镜头卡</span>
                <div className="flex items-center gap-2">
                  <span>{expandedStoryboardIds.length} 个已展开</span>
                  <span>{storyboard.length} 个条目</span>
                </div>
              </div>
            )}
            {storyboard.length > 0 ? storyboard.map((item, index) => {
              const resolvedAspectRatio = item.aspectRatio ?? '9:16';
              const aspectMeta = getStoryboardAspectMeta(resolvedAspectRatio);
              const OrientationIcon = aspectMeta.orientation === 'landscape' ? RectangleHorizontal : aspectMeta.orientation === 'square' ? Square : RectangleVertical;
              const isExpanded = expandedStoryboardIds.includes(item.id);
              const resolvedOutputSize = item.outputSize ?? aspectMeta.videoSize;
              const renderProfile = item.renderProfile ?? getStoryboardRenderProfile(resolvedOutputSize);
              const sourceAspectRatio = item.sourceAspectRatio ?? resolvedAspectRatio;
              const frameDelta = getStoryboardFrameDeltaLabel(sourceAspectRatio, resolvedAspectRatio);
              const frameRoutingLabel = getStoryboardFrameRoutingLabel(sourceAspectRatio, resolvedAspectRatio);
              const coverageLabel = getStoryboardCoverageLabel(sourceAspectRatio, resolvedAspectRatio);
              const adaptationLabel = getStoryboardFrameAdaptationLabel(sourceAspectRatio, resolvedAspectRatio);
              const adaptationTone = getStoryboardFrameAdaptationTone(sourceAspectRatio, resolvedAspectRatio);
              const frameDeltaTag = frameDelta === '跟随源画幅' ? '已锁定' : `重映射 ${frameDelta}`;
              const sequenceState = storyboard.length === 1
                ? 'single'
                : index === 0
                  ? 'first'
                  : index === storyboard.length - 1
                    ? 'last'
                    : 'middle';
              const sequenceLabel = getStoryboardSequenceHint(storyboardLayout, sequenceState);
              const boardModeLabel = getStoryboardBoardMode(storyboardLayout, sequenceState);
              const nodeDimensions = getStoryboardNodeDimensions(resolvedOutputSize, resolvedAspectRatio);

              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5"
                >
                  <button
                    onClick={() => setExpandedStoryboardIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])}
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
                          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                            <GripVertical size={11} />
                            <span>{isExpanded ? '镜头卡 · 展开' : '镜头卡 · 紧凑'}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <span>镜头 {String(index + 1).padStart(2, '0')}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-white/10 dark:text-gray-300">
                              {item.type === 'image' ? '图片素材' : '视频素材'}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                              {getStoryboardOrientationLabel(aspectMeta.orientation)}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                              {resolvedOutputSize}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                          {isExpanded ? '收起细节' : '展开细节'}
                        </div>
                      </div>
                      <input
                        value={item.title}
                        onChange={(e) => onRenameStoryboardItem(item.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded-md bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:bg-gray-50 dark:text-gray-100 dark:focus:bg-white/8"
                        placeholder={`镜头 ${String(index + 1).padStart(2, '0')}`}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">{boardModeLabel}</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">{sequenceLabel}</span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 dark:border-white/10 dark:bg-white/8">{isExpanded ? '详细视图' : '快速视图'}</span>
                        <span className="rounded-full border border-dashed border-gray-300 bg-transparent px-2.5 py-1 text-gray-400 dark:border-white/15 dark:text-gray-500">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">时长</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={item.durationSec ?? 5}
                          onChange={(e) => onUpdateStoryboardDuration(item.id, Number(e.target.value || 5))}
                          onClick={(e) => e.stopPropagation()}
                          className="w-16 rounded-md border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-700 outline-none focus:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:focus:bg-white/8"
                        />
                        <span className="text-xs text-gray-400">秒</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                          adaptationTone === 'stable'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-100'
                            : adaptationTone === 'warning'
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/12 dark:text-amber-100'
                              : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/12 dark:text-sky-100'
                        }`}>
                          {adaptationLabel}
                        </span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                          {frameDeltaTag}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${renderProfile === 'high' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/12 dark:text-violet-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-100'}`}>
                          {getStoryboardRenderProfileLabel(renderProfile)}
                        </span>
                        <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/8 dark:text-gray-300">
                          {getStoryboardOrientationLabel(aspectMeta.orientation)}
                        </span>
                      </div>
                      {isExpanded ? (
                        <div className="mt-2 space-y-2">
                          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">镜头信息</div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">镜头</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">目标画幅</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.aspectRatio ?? '9:16'}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">源画幅</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅差异</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{frameDelta}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画布参考</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{aspectMeta.displaySize}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">输出尺寸</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{resolvedOutputSize}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">节点尺寸</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{nodeDimensions.width} × {nodeDimensions.height}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">制作板模式</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{boardModeLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">朝向</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{getStoryboardOrientationLabel(aspectMeta.orientation)}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">路由策略</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{frameRoutingLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">适配方式</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{adaptationLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">覆盖策略</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{coverageLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">细节轨道</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{getStoryboardRenderProfileLabel(renderProfile)}</div></div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅</span>
                            <div className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500 dark:bg-white/8 dark:text-gray-300">
                              <OrientationIcon size={12} />
                              <span>{aspectMeta.shortLabel}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                            <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                              <span>画幅路由</span>
                              <span>{item.sourceOutputSize ?? aspectMeta.videoSize} → {item.outputSize ?? aspectMeta.videoSize}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                              <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">源画幅</div>
                                <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'} · {item.sourceOutputSize ?? aspectMeta.videoSize}</div>
                              </div>
                              <div className="rounded-xl bg-gray-50 px-2.5 py-2 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">目标画幅</div>
                                <div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.aspectRatio ?? '9:16'} · {item.outputSize ?? aspectMeta.videoSize}</div>
                              </div>
                            </div>
                            <div className="mt-1 leading-5 text-gray-600 dark:text-gray-300">
                              {item.sourceAspectRatio === item.aspectRatio
                                ? '当前镜头沿用源镜头画幅，只在输出尺寸层做制作板感知适配。'
                                : `当前镜头会从 ${item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'} 重新映射到 ${item.aspectRatio ?? '9:16'}，并按对应安全尺寸生成视频节点。`}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{getStoryboardOrientationLabel((item.sourceOrientation ?? aspectMeta.orientation) as 'portrait' | 'landscape' | 'square')} · 源朝向</span>
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{getStoryboardOrientationLabel(aspectMeta.orientation)} · 目标朝向</span>
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{nodeDimensions.width}×{nodeDimensions.height}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">批量槽位</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{storyboardLayout === 'horizontal' ? `列 ${index + 1}` : `行 ${index + 1}`}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">序列</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{sequenceLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">路由策略</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{frameRoutingLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">覆盖策略</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{coverageLabel}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">制作板适配</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{storyboardLayout === recommendedLayout ? '已对齐' : '自适应'}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">朝向轨道</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{getStoryboardOrientationLabel(aspectMeta.orientation)}</div></div>
                          </div>
                          <div className="rounded-2xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                            <div className="flex items-center justify-between gap-2">
                              <span className="uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">镜头说明</span>
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/8 dark:text-gray-300">{getStoryboardOrientationLabel(aspectMeta.orientation)}</span>
                            </div>
                            <div className="mt-1">
                              当前镜头会按 <span className="font-medium text-gray-800 dark:text-gray-100">{resolvedAspectRatio}</span> / <span className="font-medium text-gray-800 dark:text-gray-100">{resolvedOutputSize}</span> 落成视频节点，并保留画幅感知；节点尺寸将落在 <span className="font-medium text-gray-800 dark:text-gray-100">{nodeDimensions.width} × {nodeDimensions.height}</span>，当前 coverage 策略为 <span className="font-medium text-gray-800 dark:text-gray-100">{coverageLabel}</span>。
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">源画幅 {item.sourceAspectRatio ?? item.aspectRatio ?? '9:16'}</span>
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">目标画幅 {item.aspectRatio ?? '9:16'}</span>
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{frameDelta === '跟随源画幅' ? '已锁定' : '已重映射'}</span>
                              <span className="rounded-full border border-gray-200 bg-white/85 px-2 py-1 dark:border-white/10 dark:bg-white/8">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅</span>
                              <select
                                value={item.aspectRatio ?? '9:16'}
                                onChange={(e) => onUpdateStoryboardAspectRatio(item.id, e.target.value as StoryboardAspectRatio)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-700 outline-none focus:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:focus:bg-white/8"
                              >
                                <option value="1:1">1:1 · 方形</option>
                                <option value="16:9">16:9 · 横版</option>
                                <option value="9:16">9:16 · 竖版</option>
                                <option value="4:3">4:3 · 经典横版</option>
                                <option value="3:4">3:4 · 经典竖版</option>
                                <option value="21:9">21:9 · 超宽银幕</option>
                                <option value="3:2">3:2 · 摄影横版</option>
                                <option value="2:3">2:3 · 摄影竖版</option>
                                <option value="4:5">4:5 · 高版</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">输出尺寸</span>
                              <select
                                value={item.outputSize ?? aspectMeta.videoSize}
                                onChange={(e) => onUpdateStoryboardOutputSize(item.id, e.target.value as StoryboardVideoSize)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-700 outline-none focus:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:focus:bg-white/8"
                              >
                                {getStoryboardVideoSizeOptions(resolvedAspectRatio).map((sizeOption) => (
                                  <option key={sizeOption} value={sizeOption}>{sizeOption}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">画幅预设</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{aspectMeta.label}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">渲染输出</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.outputSize ?? aspectMeta.videoSize}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">朝向轨道</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{getStoryboardOrientationLabel(aspectMeta.orientation)}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">源输出</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.sourceOutputSize ?? aspectMeta.videoSize}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">源朝向</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{getStoryboardOrientationLabel((item.sourceOrientation ?? aspectMeta.orientation) as 'portrait' | 'landscape' | 'square')}</div></div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/6"><div className="uppercase tracking-wide text-gray-400 dark:text-gray-500">渲染细节</div><div className="mt-1 font-medium text-gray-700 dark:text-gray-200">{renderProfile === 'high' ? '高细节轨道' : '标准轨道'}</div></div>
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
                          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">镜头信息</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:border-sky-400/20 dark:bg-sky-400/12 dark:text-sky-100">{item.aspectRatio ?? '9:16'}</span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200">{item.outputSize ?? aspectMeta.videoSize}</span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/8 dark:text-gray-200">{sequenceLabel}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                            <span className="rounded-full border border-gray-200/80 bg-white/70 px-2.5 py-1 text-gray-500 dark:border-white/10 dark:bg-white/6 dark:text-gray-400">{frameDelta}</span>
                            <span className="rounded-full border border-dashed border-gray-300 bg-transparent px-2.5 py-1 text-gray-400 dark:border-white/15 dark:text-gray-500">{String(index + 1).padStart(2, '0')} / {String(storyboard.length).padStart(2, '0')}</span>
                          </div>
                          <div className="rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] leading-5 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                              <span>镜头说明</span>
                              <span>{frameDelta === '跟随源画幅' ? '跟随源画幅' : '已重映射'}</span>
                            </div>
                            <div className="line-clamp-2">{item.sourcePrompt || `${resolvedAspectRatio} / ${resolvedOutputSize} 默认输出，节点尺寸 ${nodeDimensions.width} × ${nodeDimensions.height}，覆盖策略 ${coverageLabel}。`}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="border-t border-gray-100 p-3 dark:border-white/10">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                      <span>镜头操作</span>
                      <span>{storyboardLayout === 'horizontal' ? '流程底栏' : '队列底栏'}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-gray-50/80 px-2.5 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                      <span>{boardModeLabel}</span>
                      <span>{sequenceLabel}</span>
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
                {asset.aspectRatio && <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.aspectRatio}</span>}
                {asset.orientation && <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.orientation}</span>}
                {asset.outputSize && <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/8">{asset.outputSize}</span>}
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
