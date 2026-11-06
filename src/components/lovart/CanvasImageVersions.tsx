'use client';
import { useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { collectImageVersions, imageVersionGroups, selectImageVersion } from '@/lib/image-versions';
import { CanvasMediaPreview } from './CanvasMediaPreview';

export function CanvasImageVersions({elements,selectedIds,onUpdate,onSelect}:{elements:CanvasElement[];selectedIds:string[];onSelect:(id:string)=>void;onUpdate:(change:(current:CanvasElement[])=>CanvasElement[])=>void}) {
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<string|null>(null);
  const selected=selectedIds.length===1?elements.find(item=>item.id===selectedIds[0] && item.type==='image'):undefined;
  if(!selected)return null;
  const group=imageVersionGroups(elements).find(item=>item.versions.some(image=>image.id===selected.id));
  const stored=Array.isArray(selected.imageVersions)?selected.imageVersions.filter(item=>item && typeof item==='object' && !Array.isArray(item) && typeof item.id==='string' && typeof item.content==='string'):[];
  if(!group && stored.length<2)return null;
  const previewVersion=stored.find(item=>item && typeof item==='object' && !Array.isArray(item) && item.content===preview);
  const detail=previewVersion && typeof previewVersion==='object' && !Array.isArray(previewVersion)?previewVersion:undefined;
  const metadata=detail?.generationMetadata && typeof detail.generationMetadata==='object' && !Array.isArray(detail.generationMetadata)?detail.generationMetadata:undefined;
  const choose=(id:string)=>{
    setError('');
    onUpdate(current=>current.map(item=>item.id===selected.id?selectImageVersion(item,id):item));
  };
  return <section aria-label="图片版本" className="absolute bottom-28 left-4 z-[65] max-h-72 w-64 overflow-auto rounded-xl border bg-white p-3 text-xs shadow-xl dark:bg-slate-950">
    <p className="mb-2 font-semibold">图片版本 · 原图保留</p>
    {group && <button type="button" className="mb-2 text-sky-600" onClick={()=>{try{const rootId=group.rootId;collectImageVersions(elements,rootId);onUpdate(current=>collectImageVersions(current,rootId));onSelect(rootId);setError('');}catch(reason){setError(reason instanceof Error?reason.message:'无法收拢版本');}}}>将 {group.versions.length} 个节点收拢为一个版本组</button>}
    {stored.map((version,index)=>{
      if(!version || typeof version!=='object' || Array.isArray(version))return null;
      const id=String(version.id),source=String(version.content);
      return <div key={id} className="flex items-center justify-between gap-2 py-1"><button type="button" onClick={()=>setPreview(source)}>{index===0?'原图':`版本 ${index+1}`} · 预览对比</button><button type="button" disabled={selected.activeImageVersionId===id} onClick={()=>choose(id)} className="text-sky-600 disabled:text-gray-400">{selected.activeImageVersionId===id?'使用中':'选用'}</button></div>;
    })}
    {error && <p role="alert" className="text-amber-600">{error}</p>}
    {preview && <CanvasMediaPreview key={`${selected.id}:${preview}`} asset={{source:preview,kind:'image',title:'图片版本对比',prompt:typeof detail?.prompt==='string'?detail.prompt:undefined,
      model:typeof metadata?.modelVariant==='string'?metadata.modelVariant:typeof metadata?.model==='string'?metadata.model:undefined,
      projectLabel:typeof metadata?.projectId==='string'?metadata.projectId:undefined,
      originalSource:stored[0] && typeof stored[0]==='object' && !Array.isArray(stored[0]) ? String(stored[0].content) : undefined}} onClose={()=>setPreview(null)} />}
  </section>;
}
