import type { NextRequest } from 'next/server';
import type { EditSelectedImageAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';

type EditObjectApiResult = {
  imageData?: string;
  error?: string;
};

export async function runEditSelectedImageAction(input: {
  request: NextRequest;
  action: EditSelectedImageAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  if (!input.context.selectedImage) {
    throw new Error('当前未选中图片，无法执行编辑');
  }

  const result = await callInternalJson<EditObjectApiResult>(input.request, '/api/edit-object', {
    image: input.context.selectedImage,
    object: {
      label: 'selected-subject',
      score: 1,
      bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
    prompt: input.action.prompt,
    aspectRatio: input.action.aspectRatio || '1:1',
  });

  if (!result.imageData) {
    throw new Error(result.error || '图片编辑失败');
  }

  return {
    kind: 'image_edited',
    assetId: `agent-edited-${Date.now()}`,
    imageData: result.imageData,
    message: '已完成图片编辑',
  };
}
