import type { AgentAction, AgentContext, AgentImagePlan, AgentImageReference } from './actions';
import { getImageModelDefinition, isImageModelId } from '@/lib/image-models';

export const AGENT_IMAGE_ACTIONS = ['generate_images', 'create_grid', 'create_character_three_view', 'edit_selected_image', 'generate_storyboard_image'];
export const AGENT_IMAGE_RATIOS = ['1:1','16:9','9:16','4:3','3:4','3:2','2:3','4:5','21:9'] as const;
export function isAgentImageAction(action: AgentAction | null): boolean { return Boolean(action && AGENT_IMAGE_ACTIONS.includes(action.type)); }

export function resolveAgentReference(message: string, context: AgentContext): AgentContext {
  const refs = context.imageReferences || [];
  if (!Array.isArray(refs) || refs.length > 50 || refs.some(r => !r || typeof r.id !== 'string' || typeof r.url !== 'string' || typeof r.label !== 'string' || !Number.isInteger(r.ordinal) || r.ordinal < 1)) throw new Error('图片引用无效，请重新选择图片');
  const ordinals = [...message.matchAll(/第\s*(\d+|[一二两三四五六七八九十]+)\s*张/g)];
  if (ordinals.length > 1 && !context.referenceId) throw new Error('请先在画布选中要比较的图片，再输入“比较选中的图片”；单次修改请指定一张');
  const ordinal = ordinals[0];
  let reference: AgentImageReference | undefined;
  if (context.referenceId) reference = refs.find(r => r.id === context.referenceId);
  else if (ordinal) {
    const cn: Record<string,number> = {一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
    const raw = ordinal[1];
    const parts = raw.split('十');
    const number = /^\d+$/.test(raw) ? Number(raw) : parts.length === 2 ? (cn[parts[0]] || 1)*10+(cn[parts[1]] || 0) : cn[raw];
    const matches = refs.filter(r => r.ordinal === number);
    if (matches.length !== 1) throw new Error(`无法确定第 ${number || raw} 张图片，请先选中目标图片再继续`);
    reference = matches[0];
  } else if (refs.length === 1 && (refs[0].source === 'selection' || /这张|上张|刚才|上一张|改成|换成|编辑|调成|变成/.test(message))) reference = refs[0];
  if (context.referenceId && !reference) throw new Error('引用图片已不存在，请重新选择');
  if (!reference) return { ...context, referenceId: undefined };
  return { ...context, referenceId: reference.id, selectedElementId: reference.id, selectedImage: reference.url,
    selectedObject: context.selectedElementId === reference.id ? context.selectedObject : null };
}

export function prepareAgentImagePlan(action: AgentAction | null, context: AgentContext, input?: AgentImagePlan) {
  if (!isAgentImageAction(action) || !action || !('prompt' in action)) {
    if (input) throw new Error('当前操作不支持生图参数');
    return { action, plan: undefined };
  }
  const defaultCount = action.type === 'generate_images' ? Math.max(1,Math.min(action.count || 1,4)) : action.type === 'create_grid' ? action.count || 9 : action.type === 'create_character_three_view' ? 3 : 1;
  const plan: AgentImagePlan = input || { prompt: action.prompt || '', modelId:'nano-banana-pro', resolution:'1K', aspectRatio:'aspectRatio' in action ? action.aspectRatio || '1:1' : '1:1', count:defaultCount };
  if (typeof plan.prompt !== 'string' || !plan.prompt.trim() || plan.prompt.length > 5000) throw new Error('提示词需要 1–5000 个字符');
  if (!isImageModelId(plan.modelId)) throw new Error('不支持此图片模型');
  const model = getImageModelDefinition(plan.modelId);
  if (!model.supportedResolutions.includes(plan.resolution) || !AGENT_IMAGE_RATIOS.includes(plan.aspectRatio)) throw new Error('模型不支持所选分辨率或比例');
  const counts = action.type === 'generate_images' ? [1,2,3,4] : action.type === 'create_grid' ? [4,9,25] : [defaultCount];
  if (!counts.includes(plan.count)) throw new Error('图片数量与计划不匹配');
  if (plan.onlyStep !== undefined && (!Number.isInteger(plan.onlyStep) || plan.onlyStep < 1 || plan.onlyStep > plan.count)) throw new Error('所选步骤无效');
  const usesReference = action.type === 'generate_images' || action.type === 'edit_selected_image';
  if (action.type === 'edit_selected_image' && !context.referenceId && (context.imageReferences?.length || 0) > 1) throw new Error('有多张候选图片，请选中一张，或明确说“第几张”');
  if (action.type === 'edit_selected_image' && !context.selectedImage) throw new Error('请先选中要修改的图片');
  if (usesReference && context.selectedImage && !model.supportsReferences) throw new Error('此模型不支持参考图');
  if (action.type === 'edit_selected_image' && !model.supportsEditing) throw new Error('此模型不支持图片编辑');
  if (model.requiresReference && (!usesReference || !context.selectedImage)) throw new Error('此模型需要参考图');
  const updated = { ...action, prompt:plan.prompt.trim(), aspectRatio:plan.aspectRatio };
  if (updated.type === 'generate_images') updated.count = plan.count;
  if (updated.type === 'create_grid') updated.count = plan.count as 4|9|25;
  return { action:updated as AgentAction, plan:{ ...plan, prompt:plan.prompt.trim() } };
}
