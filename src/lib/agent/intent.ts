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
const INFORMATIONAL_PATTERN = /怎么|如何|为什么|多少钱|价格|积分|成本|费用|收费|是否|有哪些|什么|能否|能不能|可不可以|建议|分析|评价|看看|看下|讲讲|解释|介绍|说明|聊聊|说说|了解|对比|比较|区别|觉得|看法|[？?]|吗$/;
const EXPLICIT_REQUEST_PATTERN = /(?:请|帮我|给我|直接|立即|现在|开始|继续|替我|为我|把|基于).{0,24}(?:生成|创建|制作|出图|渲染|画|改成|换成|加入|放到)/;
const MUTATION_PATTERN = /生成|创建|制作|出图|做图|画一|渲染|改成|换成|编辑|调成|变成|加入|添加|放到|做成|拍一|出一/;
const SPECIAL_LAYOUT_PATTERN = /九宫格|9宫格|四宫格|4宫格|25\s*宫格|二十五宫格|三视图|三面图|\/grid|\/quad|\/threeview|\/character3view/i;
const ACTION_SLASH_COMMAND_PATTERN = /^\/(?:grid9|grid|9grid|grid25|25grid|quad|grid4|character3view|threeview|3view)(?:\s|$)/i;

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

  if (ACTION_SLASH_COMMAND_PATTERN.test(raw)) return 'action';
  // A question about a model, price, image, video, or storyboard must not start a paid generation.
  if (/多少钱|价格|积分|成本|费用|收费/.test(raw)) return 'chat';
  if (INFORMATIONAL_PATTERN.test(raw) && !EXPLICIT_REQUEST_PATTERN.test(raw)) return 'chat';
  if (SPECIAL_LAYOUT_PATTERN.test(raw) && MUTATION_PATTERN.test(raw)) return 'action';

  if (hasStoryboardBoardIntent(raw)) return 'action';
  if ((hasStoryboardTarget(raw) || hasSelectedStoryboard) && hasVideoIntent(raw)) return 'action';
  if ((hasStoryboardTarget(raw) || hasSelectedStoryboard) && hasImageGenerationIntent(raw) && !hasVideoIntent(raw)) return 'action';
  if (hasStoryboardIntent(raw) && MUTATION_PATTERN.test(raw)) return 'action';
  if (hasCanvasInsertIntent(raw)) return 'action';
  if (hasEditIntent(raw)) return 'action';
  if (hasVideoIntent(raw) && MUTATION_PATTERN.test(raw)) return 'action';
  if (hasImageGenerationIntent(raw)) return 'action';

  return 'chat';
}
