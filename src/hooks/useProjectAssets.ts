import { useMemo } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

export type ProjectAssetType = 'image' | 'video';

export interface ProjectAsset {
  id: string;
  type: ProjectAssetType;
  elementId: string;
  url: string;
  title: string;
  createdOrder: number;
  prompt?: string;
  width?: number;
  height?: number;
  aspectRatio?: StoryboardAspectRatio;
  orientation?: StoryboardOrientation;
  outputSize?: StoryboardVideoSize;
}

export type StoryboardAspectRatio = '9:16' | '16:9' | '4:5' | '1:1';

export interface StoryboardItem {
  id: string;
  assetId: string;
  elementId: string;
  title: string;
  type: ProjectAssetType;
  thumbnailUrl: string;
  order: number;
  sourcePrompt?: string;
  durationSec?: number;
  aspectRatio?: StoryboardAspectRatio;
  orientation?: StoryboardOrientation;
  outputSize?: StoryboardVideoSize;
  renderProfile?: StoryboardRenderProfile;
  sourceAspectRatio?: StoryboardAspectRatio;
  sourceOrientation?: StoryboardOrientation;
  sourceOutputSize?: StoryboardVideoSize;
  createdAt: string;
}

export type StoryboardLayoutMode = 'vertical' | 'horizontal';
export type StoryboardOrientation = 'portrait' | 'landscape' | 'square';
export type StoryboardVideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024';
export type StoryboardRenderProfile = 'standard' | 'high';

export const STORYBOARD_VIDEO_SIZE_OPTIONS: Record<StoryboardAspectRatio, StoryboardVideoSize[]> = {
  '9:16': ['720x1280', '1024x1792'],
  '16:9': ['1280x720', '1792x1024'],
  '4:5': ['1024x1280'],
  '1:1': ['1024x1024'],
};

export function getStoryboardVideoSizeOptions(aspectRatio: StoryboardAspectRatio): StoryboardVideoSize[] {
  return STORYBOARD_VIDEO_SIZE_OPTIONS[aspectRatio];
}

export function getStoryboardRenderProfile(outputSize: StoryboardVideoSize): StoryboardRenderProfile {
  return outputSize === '1024x1792' || outputSize === '1792x1024' ? 'high' : 'standard';
}

export function getStoryboardRenderProfileLabel(renderProfile: StoryboardRenderProfile) {
  return renderProfile === 'high' ? 'High detail' : 'Standard detail';
}

export function formatStoryboardMeta(
  aspectRatio: StoryboardAspectRatio,
  durationSec: number,
  renderProfile: StoryboardRenderProfile,
) {
  const aspectMeta = getStoryboardAspectMeta(aspectRatio);
  return `${aspectRatio} · ${aspectMeta.label} · ${durationSec}s · ${getStoryboardRenderProfileLabel(renderProfile)}`;
}

export function getStoryboardBoardMode(
  layoutMode: StoryboardLayoutMode,
  sequenceState: 'single' | 'first' | 'middle' | 'last' = 'single',
) {
  return layoutMode === 'horizontal'
    ? (sequenceState === 'single' ? 'Single Board' : 'Storyboard Flow')
    : 'Shot Queue';
}

export function getStoryboardSequenceHint(
  layoutMode: StoryboardLayoutMode,
  sequenceState: 'single' | 'first' | 'middle' | 'last' = 'single',
) {
  if (sequenceState === 'single') return 'Single';
  if (sequenceState === 'first') return layoutMode === 'horizontal' ? 'Start →' : 'Head ↓';
  if (sequenceState === 'last') return 'End';
  return layoutMode === 'horizontal' ? 'Next →' : 'Queue ↓';
}

export function getStoryboardFrameDeltaLabel(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  if (sourceAspectRatio === currentAspectRatio) {
    return 'Follow source';
  }

  return `${sourceAspectRatio} → ${currentAspectRatio}`;
}

export function getStoryboardFrameRoutingLabel(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  return sourceAspectRatio === currentAspectRatio ? 'Source locked' : 'Aspect remap';
}

