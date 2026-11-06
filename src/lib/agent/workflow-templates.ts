import type { WorkflowStepDefinition } from './workflow';
import type { AgentImagePlan } from './actions';
import { IMAGE_MODEL_OPTIONS } from '../image-models';
export type CreativeTemplate = {id:string;name:string;steps:WorkflowStepDefinition[];imagePlan?:AgentImagePlan};
const record = (value:unknown):value is Record<string,unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value:unknown,max:number):value is string => typeof value === 'string' && Boolean(value.trim()) && value.length<=max;
export function validateCreativeTemplate(value:unknown):value is CreativeTemplate {
  if (!record(value) || !text(value.id,150) || !text(value.name,80) || !Array.isArray(value.steps) || !value.steps.length || value.steps.length>24) return false;
  const outputs = new Map<string,string>();
  for (const step of value.steps) {
    if (!record(step) || !text(step.id,150) || outputs.has(step.id) || !text(step.title,150) || !text(step.input,1300) ||
      !['analyze','prompt','generate','edit'].includes(String(step.kind)) || !Array.isArray(step.dependencies) || step.dependencies.length>24) return false;
    const dependencies = new Set<string>();
    for (const dep of step.dependencies) {
      if (!record(dep) || typeof dep.stepId !== 'string' || outputs.get(dep.stepId)!==dep.kind || dependencies.has(dep.stepId) ||
        (dep.selected!==undefined && typeof dep.selected!=='boolean') || (dep.selected && dep.kind!=='image')) return false;
      dependencies.add(dep.stepId);
    }
    outputs.set(step.id,step.kind==='analyze' || step.kind==='prompt' ? 'text' : 'image');
  }
  if (value.imagePlan!==undefined) {
    const plan=value.imagePlan;
    if (!record(plan)) return false;
    const model=IMAGE_MODEL_OPTIONS.find(item=>item.id===plan.modelId);
    if (!model || !model.supportedResolutions.some(resolution=>resolution===plan.resolution) || typeof plan.prompt!=='string' || plan.prompt.length>5000 ||
      !['auto','1:1','4:3','3:4','16:9','9:16','2:3','3:2','4:5','5:4','21:9'].includes(String(plan.aspectRatio)) ||
      typeof plan.count!=='number' || !Number.isInteger(plan.count) || plan.count<1 || plan.count>4 || plan.onlyStep!==undefined) return false;
  }
  return true;
}
export function draftCreativeSteps(goal: string, edit = true):WorkflowStepDefinition[] {
  const steps:WorkflowStepDefinition[] = [
    {id:'analyze',kind:'analyze',title:'分析参考与需求',input:`分析当前参考图及需求，仅输出分析文字：${goal}`,dependencies:[]},
    {id:'prompt',kind:'prompt',title:'整理创作提示词',input:`根据上一步分析整理可直接用于生图的提示词，仅输出文字：${goal}`,dependencies:[{stepId:'analyze',kind:'text'}]},
    {id:'generate',kind:'generate',title:'生成方案',input:`生成图片：${goal}`,dependencies:[{stepId:'prompt',kind:'text'}]},
  ];
  if(edit)steps.push({id:'edit',kind:'edit',title:'修改选中结果',input:`在选中的方案上继续修改：${goal}`,dependencies:[{stepId:'generate',kind:'image',selected:true}]});
  return steps;
}
export const CREATIVE_TEMPLATES:CreativeTemplate[] = [
  {id:'product',name:'产品主图',steps:draftCreativeSteps('制作产品主图，保持产品结构、品牌和颜色，突出主体')},
  {id:'character',name:'人物三视图',steps:draftCreativeSteps('在一张图中排列同一人物的正面、侧面、背面三视图，服装与比例一致',false)},
  {id:'storyboard',name:'分镜方案',steps:draftCreativeSteps('制作四格分镜图，明确叙事顺序，保持角色和场景一致',false)},
  {id:'reference-style',name:'参考图风格分析',steps:[{id:'analyze',kind:'analyze',title:'风格分析',input:'分析参考图的构图、色彩、材质、灯光和可复用的风格要点，仅输出文字',dependencies:[]}]},
];
export function readCreativeTemplates(owner:string):CreativeTemplate[] {
  const raw = localStorage.getItem(`canvas-creative-templates:${owner}`);
  if(!owner || !raw)return [];
  if(raw.length>3_000_000)throw new Error('自定义模板记录过大');
  const value=JSON.parse(raw);
  if(!Array.isArray(value) || value.length>30)throw new Error('自定义模板记录无效');
  if (!value.every(validateCreativeTemplate) || new Set(value.map(t=>t.id)).size!==value.length) throw new Error('自定义模板内容或依赖无效，请检查保存的模板');
  return value;
}
export function saveCreativeTemplate(owner:string,template:CreativeTemplate) {
  if(!owner || !validateCreativeTemplate(template) || JSON.stringify(template).length>100_000)throw new Error('模板名称、步骤依赖或模型参数无效');
  const items=readCreativeTemplates(owner).filter(t=>t.id!==template.id);
  if(items.length>=30)throw new Error('最多保存 30 个自定义模板');
  localStorage.setItem(`canvas-creative-templates:${owner}`,JSON.stringify([...items,template]));
}
