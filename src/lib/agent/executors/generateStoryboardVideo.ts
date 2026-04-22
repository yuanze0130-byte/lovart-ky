import type { AgentActionResult, AgentContext, GenerateStoryboardVideoAction, StoryboardVideoSize } from '@/lib/agent/actions';

function inferVideoSizeFromAspectRatio(aspectRatio?: string): StoryboardVideoSize {
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

export async function runGenerateStoryboardVideoAction(input: {
  action: GenerateStoryboardVideoAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  const explicitItemId = input.action.storyboardItemId;
  const explicitOrder = input.action.storyboardOrder;

  const target = explicitItemId
    ? input.context.storyboardItems?.find((item) => item.id === explicitItemId)
    : typeof explicitOrder === 'number'
      ? input.context.storyboardItems?.find((item) => item.order === explicitOrder - 1)
      : input.context.selectedStoryboardItemId
        ? input.context.storyboardItems?.find((item) => item.id === input.context.selectedStoryboardItemId)
        : undefined;

  if (!target) {
    throw new Error('没有找到要生成视频的 storyboard 镜头');
  }

  const basePrompt = target.sourcePrompt?.trim() || target.title?.trim() || '';
  const extraPrompt = input.action.prompt?.trim() || '';
  const finalPrompt = [basePrompt, extraPrompt ? `[镜头补充要求]\n${extraPrompt}` : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!finalPrompt) {
    throw new Error('当前镜头没有可用提示词，无法生成视频');
  }

  const size = input.action.size || target.outputSize || inferVideoSizeFromAspectRatio(target.aspectRatio);
  const durationSeconds = input.action.durationSeconds || 5;
  const mode = input.action.mode || 'standard';

  return {
    kind: 'storyboard_video_generation_requested',
    storyboardItemId: target.id,
    storyboardOrder: target.order + 1,
    title: target.title,
    prompt: finalPrompt,
    size,
    durationSeconds,
    mode,
    message: `已准备为第 ${target.order + 1} 镜生成视频`,
  };
}