export function getStoryboardCoverageLabel(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  if (sourceAspectRatio === currentAspectRatio) {
    return 'Coverage locked';
  }

  const sourceOrientation = getStoryboardOrientation(sourceAspectRatio);
  const currentOrientation = getStoryboardOrientation(currentAspectRatio);

  if (sourceOrientation === currentOrientation) {
    return 'Safe crop';
  }

  return currentOrientation === 'landscape' ? 'Recompose wide' : currentOrientation === 'square' ? 'Center recrop' : 'Recompose tall';
}

export function getStoryboardFrameAdaptationState(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  if (sourceAspectRatio === currentAspectRatio) {
    return 'locked' as const;
  }

  const sourceOrientation = getStoryboardOrientation(sourceAspectRatio);
  const currentOrientation = getStoryboardOrientation(currentAspectRatio);

  if (sourceOrientation === currentOrientation) {
    return 'cropped' as const;
  }

  return 'recomposed' as const;
}

export function getStoryboardFrameAdaptationLabel(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  const state = getStoryboardFrameAdaptationState(sourceAspectRatio, currentAspectRatio);

  switch (state) {
    case 'cropped':
      return 'Safe crop';
    case 'recomposed':
      return 'Recomposed';
    case 'locked':
    default:
      return 'Source locked';
  }
}

export function getStoryboardFrameAdaptationTone(
  sourceAspectRatio: StoryboardAspectRatio,
  currentAspectRatio: StoryboardAspectRatio,
) {
  const state = getStoryboardFrameAdaptationState(sourceAspectRatio, currentAspectRatio);

  switch (state) {
    case 'cropped':
      return 'warning' as const;
    case 'recomposed':
      return 'accent' as const;
    case 'locked':
    default:
      return 'stable' as const;
  }
}

export function summarizeStoryboardNodeSizing(items: Array<Pick<StoryboardItem, 'aspectRatio' | 'outputSize'>>) {
  const normalized = items.map((item) => {
    const aspectRatio = item.aspectRatio ?? '9:16';
    const outputSize = item.outputSize ?? getStoryboardAspectMeta(aspectRatio).videoSize;
    const nodeDimensions = getStoryboardNodeDimensions(outputSize, aspectRatio);

    return {
      aspectRatio,
      outputSize,
      orientation: getStoryboardAspectMeta(aspectRatio).orientation,
      width: nodeDimensions.width,
      height: nodeDimensions.height,
      footprint: `${nodeDimensions.width} × ${nodeDimensions.height}`,
      area: nodeDimensions.width * nodeDimensions.height,
    };
  });

  const footprintCounts = normalized.reduce<Record<string, number>>((acc, item) => {
    acc[item.footprint] = (acc[item.footprint] ?? 0) + 1;
    return acc;
  }, {});

  const dominantFootprintEntry = Object.entries(footprintCounts)
    .reduce((best, current) => current[1] > best[1] ? current : best, ['', 0] as [string, number]);

  const widest = normalized.reduce((best, current) => current.width > best.width ? current : best, {
    width: 0,
    height: 0,
    footprint: '0 × 0',
    area: 0,
    aspectRatio: '9:16' as StoryboardAspectRatio,
    outputSize: '720x1280' as StoryboardVideoSize,
    orientation: 'portrait' as StoryboardOrientation,
  });

  const tallest = normalized.reduce((best, current) => current.height > best.height ? current : best, {
    width: 0,
    height: 0,
    footprint: '0 × 0',
    area: 0,
    aspectRatio: '9:16' as StoryboardAspectRatio,
    outputSize: '720x1280' as StoryboardVideoSize,
    orientation: 'portrait' as StoryboardOrientation,
  });

  const largestArea = normalized.reduce((best, current) => current.area > best.area ? current : best, {
    width: 0,
    height: 0,
    footprint: '0 × 0',
    area: 0,
    aspectRatio: '9:16' as StoryboardAspectRatio,
    outputSize: '720x1280' as StoryboardVideoSize,
    orientation: 'portrait' as StoryboardOrientation,
  });

  return {
    total: normalized.length,
    uniqueFootprints: new Set(normalized.map((item) => item.footprint)).size,
    footprintCounts,
    dominantFootprint: dominantFootprintEntry[1] > 0 ? dominantFootprintEntry[0] : null,
    dominantFootprintCount: dominantFootprintEntry[1],
    widest,
    tallest,
    largestArea,
  };
}

