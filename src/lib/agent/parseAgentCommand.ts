import type { AgentAction, AgentContext, StoryboardAspectRatio, StoryboardVideoSize } from '@/lib/agent/actions';

const ASPECT_RATIOS: StoryboardAspectRatio[] = ['9:16', '16:9', '4:5', '1:1', '4:3', '3:4', '21:9', '3:2', '2:3'];
const VIDEO_SIZES: StoryboardVideoSize[] = ['720x1280', '1280x720', '1024x1280', '1024x1024', '1024x1792', '1792x1024', '1024x768', '768x1024', '1536x640', '1152x768', '768x1152'];

function normalizePrompt(message: string) {
  return message
    .replace(/帮我|请|给我|做一个|做一组|生成一下|生成一组/g, ' ')
    .replace(/加到当前画布|加到画布|放进当前项目|放进项目/g, ' ')
    .replace(/做成短视频|生成视频版本|生成一个视频版本/g, ' ')
    .replace(/分镜|storyboard|镜头/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCount(message: string, fallback = 4) {
  const match = message.match(/(\d+)\s*(张|个|组|镜)/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractShots(message: string, fallback = 6) {
  const match = message.match(/(\d+)\s*(镜|个镜头|个分镜|条分镜)/);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractAspectRatio(message: string): StoryboardAspectRatio | undefined {
  return ASPECT_RATIOS.find((ratio) => message.includes(ratio));
}

function extractVideoSize(message: string): StoryboardVideoSize | undefined {
  return VIDEO_SIZES.find((size) => message.includes(size));
}

function inferVideoSizeFromAspectRatio(aspectRatio?: StoryboardAspectRatio): StoryboardVideoSize | undefined {
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

export async function parseAgentCommand(input: {
  message: string;
  context: AgentContext;
  userId: string;
}): Promise<AgentAction> {
  const raw = input.message.trim();
  const lower = raw.toLowerCase();
  const aspectRatio = extractAspectRatio(raw);

  if (/制作板|production board|展开.*分镜|分镜.*展开|生成.*板|创建.*板/.test(raw)) {
    return {
      type: 'create_storyboard_board',
    };
  }

  if (/分镜|storyboard|镜头/.test(raw)) {
    return {
      type: 'create_storyboard',
      prompt: normalizePrompt(raw) || raw,
      shots: extractShots(raw, 6),
      aspectRatio: aspectRatio || '9:16',
    };
  }

  if (/加到画布|加进画布|加入画布|放到画布|放进项目|加到项目/.test(raw)) {
    return {
      type: 'add_to_canvas',
      assetIds: input.context.assetIds || [],
      target: input.context.selectedStoryboardItemId ? 'storyboard_item' : 'canvas',
    };
  }

  if (/改成|换成|编辑|调成|变成/.test(raw)) {
    return {
      type: 'edit_selected_image',
      prompt: normalizePrompt(raw) || raw,
      selectedElementId: input.context.selectedElementId || undefined,
      aspectRatio: aspectRatio || '1:1',
    };
  }

  if (/视频|video/.test(lower)) {
    const size = extractVideoSize(raw) || inferVideoSizeFromAspectRatio(aspectRatio);
    return {
      type: 'generate_video',
      prompt: normalizePrompt(raw) || raw,
      durationSeconds: 5,
      size,
      mode: /fast|快速/.test(raw) ? 'fast' : 'standard',
    };
  }

  return {
    type: 'generate_images',
    prompt: normalizePrompt(raw) || raw,
    count: extractCount(raw, 4),
    aspectRatio: aspectRatio || '1:1',
    addToProject: Boolean(input.context.projectId),
  };
}
