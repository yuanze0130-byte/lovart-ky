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

function stripPromptNoise(prompt: string) {
  return prompt
    .replace(/[，,。.!！？]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStoryboardBeats(shots: number) {
  const defaults = [
    { title: '开场定调', intent: '建立场景与气质', durationSec: 3 },
    { title: '主体亮相', intent: '让主角/主体进入画面中心', durationSec: 4 },
    { title: '细节特写', intent: '强调关键细节与材质', durationSec: 3 },
    { title: '动作推进', intent: '通过动作推动节奏', durationSec: 4 },
    { title: '氛围拉满', intent: '强化风格、光线与情绪', durationSec: 4 },
    { title: '收束落点', intent: '形成记忆点或结尾停留', durationSec: 3 },
  ];

  return Array.from({ length: shots }, (_, index) => {
    if (index < defaults.length) return defaults[index];
    return {
      title: `镜头延展 ${index + 1}`,
      intent: '补充叙事与节奏变化',
      durationSec: 3 + (index % 3),
    };
  });
}

function buildShotPrompt(basePrompt: string, beat: { title: string; intent: string }, index: number, shots: number) {
  const sequenceLabel = `第 ${index + 1}/${shots} 镜`;
  return `${sequenceLabel} · ${beat.title} · ${beat.intent} · 画面围绕「${basePrompt}」展开，保持统一世界观、主体一致性、镜头衔接与视觉节奏。`;
}

export function buildDraftStoryboardItems(options: {
  prompt: string;
  shots: number;
  aspectRatio: StoryboardAspectRatio;
}): DraftStoryboardItem[] {
  const outputSize = getDefaultStoryboardVideoSize(options.aspectRatio);
  const now = new Date().toISOString();
  const cleanedPrompt = stripPromptNoise(options.prompt);
  const beats = buildStoryboardBeats(options.shots);

  return beats.map((beat, index) => ({
    id: randomUUID(),
    title: `${String(index + 1).padStart(2, '0')} · ${beat.title}`,
    sourcePrompt: buildShotPrompt(cleanedPrompt || options.prompt, beat, index, options.shots),
    order: index,
    durationSec: beat.durationSec,
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
  const totalDuration = items.reduce((sum, item) => sum + item.durationSec, 0);
  return {
    kind: 'storyboard_created',
    storyboardId: randomUUID(),
    count: items.length,
    items,
    message: `已创建 ${items.length} 个分镜草案，总时长约 ${totalDuration}s`,
  };
}