export function summarizeStoryboardBatchHealth(items: Array<Pick<StoryboardItem, 'aspectRatio' | 'outputSize' | 'durationSec' | 'renderProfile' | 'sourceAspectRatio'>>) {
  const normalized = items.map((item) => {
    const aspectRatio = item.aspectRatio ?? '9:16';
    const outputSize = item.outputSize ?? getStoryboardAspectMeta(aspectRatio).videoSize;
    const renderProfile = item.renderProfile ?? getStoryboardRenderProfile(outputSize);
    const durationSec = item.durationSec ?? 5;
    const sourceAspectRatio = item.sourceAspectRatio ?? aspectRatio;

    return {
      aspectRatio,
      outputSize,
      renderProfile,
      durationSec,
      sourceAspectRatio,
      orientation: getStoryboardAspectMeta(aspectRatio).orientation,
      adaptationState: getStoryboardFrameAdaptationState(sourceAspectRatio, aspectRatio),
    };
  });

  const uniqueAspects = new Set(normalized.map((item) => item.aspectRatio)).size;
  const uniqueOutputs = new Set(normalized.map((item) => item.outputSize)).size;
  const uniqueDurations = new Set(normalized.map((item) => item.durationSec)).size;
  const uniqueProfiles = new Set(normalized.map((item) => item.renderProfile)).size;
  const orientationSet = new Set(normalized.map((item) => item.orientation));
  const lockedCount = normalized.filter((item) => item.adaptationState === 'locked').length;
  const croppedCount = normalized.filter((item) => item.adaptationState === 'cropped').length;
  const recomposedCount = normalized.filter((item) => item.adaptationState === 'recomposed').length;
  const adaptiveCount = croppedCount + recomposedCount;
  const orientationCounts = normalized.reduce<Record<StoryboardOrientation, number>>((acc, item) => {
    acc[item.orientation] += 1;
    return acc;
  }, {
    portrait: 0,
    landscape: 0,
    square: 0,
  });
  const aspectCounts = normalized.reduce<Record<StoryboardAspectRatio, number>>((acc, item) => {
    acc[item.aspectRatio] += 1;
    return acc;
  }, {
    '9:16': 0,
    '16:9': 0,
    '4:5': 0,
    '1:1': 0,
  });
  const renderProfileCounts = normalized.reduce<Record<StoryboardRenderProfile, number>>((acc, item) => {
    acc[item.renderProfile] += 1;
    return acc;
  }, {
    standard: 0,
    high: 0,
  });
  const dominantOrientation = (Object.entries(orientationCounts) as Array<[StoryboardOrientation, number]>)
    .reduce((best, current) => current[1] > best[1] ? current : best, ['portrait', 0] as [StoryboardOrientation, number]);
  const dominantAspectRatio = (Object.entries(aspectCounts) as Array<[StoryboardAspectRatio, number]>)
    .reduce((best, current) => current[1] > best[1] ? current : best, ['9:16', 0] as [StoryboardAspectRatio, number]);
  const dominantRenderProfile = (Object.entries(renderProfileCounts) as Array<[StoryboardRenderProfile, number]>)
    .reduce((best, current) => current[1] > best[1] ? current : best, ['standard', 0] as [StoryboardRenderProfile, number]);
  const dominantAspectMeta = dominantAspectRatio[1] > 0 ? getStoryboardAspectMeta(dominantAspectRatio[0]) : null;
  const lockRate = normalized.length > 0 ? lockedCount / normalized.length : 0;

  return {
    total: normalized.length,
    uniqueAspects,
    uniqueOutputs,
    uniqueDurations,
    uniqueProfiles,
    lockedCount,
    croppedCount,
    recomposedCount,
    adaptiveCount,
    lockRate,
    lockRateLabel: `${Math.round(lockRate * 100)}% source locked`,
    hasMixedOrientation: orientationSet.size > 1,
    orientationCount: orientationSet.size,
    orientationCounts,
    aspectCounts,
    renderProfileCounts,
    dominantOrientation: dominantOrientation[1] > 0 ? dominantOrientation[0] : null,
    dominantOrientationLabel: dominantOrientation[1] > 0 ? getStoryboardOrientationLabel(dominantOrientation[0]) : null,
    dominantAspectRatio: dominantAspectRatio[1] > 0 ? dominantAspectRatio[0] : null,
    dominantAspectLabel: dominantAspectMeta ? `${dominantAspectRatio[0]} · ${dominantAspectMeta.shortLabel}` : null,
    dominantRenderProfile: dominantRenderProfile[1] > 0 ? dominantRenderProfile[0] : null,
    dominantRenderProfileLabel: dominantRenderProfile[1] > 0 ? getStoryboardRenderProfileLabel(dominantRenderProfile[0]) : null,
    adaptationLabel: adaptiveCount === 0 ? 'Fully locked' : recomposedCount > 0 ? 'Adaptive reframe' : 'Safe crop mix',
    boardDensityLabel: normalized.length >= 8 ? 'Dense board' : normalized.length >= 4 ? 'Balanced board' : normalized.length >= 2 ? 'Light board' : 'Single shot',
  };
}

