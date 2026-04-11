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
  sourceAspectRatio?: StoryboardAspectRatio;
  sourceOrientation?: StoryboardOrientation;
  sourceOutputSize?: StoryboardVideoSize;
  createdAt: string;
}

export type StoryboardLayoutMode = 'vertical' | 'horizontal';
export type StoryboardOrientation = 'portrait' | 'landscape' | 'square';
export type StoryboardVideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024';

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
        label: '竖版',
        shortLabel: 'Portrait',
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

export function normalizeStoryboardItems(items: StoryboardItem[]) {
  return items.map((item, index) => {
    const aspectRatio = item.aspectRatio ?? inferStoryboardAspectRatio(undefined, undefined);
    const aspectMeta = getStoryboardAspectMeta(aspectRatio);

    const resolvedOrientation = item.orientation ?? aspectMeta.orientation;
    const resolvedOutputSize = item.outputSize ?? aspectMeta.videoSize;

    return {
      ...item,
      title: item.title || `Shot ${String(index + 1).padStart(2, '0')}`,
      durationSec: item.durationSec ?? 5,
      aspectRatio,
      orientation: resolvedOrientation,
      outputSize: resolvedOutputSize,
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
