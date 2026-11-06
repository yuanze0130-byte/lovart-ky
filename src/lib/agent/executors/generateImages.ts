import type { NextRequest } from 'next/server';
import type { GenerateImagesAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';
import { resolveImageAttempt } from '@/lib/agent/image-attempt';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { createSignedCanvasAssetUrl, parseCanvasAssetPath } from '@/lib/canvas-asset-access';

type GenerateImageApiResult = {
  imageData?: string;
  error?: string;
};

export async function runGenerateImagesAction(input: {
  request: NextRequest;
  action: GenerateImagesAction;
  context: AgentContext;
  userId: string;
  prompts?: string[];
  useSelectedReference?: boolean;
}): Promise<Extract<AgentActionResult, {kind:'images_generated'}>> {
  const requestedCount = input.action.count ?? 1;
  const count = input.prompts ? Math.min(input.prompts.length, 25) : Math.max(1, Math.min(requestedCount, 4));
  const images: Extract<AgentActionResult,{kind:'images_generated'}>['images'] = [];
  if (!input.context.projectId || !input.context.executionRunId) throw new Error('请先保存项目再执行生图计划');
  let failure: string | null = null;

  for (let index = 0; index < count; index += 1) {
    if (input.context.imagePlan?.onlyStep && input.context.imagePlan.onlyStep !== index+1) continue;
    const prompt = input.prompts?.[index] || input.action.prompt;
    try {
    input.request.signal.throwIfAborted();
    const db = createServiceRoleSupabaseClient();
    const { requestId, previous, attempt } = await resolveImageAttempt(input.context.executionRunId, index, async id => {
      const {data,error} = await db.from('canvas_image_runs').select('status,result,meta').eq('request_id',id).eq('user_id',input.userId).eq('project_id',input.context.projectId!).maybeSingle();
      if (error) throw new Error('无法确认步骤状态，未重新提交生成');
      return data;
    }, async id => {
      const {data,error} = await db.from('credit_transactions').select('amount,type').eq('user_id',input.userId).eq('reference_id',id).in('type',['generate_image','refund']);
      if (error || !data) return false;
      return data.every(row => Number.isFinite(row.amount)) && data.reduce((sum,row)=>sum+row.amount,0) === 0;
    });
    const result = previous ? previous.result as GenerateImageApiResult : await callInternalJson<GenerateImageApiResult>(input.request, '/api/generate-image', {
      requestId, projectId: input.context.projectId, generatorId: input.context.selectedElementId,
      prompt,
      expectedPrice: input.context.expectedImagePrice,
      taskSource: 'agent', agentRunId:input.context.executionRunId, agentStep: index + 1, agentAttempt: attempt + 1,
      resolution: input.context.imagePlan?.resolution || '1K',
      aspectRatio: input.action.aspectRatio || '1:1',
      modelVariant: input.context.imagePlan?.modelId || 'pro',
      editMode: 'generate',
      referenceImages: input.useSelectedReference !== false && input.context.selectedImage ? [input.context.selectedImage] : undefined,
    });

    if (!result.imageData) {
      throw new Error(result.error || '图片生成失败');
    }
    const asset = parseCanvasAssetPath(result.imageData);
    const imageData = asset?.userId === input.userId ? createSignedCanvasAssetUrl(asset.userId, asset.fileName) : result.imageData;

    images.push({
      agentStep:index+1,
      recoveryRequestId: requestId,
      assetId: `agent-img-${index + 1}-${Date.now()}`,
      imageData,
      prompt,
      modelId:input.context.imagePlan?.modelId || 'pro',
      resolution:input.context.imagePlan?.resolution || '1K',
    });
    } catch (error) {
      if (!images.length) throw error;
      failure = `第 ${index + 1} 张未完成，已保留前 ${images.length} 张结果。请核对任务状态后再继续。`;
      break;
    }
  }

  return {
    kind: 'images_generated',
    assetIds: images.map((item) => item.assetId),
    images,
    count: images.length,
    incomplete: Boolean(failure),
    message: failure || `已生成 ${images.length} 张图像`,
  };
}
