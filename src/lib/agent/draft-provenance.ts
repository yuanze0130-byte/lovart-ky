import type { GenerationMetadata } from '@/components/lovart/CanvasArea';
import type { GenerationHistoryItem } from '@/lib/generation-history';
import type { DraftCanvasElement } from './actions';
import type { StoredWorkflow } from './workflow-store';
export function agentDraftMetadata(draft:DraftCanvasElement):GenerationMetadata{
  return Object.fromEntries(Object.entries({layoutRole:draft.layoutRole,layoutLabel:draft.layoutLabel,recoveryRequestId:draft.recoveryRequestId,
    modelVariant:draft.modelId,resolution:draft.resolution,workflowId:draft.agentBatchId,workflowStepId:draft.workflowStepId,sourceElementId:draft.sourceImageId}).filter(([,value])=>value!==undefined));
}
export function agentDraftHistory(draft:DraftCanvasElement,scope:{ownerId?:string;projectId?:string;projectTitle?:string}):GenerationHistoryItem{
  return {id:draft.recoveryRequestId || draft.id,kind:draft.type,content:draft.content,prompt:draft.prompt,model:draft.modelId,
    createdAt:new Date().toISOString(),origin:{...scope,nodeId:draft.id,sourceNodeId:draft.sourceImageId},metadata:agentDraftMetadata(draft)};
}
export function workflowHistoryItems(record:StoredWorkflow):GenerationHistoryItem[]{
  return record.workflow.steps.flatMap(step=>step.output.flatMap(artifact=>artifact.kind==='image'?[{
    id:artifact.id,kind:'image' as const,content:artifact.url,prompt:artifact.prompt || step.input,model:artifact.modelId || record.imagePlan?.modelId,
    createdAt:new Date(record.updatedAt).toISOString(),origin:{ownerId:record.workflow.owner,projectId:record.workflow.projectId,nodeId:artifact.nodeId || artifact.id,sourceNodeId:artifact.sourceImageId},
    metadata:agentDraftMetadata({id:artifact.id,type:'image',x:0,y:0,width:400,height:400,content:artifact.url,
      recoveryRequestId:artifact.id,modelId:artifact.modelId || record.imagePlan?.modelId,resolution:artifact.resolution || record.imagePlan?.resolution,
      agentBatchId:record.workflow.id,workflowStepId:step.id,sourceImageId:artifact.sourceImageId}),
  }]:[]));
}
