'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { AgentContext, AgentImagePlan } from '@/lib/agent/actions';
import { createWorkflow, controlWorkflow, nextWorkflowStep, retryWorkflowStep, selectWorkflowArtifact, workflowInputs, workflowSourceId, type WorkflowArtifact, type WorkflowStepDefinition } from '@/lib/agent/workflow';
import { workflowStore, type StoredWorkflow } from '@/lib/agent/workflow-store';
import { advanceWorkflow, reconcileWorkflow } from '@/lib/agent/workflow-runner';
import { executeWorkflowStep, previewWorkflowStep, queryWorkflowStep, type WorkflowPermit } from '@/lib/agent/workflow-adapter';
import { CREATIVE_TEMPLATES, draftCreativeSteps, readCreativeTemplates, saveCreativeTemplate, type CreativeTemplate } from '@/lib/agent/workflow-templates';
import { IMAGE_MODEL_OPTIONS, getImageModelDefinition } from '@/lib/image-models';
import { quoteImageCredits } from '@/lib/image-pricing';
import { AI_TOOL_CREDIT_COSTS } from '@/lib/ai-tool-pricing';
import { addGenerationHistoryItem } from '@/lib/generation-history';
import { workflowHistoryItems } from '@/lib/agent/draft-provenance';

const labels = {pending:'等待执行',running:'正在执行',unknown:'结果待核对',completed:'已完成',failed:'已确认失败',cancelled:'已取消'};
const initialImage:AgentImagePlan = {prompt:'',modelId:'gpt-image-2',resolution:'1K',aspectRatio:'1:1',count:1};
const workflowServices={preview:previewWorkflowStep,execute:executeWorkflowStep,reconcile:queryWorkflowStep};
export function AgentWorkflowPanel({owner,context,onInsert,services=workflowServices}:{owner:string;context:AgentContext;onInsert:(artifacts:WorkflowArtifact[],sourceId?:string)=>void;services?:typeof workflowServices}) {
  const scope={owner,projectId:context.projectId || ''};
  const [record,setRecord]=useState<StoredWorkflow|null>(null);
  const [draft,setDraft]=useState<WorkflowStepDefinition[]>(()=>structuredClone(CREATIVE_TEMPLATES[0].steps));
  const [imagePlan,setImagePlan]=useState(initialImage);
  const [goal,setGoal]=useState('');
  const [templateName,setTemplateName]=useState('');
  const [custom,setCustom]=useState<CreativeTemplate[]>([]);
  const [permit,setPermit]=useState<WorkflowPermit|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [draftOpen,setDraftOpen]=useState(false);
  const mounted=useRef(true);
  const savedHistory=useRef(new Set<string>());
  useEffect(()=>{
    if(!record)return;
    for(const item of workflowHistoryItems(record)){
      if(savedHistory.current.has(item.id))continue;
      savedHistory.current.add(item.id);
      void addGenerationHistoryItem(item).catch(()=>{savedHistory.current.delete(item.id);if(mounted.current)setError('图片结果已保留在工作流中，本机素材历史暂未保存，请及时放入画布');});
    }
  },[record]);
  useEffect(()=>{
    mounted.current=true;
    let current=true;
    const refresh=()=>workflowStore({owner,projectId:context.projectId || ''}).then(value=>{if(current)setRecord(value);}).catch(err=>{if(current)setError(String(err.message));});
    void refresh();
    try{setCustom(readCreativeTemplates(owner));}catch{setError('无法读取自定义模板');}
    const timer=setInterval(()=>void refresh(),5000);
    return()=>{current=false;mounted.current=false;clearInterval(timer);};
  },[owner,context.projectId]);
  const perform=async(action:()=>Promise<unknown>)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await action();if(mounted.current)setRecord(await workflowStore(scope));}
    catch(err){if(mounted.current)setError(err instanceof Error?err.message:'操作失败');}
    finally{if(mounted.current)setBusy(false);}
  };
  const persist=async(next:NonNullable<StoredWorkflow>['workflow'])=>{
    if(!record)return;
    await workflowStore(scope,{kind:'update',workflowId:record.workflow.id,expectedRevision:record.workflow.revision,next});setPermit(null);
  };
  const control=async(action:'pause'|'resume'|'cancel')=>{
    try {
      const latest=await workflowStore(scope);
      if(!latest)return;
      const updated=await workflowStore(scope,{kind:'update',workflowId:latest.workflow.id,expectedRevision:latest.workflow.revision,
        next:controlWorkflow(latest.workflow,scope,action)});
      if(mounted.current){setRecord(updated);setPermit(null);}
    }catch(err){if(mounted.current)setError(err instanceof Error?err.message:'无法更新工作流');}
  };
  const current=record?.workflow;
  const active=Boolean(current && !['completed','cancelled'].includes(current.status));
  const next=current?nextWorkflowStep(current,scope):null;
  const definition=getImageModelDefinition(imagePlan.modelId);
  const estimate=draft.reduce((sum,step)=>sum+(['analyze','prompt'].includes(step.kind)?AI_TOOL_CREDIT_COSTS.agentChat:
    quoteImageCredits({modelId:imagePlan.modelId,upstreamModel:definition.upstreamModels[imagePlan.resolution]!,resolution:imagePlan.resolution}).credits*(step.kind==='edit'?1:imagePlan.count)),0);
  const adapter={approve:async()=>permit,execute:services.execute,reconcile:services.reconcile};
  return <section aria-label="创作工作流" className="space-y-3 border-b border-gray-200 p-3 text-xs dark:border-white/10">
    {current && !active && <button type="button" onClick={()=>setDraftOpen(value=>!value)} className="text-sky-600">{draftOpen?'收起新流程设置':'新建工作流'}</button>}
    {!active && (!current || draftOpen) && <>
      <label className="block">创作 Skill<select aria-label="创作 Skill" className="mt-1 w-full rounded border bg-transparent p-2" defaultValue="product" onChange={event=>{
        const template=[...CREATIVE_TEMPLATES,...custom].find(t=>t.id===event.target.value);
        if(template){setDraft(structuredClone(template.steps));if(template.imagePlan)setImagePlan(template.imagePlan);}
      }}>{[...CREATIVE_TEMPLATES,...custom].map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <textarea aria-label="工作流目标" value={goal} onChange={e=>setGoal(e.target.value)} rows={2} maxLength={1000} placeholder="一句话描述：分析产品图、生成海报，再修改选中的方案" className="w-full rounded border bg-transparent p-2" />
      <button type="button" disabled={!goal.trim() || busy} onClick={()=>setDraft(draftCreativeSteps(goal))} className="text-sky-600 disabled:opacity-40">拆成可编辑步骤</button>
      <div className="max-h-56 space-y-2 overflow-auto">{draft.map((step,index)=><label key={step.id} className="block">{index+1}. {step.title}<textarea aria-label={`步骤 ${index+1} 输入`} value={step.input} maxLength={1300} rows={2} onChange={e=>setDraft(list=>list.map(s=>s.id===step.id?{...s,input:e.target.value}:s))} className="mt-1 w-full rounded border bg-transparent p-2" /></label>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="工作流生图模型" value={imagePlan.modelId} onChange={e=>{const model=getImageModelDefinition(e.target.value as AgentImagePlan['modelId']);setImagePlan({...imagePlan,modelId:model.id,resolution:model.supportedResolutions[0]});}} className="rounded border bg-transparent p-2">{IMAGE_MODEL_OPTIONS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <select aria-label="工作流分辨率" value={imagePlan.resolution} onChange={e=>setImagePlan({...imagePlan,resolution:e.target.value as AgentImagePlan['resolution']})} className="rounded border bg-transparent p-2">{definition.supportedResolutions.map(r=><option key={r}>{r}</option>)}</select>
        <select aria-label="工作流比例" value={imagePlan.aspectRatio} onChange={e=>setImagePlan({...imagePlan,aspectRatio:e.target.value as AgentImagePlan['aspectRatio']})} className="rounded border bg-transparent p-2">{['1:1','16:9','9:16','4:3','3:4'].map(r=><option key={r}>{r}</option>)}</select>
        <label>方案数量<input aria-label="工作流方案数量" type="number" min={1} max={4} value={imagePlan.count} onChange={e=>setImagePlan({...imagePlan,count:Math.max(1,Math.min(4,Number(e.target.value)||1))})} className="w-full rounded border bg-transparent p-2" /></label>
      </div>
      <p>参考合计 {estimate} 积分；每步执行前会取得服务端最新报价并确认。</p>
      <input aria-label="自定义 Skill 名称" value={templateName} maxLength={80} onChange={e=>setTemplateName(e.target.value)} placeholder="自定义 Skill 名称" className="w-full rounded border bg-transparent p-2" />
      <div className="flex gap-3"><button type="button" disabled={busy || !templateName.trim()} onClick={()=>void perform(async()=>{saveCreativeTemplate(owner,{id:crypto.randomUUID(),name:templateName.trim(),steps:draft,imagePlan});setCustom(readCreativeTemplates(owner));setTemplateName('');})}>保存为我的 Skill</button>
        <button type="button" disabled={busy} className="text-sky-600" onClick={()=>void perform(async()=>{const workflow=createWorkflow(scope,crypto.randomUUID(),draft);await workflowStore(scope,{kind:'create',record:{workflow,context:structuredClone(context),imagePlan,updatedAt:Date.now()}});setPermit(null);setDraftOpen(false);})}>创建工作流</button></div>
      <p className="text-gray-500">自定义 Skill 保存在此浏览器，按账号隔离。模板只保存步骤和参数，不保存参考图片。</p>
    </>}
    {current && <>
      <div className="flex flex-wrap gap-3"><span>{current.status==='paused'?'已暂停':current.status==='completed'?'已完成':current.status==='cancelled'?'已结束':'逐步执行'}</span>
        {active && <><button type="button" onClick={()=>void control(current.status==='paused'?'resume':'pause')}>{current.status==='paused'?'继续计划':'暂停后续步骤'}</button><button type="button" onClick={()=>void control('cancel')}>取消未提交步骤</button></>}
      </div>
      <ol className="max-h-80 space-y-3 overflow-auto">{current.steps.map((step,index)=><li key={step.id} className="rounded border p-2">
        <p>{index+1}. {step.title} · {labels[step.status]}</p><details><summary>输入</summary><p className="whitespace-pre-wrap break-words">{step.input}</p></details>
        {step.error && <p className="text-amber-600">{step.error}</p>}
        {step.output.map(artifact=>artifact.kind==='text'?<details key={artifact.id}><summary>查看文字结果</summary><p className="whitespace-pre-wrap break-words">{artifact.text}</p></details>:<div key={artifact.id} className="mt-2"><img src={artifact.url} alt={`结果 ${artifact.ordinal}`} className="max-h-32 rounded object-contain" /><button type="button" disabled={busy || !active} onClick={()=>void perform(()=>persist(selectWorkflowArtifact(current,scope,step.id,artifact.id)))} className="mr-3 text-sky-600">{step.selectedArtifactId===artifact.id?'已选用':`选用第 ${artifact.ordinal} 张`}</button><button type="button" disabled={busy} onClick={()=>{const sourceId=workflowSourceId(current,step.id,record?.context.selectedElementId || undefined);onInsert([{...artifact,prompt:artifact.prompt || step.input,modelId:artifact.modelId || record?.imagePlan?.modelId,resolution:artifact.resolution || record?.imagePlan?.resolution,workflowId:current.id,workflowStepId:step.id,sourceImageId:sourceId}],sourceId);}}>放入画布</button></div>)}
        {step.status==='failed' && active && <button type="button" disabled={busy} onClick={()=>void perform(()=>persist(retryWorkflowStep(current,scope,step.id)))}>仅重试此步骤</button>}
      </li>)}</ol>
      {current.steps.some(s=>s.status==='unknown'||s.status==='running') && <button type="button" disabled={busy} onClick={()=>void perform(()=>reconcileWorkflow(scope,adapter))}>查询原任务（不重新生成）</button>}
      {next && !permit && <button type="button" disabled={busy} className="text-sky-600" onClick={()=>void perform(async()=>{const value=await services.preview({record:record!,step:next,inputs:workflowInputs(current,next.id)!});if(mounted.current)setPermit(value);})}>预览下一步报价</button>}
      {permit && <div className="rounded bg-sky-50 p-2 text-slate-800"><p>本步 {permit.preview.estimatedCredits} 积分 · {permit.preview.steps.join('；')}</p><button type="button" disabled={busy} onClick={()=>void perform(async()=>{await advanceWorkflow(scope,adapter);setPermit(null);})} className="mt-2 font-semibold text-sky-700">确认并执行本步</button></div>}
    </>}
    {busy && <p role="status">正在处理，请等待…</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