export function getPreferredStoryboardVideoSize(
  aspectRatio: StoryboardAspectRatio,
  preferredRenderProfile: StoryboardRenderProfile = 'standard',
): StoryboardVideoSize {
  const options = getStoryboardVideoSizeOptions(aspectRatio);
  const matched = options.find((option) => getStoryboardRenderProfile(option) === preferredRenderProfile);
  return matched ?? options[0];
}

export function getStoryboardNodeDimensions(outputSize: StoryboardVideoSize, aspectRatio?: StoryboardAspectRatio) {
  const dimensionOverrides: Record<StoryboardVideoSize, { width: number; height: number }> = {
    '1024x1792': { width: 284, height: 500 },
    '1792x1024': { width: 460, height: 262 },
    '1024x1280': { width: 300, height: 375 },
    '1024x1024': { width: 320, height: 320 },
    '720x1280': { width: 260, height: 462 },
    '1280x720': { width: 420, height: 236 },
  };

  if (dimensionOverrides[outputSize]) {
    return dimensionOverrides[outputSize];
  }

  const fallbackMeta = getStoryboardAspectMeta(aspectRatio ?? inferStoryboardAspectRatioFromVideoSize(outputSize) ?? '9:16');
  return {
    width: fallbackMeta.canvasWidth,
    height: fallbackMeta.canvasHeight,
  };
}

export function inferStoryboardAspectRatioFromVideoSize(size?: string): StoryboardAspectRatio | null {
  switch (size) {
    case '1280x720':
    case '1792x1024':
      return '16:9';
    case '1024x1280':
      return '4:5';
    case '1024x1024':
      return '1:1';
    case '720x1280':
    case '1024x1792':
      return '9:16';
    default:
      return null;
  }
}

export function inferStoryboardAspectRatio(width?: number, height?: number): StoryboardAspectRatio {
  if (!width || !height) return '9:16';

  const ratio = width / height;
  const candidates: Array<{ value: StoryboardAspectRatio; ratio: number }> = [
    { value: '9:16', ratio: 9 / 16 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '4:5', ratio: 4 / 5 },
    { value: '1:1', ratio: 1 },
  ];

  return candidates.reduce((best, current) => {
    const bestDelta = Math.abs(best.ratio - ratio);
    const currentDelta = Math.abs(current.ratio - ratio);
    return currentDelta < bestDelta ? current : best;
  }).value;
}

export function getStoryboardOrientation(aspectRatio: StoryboardAspectRatio): StoryboardOrientation {
  if (aspectRatio === '1:1') return 'square';
  return aspectRatio === '16:9' ? 'landscape' : 'portrait';
}

export function getStoryboardOrientationLabel(orientation: StoryboardOrientation) {
  switch (orientation) {
    case 'landscape':
      return 'Landscape';
    case 'square':
      return 'Square';
    case 'portrait':
    default:
      return 'Portrait';
  }
}

