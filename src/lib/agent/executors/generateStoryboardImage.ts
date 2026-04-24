import type { AgentActionResult, AgentContext, GenerateStoryboardImageAction, StoryboardAspectRatio } from '@/lib/agent/actions';

function resolveAspectRatio(value?: StoryboardAspectRatio): StoryboardAspectRatio {
  return value || '9:16';
}

export async function runGenerateStoryboardImageAction(input: {
  action: GenerateStoryboardImageAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  const storyboardItems = input.context.storyboardItems || [];

  const target = input.action.storyboardItemId
    ? storyboardItems.find((item) => item.id === input.action.storyboardItemId)
    : typeof input.action.storyboardOrder === 'number'
      ? storyboardItems.find((item) => item.order === input.action.storyboardOrder! - 1)
      : undefined;

  if (!target) {
    throw new Error('没有找到要生成图片的 storyboard 镜头');
  }

  const resolvedAspectRatio = resolveAspectRatio(input.action.aspectRatio || target.aspectRatio);
  const basePrompt = (target.sourcePrompt || target.title || '').trim();
  const extraPrompt = (input.action.prompt || '').trim();
  const finalPrompt = extraPrompt && extraPrompt !== basePrompt
    ? `${basePrompt}\n\n[镜头补充要求]\n${extraPrompt}`.trim()
    : basePrompt || extraPrompt;

  if (!finalPrompt) {
    throw new Error('当前镜头没有可用提示词，无法生成图片');
  }

  return {
    kind: 'storyboard_image_generation_requested',
    storyboardItemId: target.id,
    storyboardOrder: target.order + 1,
    title: target.title,
    prompt: finalPrompt,
    aspectRatio: resolvedAspectRatio,
    resolution: '1K',
    modelVariant: 'pro',
    message: `已准备为第 ${target.order + 1} 镜生成图片`,
  };
}
