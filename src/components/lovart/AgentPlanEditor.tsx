'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { AgentImagePlan } from '@/lib/agent/actions';
import type { AgentProposal } from '@/hooks/useAgentPlanApproval';
import { AGENT_IMAGE_RATIOS } from '@/lib/agent/image-plan';
import { IMAGE_MODEL_OPTIONS, getImageModelDefinition, type ImageModelId, type ImageModelResolution } from '@/lib/image-models';

export function AgentPlanEditor({proposal,busy,error,onReprice,onConfirm,onCancel}:{proposal:AgentProposal;busy:boolean;error:string;onReprice:(plan?:AgentImagePlan,referenceId?:string)=>Promise<void>;onConfirm:()=>void;onCancel:()=>void}) {
  const preview=proposal.prepared.preview!;
  const [draft,setDraft]=useState(preview.imagePlan);
  const [referenceId,setReferenceId]=useState(proposal.payload.context.referenceId || preview.reference?.id || '');
  const [dirty,setDirty]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current;el?.showModal();return()=>el?.close();},[]);
  const [lastProposal,setLastProposal]=useState(proposal);
  if(lastProposal!==proposal){setLastProposal(proposal);setDraft(preview.imagePlan);setReferenceId(proposal.payload.context.referenceId || preview.reference?.id || '');setDirty(false);}
  const update=(patch:Partial<AgentImagePlan>)=>{if(draft){setDraft({...draft,...patch});setDirty(true);}};
  const action=proposal.prepared.action;
  const counts=action?.type==='generate_images'?[1,2,3,4]:action?.type==='create_grid'?[4,9,25]:[draft?.count || 1];
  const refs=proposal.payload.context.imageReferences || [];
  const reference=refs.find(r=>r.id===referenceId) || preview.reference;
  const inputClass='mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();onCancel();}} aria-labelledby="agent-plan-title" className="m-auto max-h-[85vh] w-[min(620px,94vw)] overflow-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-black/45 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
    <div className="flex items-start justify-between gap-4"><div><h2 id="agent-plan-title" className="text-lg font-semibold">确认执行计划</h2><p className="mt-1 text-sm text-slate-500">{preview.scope} · 修改和核价不扣积分</p></div><button type="button" onClick={onCancel} aria-label="关闭执行计划" className="px-2 py-1">✕</button></div>
    {proposal.locked && <p className="my-3 text-sm text-amber-600">继续原计划：参数已锁定，完成的步骤会复用已有结果。</p>}
    <fieldset disabled={proposal.locked || busy} className="mt-4 space-y-4 disabled:opacity-70">
      {draft && <><label className="block text-sm">提示词<textarea aria-label="计划提示词" className={inputClass} rows={3} maxLength={5000} value={draft.prompt} onChange={e=>update({prompt:e.target.value})}/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">生图模型<select aria-label="计划模型" className={inputClass} value={draft.modelId==='pro'?'nano-banana-pro':draft.modelId} onChange={e=>{const modelId=e.target.value as ImageModelId;const model=getImageModelDefinition(modelId);update({modelId,resolution:model.supportedResolutions.includes(draft.resolution)?draft.resolution:model.supportedResolutions[0]});}}>{IMAGE_MODEL_OPTIONS.map(model=><option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
      <label className="text-sm">分辨率<select aria-label="计划分辨率" className={inputClass} value={draft.resolution} onChange={e=>update({resolution:e.target.value as ImageModelResolution})}>{getImageModelDefinition(draft.modelId).supportedResolutions.map(res=><option key={res}>{res}</option>)}</select></label>
      <label className="text-sm">画面比例<select aria-label="计划比例" className={inputClass} value={draft.aspectRatio} onChange={e=>update({aspectRatio:e.target.value as AgentImagePlan['aspectRatio']})}>{AGENT_IMAGE_RATIOS.map(ratio=><option key={ratio}>{ratio}</option>)}</select></label>
      <label className="text-sm">计划张数<select aria-label="计划张数" className={inputClass} value={draft.count} onChange={e=>update({count:Number(e.target.value),onlyStep:undefined})}>{counts.map(count=><option key={count} value={count}>{count} 张</option>)}</select></label></div>
      {draft.count>1 && <label className="block text-sm">本次执行<select aria-label="本次执行步骤" className={inputClass} value={draft.onlyStep || ''} onChange={e=>update({onlyStep:e.target.value?Number(e.target.value):undefined})}><option value="">全部 {draft.count} 张</option>{Array.from({length:draft.count},(_,i)=><option key={i} value={i+1}>只执行第 {i+1} 张</option>)}</select></label>}</>}
      {refs.length>0 && (!action || action.type==='generate_images' || action.type==='edit_selected_image') && <label className="block text-sm">参考图片<select aria-label="计划参考图" className={inputClass} value={referenceId} onChange={e=>{setReferenceId(e.target.value);setDirty(true);}}><option value="">按当前选区或消息中的编号</option>{refs.map(ref=><option key={ref.id} value={ref.id}>{ref.source==='result'?'上次结果':'选区'} · 第 {ref.ordinal} 张 · {ref.label.slice(0,45)}</option>)}</select></label>}
    </fieldset>
    {reference && <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800"><Image unoptimized width={64} height={64} src={reference.url} alt={`参考图 ${reference.ordinal}`} className="h-16 w-16 rounded object-contain"/><span>引用第 {reference.ordinal} 张。修改结果另存为新节点。</span></div>}
    {!action && <p className="mt-4 text-sm text-slate-500">{preview.imageInputCount ? `确认后将读取 ${preview.imageInputCount} 张图片的实际画面，再给出建议。` : '本次只读取文字与节点信息，没有附带图片画面。'}</p>}
    <ol className="my-4 max-h-36 space-y-2 overflow-auto text-sm">{preview.steps.map((step,i)=><li key={i}>{i+1}. {step}</li>)}</ol>
    {error && <p role="alert" className="my-3 text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p aria-live="polite" className="font-medium">{dirty?'参数已修改，需重新核价':`本次上限 ${preview.estimatedCredits} 积分`}</p><div className="flex gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onCancel}>取消</button>{dirty || error ? <button type="button" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" onClick={()=>void onReprice(draft,referenceId || undefined)}>{busy?'核价中…':'更新报价'}</button> : <button type="button" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={onConfirm}>确认执行</button>}</div></div>
  </dialog>;
}