export function getStoryboardAspectMeta(aspectRatio: StoryboardAspectRatio) {
  switch (aspectRatio) {
    case '16:9':
      return {
        label: '横版',
        shortLabel: 'Landscape',
        orientation: 'landscape' as const,
        frameClass: 'aspect-[16/9]',
        displaySize: '420 × 236',
        canvasWidth: 420,
        canvasHeight: 236,
        videoSize: '1280x720' as StoryboardVideoSize,
      };
    case '4:5':
      return {
        label: '海报',
        shortLabel: 'Tall',
        orientation: 'portrait' as const,
        frameClass: 'aspect-[4/5]',
        displaySize: '300 × 375',
        canvasWidth: 300,
        canvasHeight: 375,
        videoSize: '1024x1280' as StoryboardVideoSize,
      };
    case '1:1':
      return {
        label: '方形',
        shortLabel: 'Square',
        orientation: 'square' as const,
        frameClass: 'aspect-square',
        displaySize: '320 × 320',
        canvasWidth: 320,
        canvasHeight: 320,
        videoSize: '1024x1024' as StoryboardVideoSize,
      };
    case '9:16':
    default:
      return {
        label: '竖版',
        shortLabel: 'Portrait',
        orientation: 'portrait' as const,
        frameClass: 'aspect-[9/16]',
        displaySize: '260 × 462',
        canvasWidth: 260,
        canvasHeight: 462,
        videoSize: '720x1280' as StoryboardVideoSize,
      };
  }
}

export function summarizeProductionBoard(items: Array<Pick<StoryboardItem, 'aspectRatio' | 'outputSize' | 'durationSec' | 'renderProfile' | 'sourceAspectRatio'>>) {
  const health = summarizeStoryboardBatchHealth(items);
  const sizing = summarizeStoryboardNodeSizing(items);
  const recommendedLayout = getRecommendedStoryboardLayout(items);

  const frameSummary = Array.from(new Set(items.map((item) => {
    const aspectRatio = item.aspectRatio ?? '9:16';
    const outputSize = item.outputSize ?? getStoryboardAspectMeta(aspectRatio).videoSize;
    return `${aspectRatio} / ${outputSize}`;
  }))).join(' · ');

  const durationSummary = Array.from(new Set(items.map((item) => `${item.durationSec ?? 5}s`))).join(' · ');
  const renderSummary = Array.from(new Set(items.map((item) => getStoryboardRenderProfileLabel(item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? getStoryboardAspectMeta(item.aspectRatio ?? '9:16').videoSize))))).join(' · ');
  const laneSummary = [
    health.orientationCounts.portrait > 0 ? `Portrait lane ${health.orientationCounts.portrait}` : null,
    health.orientationCounts.landscape > 0 ? `Landscape lane ${health.orientationCounts.landscape}` : null,
    health.orientationCounts.square > 0 ? `Square lane ${health.orientationCounts.square}` : null,
  ].filter(Boolean).join(' · ') || 'Single lane';

  const driftSummary = health.hasMixedOrientation
    ? `Mixed lanes · ${health.lockRateLabel}`
    : `Single lane · ${health.lockRateLabel}`;

  return {
    ...health,
    ...sizing,
    recommendedLayout,
    frameSummary,
    durationSummary,
    renderSummary,
    laneSummary,
    driftSummary,
    coverageSummary: health.adaptiveCount > 0
      ? `${health.lockedCount} locked · ${health.adaptiveCount} adaptive`
      : 'All source locked',
    boardTitle: recommendedLayout === 'horizontal' ? 'Production Board · Horizontal Flow' : 'Production Board · Vertical Queue',
    boardSubtitle: `${health.boardDensityLabel} · ${health.adaptationLabel} · ${health.dominantAspectLabel ?? 'Mixed frame'}`,
  };
}

