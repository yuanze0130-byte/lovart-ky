import type { NextRequest } from 'next/server';
import type { EditSelectedImageAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { runGenerateImagesAction } from '@/lib/agent/executors/generateImages';
import { serializeAnnotationPrompt, type AnnotationObject } from '@/lib/object-annotation';

export async function runEditSelectedImageAction(input: {
  request: NextRequest;
  action: EditSelectedImageAction;
  context: AgentContext;
  userId: string;
}): Promise<AgentActionResult> {
  if (!input.context.selectedImage) {
    throw new Error('当前未选中图片，无法执行编辑');
  }

  const selectedObject: AnnotationObject | null = input.context.selectedObject?.id
    ? {
        id: input.context.selectedObject.id,
        label: input.context.selectedObject.label,
        score: input.context.selectedObject.score,
        bbox: input.context.selectedObject.bbox,
        polygon: input.context.selectedObject.polygon,
        maskUrl: input.context.selectedObject.maskUrl,
      }
    : null;

  const generated = await runGenerateImagesAction({
    request: input.request,
    context: input.context,
    userId: input.userId,
    action: { type:'generate_images', count:1,
      prompt:selectedObject ? serializeAnnotationPrompt({prompt:input.action.prompt,object:selectedObject}) : input.action.prompt,
      aspectRatio:input.action.aspectRatio || '1:1',
    },
  });
  const result = generated.images[0];
  if (!result?.imageData) throw new Error('图片编辑失败');

  return {
    kind: 'image_edited',
    modelId:result.modelId,
    resolution:result.resolution,
    prompt:result.prompt,
    assetId: `agent-edited-${Date.now()}`,
    imageData: result.imageData,
    recoveryRequestId: result.recoveryRequestId,
    message: selectedObject?.label ? `已完成对象编辑：${selectedObject.label}` : '已完成图片编辑',
  };
}
