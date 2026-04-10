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
}

export interface StoryboardItem {
  id: string;
  assetId: string;
  elementId: string;
  title: string;
  type: ProjectAssetType;
  thumbnailUrl: string;
  order: number;
  sourcePrompt?: string;
  createdAt: string;
}

export function normalizeStoryboardItems(items: StoryboardItem[]) {
  return items.map((item, index) => ({
    ...item,
    order: index,
  }));
}

export function useProjectAssets(elements: CanvasElement[]) {
  return useMemo<ProjectAsset[]>(() => {
    const assets = elements.reduce<ProjectAsset[]>((acc, element, index) => {
      if ((element.type !== 'image' && element.type !== 'video') || !element.content) {
        return acc;
      }

      acc.push({
        id: `${element.type}-${element.id}`,
        type: element.type,
        elementId: element.id,
        url: element.content,
        title: element.type === 'image' ? `图片 ${index + 1}` : `视频 ${index + 1}`,
        createdOrder: index,
        width: element.width,
        height: element.height,
      });

      return acc;
    }, []);

    return assets.sort((a, b) => b.createdOrder - a.createdOrder);
  }, [elements]);
}
