import { createHash } from 'node:crypto';
import type { AgentAction, AgentContext, AgentRunRequest } from './actions';
import { imageGenerationContract, videoGenerationContract, videoRatioFromSize, type ExpectedGenerationPrice } from '@/lib/generation-contract';
import { normalizeVideoGenerationConfig } from '@/lib/video-models';
import { AI_TOOL_CREDIT_COSTS } from '@/lib/ai-tool-pricing';
import { runGenerateStoryboardVideoAction } from './executors/generateStoryboardVideo';
import { prepareAgentImagePlan } from './image-plan';

export async function previewAgentAction(action: AgentAction | null, context: AgentContext, request: AgentRunRequest) {
  const {plan:imagePlan} = prepareAgentImagePlan(action,context,request.imagePlan);
  let stepNumbers: number[] | undefined;
  let credits = 0;
  let steps: string[] = [];
  let priceVersion = '';
  let imagePrice: ExpectedGenerationPrice | undefined;
  let videoPrice: ExpectedGenerationPrice | undefined;
  if (!action) { credits = AI_TOOL_CREDIT_COSTS.agentChat; steps = ['根据当前上下文生成建议']; }
  else if (['generate_images','create_grid','create_character_three_view','generate_storyboard_image','edit_selected_image'].includes(action.type)) {
    const count = imagePlan!.onlyStep ? 1 : imagePlan!.count;
    stepNumbers = imagePlan!.onlyStep ? [imagePlan!.onlyStep] : Array.from({length:count},(_,i)=>i+1);
    const imageContract = imageGenerationContract(imagePlan!.modelId, imagePlan!.resolution, action.type === 'edit_selected_image' || (action.type === 'generate_images' && context.selectedImage) ? 1 : 0);
    const quote = imageContract.quote; imagePrice = imageContract.expectedPrice;
    credits = quote.credits * count; priceVersion = quote.priceVersion;
    steps = stepNumbers.map(step => `${action.type === 'edit_selected_image' ? '编辑图片' : '生成图片'} ${step}/${imagePlan!.count} · ${imagePlan!.resolution}（${quote.credits} 积分）`);
    steps.push('将完成结果加入画布');
  } else if (action.type === 'generate_video' || action.type === 'generate_storyboard_video') {
    const video = action.type === 'generate_storyboard_video' ? await runGenerateStoryboardVideoAction({action,context}) : action;
    if ('kind' in video && video.kind !== 'storyboard_video_generation_requested') throw new Error('视频计划无效');
    const options = video as { mode?: string; size?: string; durationSeconds?: number };
    const videoContract = videoGenerationContract(normalizeVideoGenerationConfig({modelId:options.mode==='fast'?'doubao-seedance-2-0-fast-260128':'doubao-seedance-2-0-260128',duration:options.durationSeconds||5,aspectRatio:videoRatioFromSize(options.size||'720x1280')}));
    const quote = videoContract.quote; videoPrice = videoContract.expectedPrice;
    credits=quote.credits; priceVersion=quote.priceVersion; steps=['提交视频生成任务','查询任务并保留完成结果'];
  } else { steps=[action.type === 'create_storyboard' ? '创建分镜节点' : action.type === 'create_storyboard_board' ? '创建分镜画板' : '将素材加入画布']; }
  const scope = context.scope === 'selection' ? `当前选区（${context.selectedElements?.length || 1} 个节点）` : '当前项目';
  const digest = createHash('sha256').update(JSON.stringify({request:{...request,phase:undefined,planDigest:undefined},action,credits,priceVersion,imagePrice,videoPrice})).digest('hex');
  return { steps, estimatedCredits:credits, scope, digest, imagePrice, videoPrice, imagePlan, stepNumbers,
    reference:(!action || action.type==='generate_images' || action.type==='edit_selected_image') ? context.imageReferences?.find(r=>r.id===(context.referenceId || (action ? context.selectedElementId : undefined))) : undefined };
}
