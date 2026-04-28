import type { AgentContext } from '@/lib/agent/actions';

export type AgentIntent = 'chat' | 'action';

const STORYBOARD_BOARD_PATTERN = /制作板|production board|展开.*分镜|分镜.*展开|生成.*板|创建.*板/;
const STORYBOARD_TARGET_PATTERN = /第\s*\d+\s*(镜|个镜头|条分镜|格|张)/;
const VIDEO_PATTERN = /视频|video/;
const IMAGE_GENERATION_PATTERN = /生成|出图|做图|画一下|画一张|做一张|渲染|封面候选/;
const STORYBOARD_PATTERN = /分镜|storyboard|镜头/;
const CANVAS_INSERT_PATTERN = /加到画布|加进画布|加入画布|放到画布|放进项目|加到项目/;
const EDIT_PATTERN = /改成|换成|编辑|调成|变成/;
const IMAGE_COUNT_PATTERN = /生成\s*\d+/;

export function hasStoryboardBoardIntent(message: string) {
  return STORYBOARD_BOARD_PATTERN.test(message.trim());
}

export function hasStoryboardTarget(message: string) {
  return STORYBOARD_TARGET_PATTERN.test(message.trim());
}

export function hasVideoIntent(message: string) {
  return VIDEO_PATTERN.test(message.trim().toLowerCase());
}

export function hasImageGenerationIntent(message: string) {
  const raw = message.trim();
  return IMAGE_GENERATION_PATTERN.test(raw) || IMAGE_COUNT_PATTERN.test(raw);
}

export function hasStoryboardIntent(message: string) {
  return STORYBOARD_PATTERN.test(message.trim());
}

export function hasCanvasInsertIntent(message: string) {
  return CANVAS_INSERT_PATTERN.test(message.trim());
}

export function hasEditIntent(message: string) {
  return EDIT_PATTERN.test(message.trim());
}

export function classifyAgentIntent(input: { message: string; context?: AgentContext | null }): AgentIntent {
  const raw = input.message.trim();
  const hasSelectedStoryboard = Boolean(input.context?.selectedStoryboardItemId);

  if (hasStoryboardBoardIntent(raw)) return 'action';
  if ((hasStoryboardTarget(raw) || hasSelectedStoryboard) && hasVideoIntent(raw)) return 'action';
  if ((hasStoryboardTarget(raw) || hasSelectedStoryboard) && hasImageGenerationIntent(raw) && !hasVideoIntent(raw)) return 'action';
  if (hasStoryboardIntent(raw)) return 'action';
  if (hasCanvasInsertIntent(raw)) return 'action';
  if (hasEditIntent(raw)) return 'action';
  if (hasVideoIntent(raw)) return 'action';
  if (hasImageGenerationIntent(raw)) return 'action';

  return 'chat';
}