export function getRecommendedStoryboardLayout(items: Array<Pick<StoryboardItem, 'aspectRatio' | 'outputSize'>>): StoryboardLayoutMode {
  if (items.length <= 1) return 'vertical';

  const nodeSizes = items.map((item) => {
    const aspectRatio = item.aspectRatio ?? '9:16';
    const outputSize = item.outputSize ?? getStoryboardAspectMeta(aspectRatio).videoSize;
    return getStoryboardNodeDimensions(outputSize, aspectRatio);
  });

  const landscapeCount = items.filter((item) => getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation === 'landscape').length;
  const horizontalWidth = nodeSizes.reduce((sum, size) => sum + size.width, 0);
  const verticalHeight = nodeSizes.reduce((sum, size) => sum + size.height, 0);
  const averageWidth = horizontalWidth / nodeSizes.length;
  const averageHeight = verticalHeight / nodeSizes.length;

  if (landscapeCount >= Math.ceil(items.length / 2)) return 'horizontal';
  if (averageWidth >= averageHeight * 1.08) return 'horizontal';
  return 'vertical';
}

export function normalizeStoryboardItems(items: StoryboardItem[]) {
  return items.map((item, index) => {
    const aspectRatio = item.aspectRatio ?? inferStoryboardAspectRatio(undefined, undefined);
    const aspectMeta = getStoryboardAspectMeta(aspectRatio);

    const resolvedOrientation = item.orientation ?? aspectMeta.orientation;
    const resolvedRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? aspectMeta.videoSize);
    const resolvedOutputSize = item.outputSize ?? getPreferredStoryboardVideoSize(aspectRatio, resolvedRenderProfile);

    return {
      ...item,
      title: item.title || `Shot ${String(index + 1).padStart(2, '0')}`,
      durationSec: item.durationSec ?? 5,
      aspectRatio,
      orientation: resolvedOrientation,
      outputSize: resolvedOutputSize,
      renderProfile: resolvedRenderProfile,
      sourceAspectRatio: item.sourceAspectRatio ?? aspectRatio,
      sourceOrientation: item.sourceOrientation ?? resolvedOrientation,
      sourceOutputSize: item.sourceOutputSize ?? resolvedOutputSize,
      order: index,
    };
  });
}

function extractStoryboardPromptMeta(prompt?: string) {
  if (!prompt) return null;

  const parts = prompt.split('｜').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const instructionPrefixes = [
    '输出画幅请保持',
    '请基于这张分镜参考图生成',
    '请基于这个分镜片段继续生成',
  ];

  const briefParts = parts
    .slice(3)
    .filter((part) => !instructionPrefixes.some((prefix) => part.startsWith(prefix)));

  return {
    shotLabel: parts[0],
    title: parts[1],
    meta: parts[2],
    brief: briefParts.join('｜') || undefined,
  };
}

export function useProjectAssets(elements: CanvasElement[]) {
  return useMemo<ProjectAsset[]>(() => {
    const assets = elements.reduce<ProjectAsset[]>((acc, element, index) => {
      if ((element.type !== 'image' && element.type !== 'video') || !element.content) {
        return acc;
      }

      const promptMeta = extractStoryboardPromptMeta(typeof element.prompt === 'string' ? element.prompt : undefined);
      const inferredAspectRatio = element.storyboardAspectRatio
        || inferStoryboardAspectRatioFromVideoSize(typeof element.storyboardVideoSize === 'string' ? element.storyboardVideoSize : undefined)
        || inferStoryboardAspectRatioFromVideoSize(typeof element.content === 'string' ? element.content : undefined)
        || inferStoryboardAspectRatio(element.width, element.height);
      const aspectMeta = getStoryboardAspectMeta(inferredAspectRatio);
      const fallbackTitle = element.type === 'image' ? `图片 ${index + 1}` : `视频 ${index + 1}`;

      acc.push({
        id: `${element.type}-${element.id}`,
        type: element.type,
        elementId: element.id,
        url: element.content,
        title: element.storyboardTitle || promptMeta?.title || promptMeta?.shotLabel || fallbackTitle,
        createdOrder: index,
        prompt: element.storyboardBrief || promptMeta?.brief,
        width: element.width,
        height: element.height,
        aspectRatio: inferredAspectRatio,
        orientation: element.storyboardOrientation || aspectMeta.orientation,
        outputSize: element.storyboardVideoSize || aspectMeta.videoSize,
      });

      return acc;
    }, []);

    return assets.sort((a, b) => b.createdOrder - a.createdOrder);
  }, [elements]);
}
