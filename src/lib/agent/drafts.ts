import { randomUUID } from 'crypto';
import type { AgentActionResult, DraftCanvasElement, DraftStoryboardItem, StoryboardAspectRatio, StoryboardVideoSize } from '@/lib/agent/actions';

export function getDefaultStoryboardVideoSize(aspectRatio: StoryboardAspectRatio): StoryboardVideoSize {
  switch (aspectRatio) {
    case '16:9':
      return '1280x720';
    case '4:5':
      return '1024x1280';
    case '1:1':
      return '1024x1024';
    case '4:3':
      return '1024x768';
    case '3:4':
      return '768x1024';
    case '21:9':
      return '1536x640';
    case '3:2':
      return '1152x768';
    case '2:3':
      return '768x1152';
    case '9:16':
    default:
      return '720x1280';
  }
}

export function getDefaultCanvasElementSize(type: 'image' | 'video', aspectRatio: StoryboardAspectRatio) {
  switch (aspectRatio) {
    case '16:9':
      return type === 'video' ? { width: 420, height: 236 } : { width: 360, height: 202 };
    case '4:5':
      return { width: 300, height: 375 };
    case '1:1':
      return { width: 320, height: 320 };
    case '4:3':
      return { width: 384, height: 288 };
    case '3:4':
      return { width: 288, height: 384 };
    case '21:9':
      return { width: 520, height: 217 };
    case '3:2':
      return { width: 432, height: 288 };
    case '2:3':
      return { width: 288, height: 432 };
    case '9:16':
    default:
      return type === 'video' ? { width: 260, height: 462 } : { width: 260, height: 462 };
  }
}

export function buildDraftStoryboardItems(options: {
  prompt: string;
  shots: number;
  aspectRatio: StoryboardAspectRatio;
}): DraftStoryboardItem[] {
  const outputSize = getDefaultStoryboardVideoSize(options.aspectRatio);
  const now = new Date().toISOString();

  return Array.from({ length: options.shots }, (_, index) => ({
    id: randomUUID(),
    title: `Shot ${index + 1}`,
    sourcePrompt: `${options.prompt} · 镜头 ${index + 1}`,
    order: index,
    durationSec: 5,
    aspectRatio: options.aspectRatio,
    outputSize,
    renderProfile: outputSize === '1024x1792' || outputSize === '1792x1024' ? 'high' : 'standard',
    createdAt: now,
  }));
}

export function buildDraftCanvasElements(options: {
  assetIds: string[];
  type: 'image' | 'video';
  contentByAssetId?: Record<string, string>;
  aspectRatio?: StoryboardAspectRatio;
}): DraftCanvasElement[] {
  const aspectRatio = options.aspectRatio || '1:1';
  const size = getDefaultCanvasElementSize(options.type, aspectRatio);

  return options.assetIds.map((assetId, index) => ({
    id: randomUUID(),
    type: options.type,
    x: 120 + index * (size.width + 24),
    y: 120,
    width: size.width,
    height: size.height,
    content: options.contentByAssetId?.[assetId] || '',
    title: `${options.type === 'video' ? 'Video' : 'Image'} ${index + 1}`,
  }));
}

export function buildStoryboardCreatedResult(prompt: string, shots: number, aspectRatio: StoryboardAspectRatio): AgentActionResult {
  const items = buildDraftStoryboardItems({ prompt, shots, aspectRatio });
  return {
    kind: 'storyboard_created',
    storyboardId: randomUUID(),
    count: items.length,
    items,
    message: `已创建 ${items.length} 个分镜草案`,
  };
}
