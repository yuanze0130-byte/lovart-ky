import type { NextRequest } from 'next/server';
import type { GenerateImagesAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';

type GenerateImageApiResult = {
  imageData?: string;
  error?: string;
};

export async function runGenerateImagesAction(input: {
  request: NextRequest;
  action: GenerateImagesAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  const count = Math.max(1, Math.min(input.action.count || 1, 6));
  const images: Array<{ assetId: string; imageData: string; prompt: string }> = [];

  for (let index = 0; index < count; index += 1) {
    const result = await callInternalJson<GenerateImageApiResult>(input.request, '/api/generate-image', {
      prompt: input.action.prompt,
      resolution: '1K',
      aspectRatio: input.action.aspectRatio || '1:1',
      modelVariant: 'pro',
      editMode: 'generate',
    });

    if (!result.imageData) {
      throw new Error(result.error || '图片生成失败');
    }

    images.push({
      assetId: `agent-img-${index + 1}-${Date.now()}`,
      imageData: result.imageData,
      prompt: input.action.prompt,
    });
  }

  return {
    kind: 'images_generated',
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    message: `已生成 ${images.length} 张候选图`,
  };
}
