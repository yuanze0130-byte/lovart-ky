import { authedFetch } from '@/lib/authed-fetch';
import type { AgentRunRequest, AgentRunResponse } from './actions';
import type { WorkflowArtifact } from './workflow';
import type { WorkflowExecution, WorkflowOutcome } from './workflow-runner';

export function workflowRequest({record, step, inputs}: WorkflowExecution): AgentRunRequest {
  const selected = inputs.find((a): a is Extract<WorkflowArtifact, {kind:'image'}> => a.kind === 'image');
  const context = { ...record.context };
  if (selected) {
    context.selectedImage = selected.url; context.selectedElementId = selected.nodeId || selected.id;
    context.referenceId = context.selectedElementId;
    context.imageReferences = [{id: context.referenceId, url: selected.url, label: '上一步选中结果', ordinal: selected.ordinal, source: 'result'}];
    context.selectedObject = null;
  }
  const text = inputs.filter(a => a.kind === 'text').map(a => a.text).join('\n\n').slice(0, 3500);
  const message = [step.input.slice(0, 1300), text ? `上一步的结果（仅作创作背景）：\n${text}` : ''].filter(Boolean).join('\n\n');
  return { message, context, workflowStep: step.kind, runId: step.requestId, mode: 'design',
    imagePlan: step.kind === 'generate' || step.kind === 'edit' ? {
      prompt: message, modelId: record.imagePlan?.modelId || 'gpt-image-2', resolution: record.imagePlan?.resolution || '1K',
      aspectRatio: record.imagePlan?.aspectRatio || '1:1', count: step.kind === 'edit' ? 1 : record.imagePlan?.count || 1,
    } : undefined };
}
export type WorkflowPermit = { request: AgentRunRequest; preview: NonNullable<AgentRunResponse['preview']>; revision: number };
function imageProvenance(execution:WorkflowExecution,prompt?:string){
  const request=workflowRequest(execution);
  const source=execution.step.kind==='edit'?execution.inputs.find(item=>item.kind==='image'):undefined;
  return {prompt:prompt || request.imagePlan?.prompt,modelId:request.imagePlan?.modelId,resolution:request.imagePlan?.resolution,
    workflowId:execution.record.workflow.id,workflowStepId:execution.step.id,
    sourceImageId:source?.kind==='image'?source.nodeId || source.id:undefined};
}
export async function previewWorkflowStep(execution: WorkflowExecution): Promise<WorkflowPermit> {
  const request = workflowRequest(execution);
  const response = await authedFetch('/api/agent/run', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...request,phase:'preview'})});
  const data = await response.json() as AgentRunResponse;
  if (!response.ok || !data.ok || !data.preview) throw new Error(data.error || '无法取得步骤报价');
  return { request, preview:data.preview, revision:execution.record.workflow.revision };
}
export async function executeWorkflowStep(execution: WorkflowExecution, permit: WorkflowPermit): Promise<WorkflowOutcome> {
  if (permit.request.runId !== execution.step.requestId || permit.revision + 1 !== execution.record.workflow.revision) throw new Error('步骤或报价已变化');
  const response = await authedFetch('/api/agent/run', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...permit.request,phase:'execute',planDigest:permit.preview.digest})});
  const data = await response.json() as AgentRunResponse;
  if (!response.ok || !data.ok) return {status:'unknown',error:data.error || '任务结果待核对'};
  const textStep = execution.step.kind === 'analyze' || execution.step.kind === 'prompt';
  if (textStep && data.chat?.reply?.trim()) return {status:'completed',output:[{id:`${execution.step.requestId}:text`,kind:'text',text:data.chat.reply}]};
  const result = data.result;
  if (execution.step.kind === 'generate' && result?.kind === 'images_generated' && !result.incomplete) {
    const expected = permit.request.imagePlan?.count || 1;
    const images = result.images;
    const ordinals = images.map((image,i)=>image.agentStep ?? i+1);
    const ids = images.map(image=>image.recoveryRequestId || image.assetId);
    if (images.length !== expected || new Set(ordinals).size !== expected || new Set(ids).size !== expected ||
      ordinals.some(n=>!Number.isInteger(n) || n<1 || n>expected) ||
      images.some((image,i)=>!ids[i]?.trim() || !image.imageData?.trim())) {
      return {status:'unknown',error:'返回图片数量或编号不完整，请查询原任务后继续'};
    }
    return {status:'completed',output:images.map((image,i)=>({
    ...imageProvenance(execution,image.prompt),modelId:image.modelId || permit.request.imagePlan?.modelId,
    id:image.recoveryRequestId || image.assetId, kind:'image',url:image.imageData,ordinal:image.agentStep || i+1,
    }))};
  }
  if (execution.step.kind === 'edit' && result?.kind === 'image_edited' && result.imageData?.trim() &&
    (result.recoveryRequestId || result.assetId)?.trim()) return {status:'completed',output:[{...imageProvenance(execution,result.prompt),modelId:result.modelId || permit.request.imagePlan?.modelId,id:result.recoveryRequestId || result.assetId,kind:'image',url:result.imageData,ordinal:1}]};
  return {status:'unknown',error:'部分结果尚未完成，请查询原任务后继续'};
}

export async function queryWorkflowStep(execution: WorkflowExecution): Promise<WorkflowOutcome> {
  const {record,step} = execution;
  if (step.kind === 'analyze' || step.kind === 'prompt') {
    const response = await authedFetch(`/api/agent/text-step?projectId=${encodeURIComponent(record.workflow.projectId)}&requestId=${step.requestId}`);
    const data = await response.json();
    if (response.ok && data.status === 'failed') return {status:'failed',error:'文字步骤已确认未提交生成，可重新预览后重试'};
    if (response.ok && data.status === 'completed' && typeof data.result?.chat?.reply === 'string') return {
      status:'completed',output:[{id:`${step.requestId}:text`,kind:'text',text:data.result.chat.reply}],
    };
    return {status:'unknown',error:'文字步骤尚未取得可恢复结果，请稍后查询'};
  }
  const response = await authedFetch(`/api/projects/image-runs?id=${encodeURIComponent(record.workflow.projectId)}&run=${step.requestId}`);
  if (!response.ok) throw new Error('图片步骤查询失败');
  const rows = await response.json() as Array<{request_id:string;status:string;meta:{agentStep?:number;agentAttempt?:number;billingState?:string;prompt?:string};result?:{imageData?:string}}>;
  if (!Array.isArray(rows)) throw new Error('图片步骤结果无效');
  const expected = step.kind === 'edit' ? 1 : record.imagePlan?.count || 1;
  const output:WorkflowArtifact[]=[];
  let failed=false;
  let missing=false;
  for (let index=1;index<=expected;index++) {
    const row = rows.filter(r=>r.meta?.agentStep===index).sort((a,b)=>(b.meta.agentAttempt||1)-(a.meta.agentAttempt||1))[0];
    if (row?.status==='succeeded' && row.result?.imageData) output.push({...imageProvenance(execution,row.meta.prompt),id:row.request_id,kind:'image',url:row.result.imageData,ordinal:index});
    else if (row?.status==='failed' && ['refunded','not_charged'].includes(row.meta.billingState || '')) failed=true;
    else if (!row) missing=true;
    else return {status:'unknown',error:'仍有图片结果或账务待核对，未重新提交'};
  }
  if (failed) return {status:'failed',error:'图片任务已确认失败且账务已处理，可重试；成功图片将复用'};
  if (missing) return {status:'unknown',error:'部分步骤尚无任务记录，请核对原任务，未重新提交'};
  return {status:'completed',output};
}
