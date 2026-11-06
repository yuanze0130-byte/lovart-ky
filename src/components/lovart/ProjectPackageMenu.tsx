'use client';
import { useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { CANVAS_PACKAGE_FILE_LIMIT, createCanvasPackage, serializeCanvasPackage } from '@/lib/canvas-package';
import { refreshCanvasElementAssetUrls } from '@/lib/canvas-asset-upload';
import { importCanvasPackage } from '@/lib/canvas-package-import';
export function ProjectPackageMenu({userId,title,elements,viewport,disabled}:{userId:string;title:string;elements:CanvasElement[];viewport:{x:number;y:number;scale:number};disabled:boolean}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[created,setCreated]=useState<string|null>(null);
  const run=async(fn:()=>Promise<void>)=>{if(busy||disabled)return;setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'项目包操作失败');}finally{setBusy(false);}};
  return <details className="relative text-xs"><summary className="cursor-pointer">项目包</summary>
    <div className="absolute right-0 top-7 z-[210] w-72 rounded-xl border bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-white">
      <p className="mb-3">包含节点、连线和素材。素材总量上限 50 MB；首次导入保存为新项目。在同一浏览器重复导入相同文件会找回已有项目。</p>
      <button type="button" disabled={busy||disabled} className="mb-3 underline disabled:opacity-40" onClick={()=>void run(async()=>{
        const refreshed=await refreshCanvasElementAssetUrls(elements);
        const pack=await createCanvasPackage({title,elements:refreshed,viewport});
        const url=URL.createObjectURL(new Blob([serializeCanvasPackage(pack)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download=`${(title||'project').replace(/[\\/:*?"<>|]/g,'_')}.doodle.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        setMessage(`已打包 ${pack.elements.length} 个元素、${pack.assets.length} 份素材`);
      })}>下载完整项目包</button>
      <label className="block">导入项目包<input aria-label="导入完整项目包" type="file" accept=".json" disabled={busy||disabled} className="mt-2 block w-full" onChange={event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        void run(async()=>{if(file.size>CANVAS_PACKAGE_FILE_LIMIT)throw new Error('文件超过 75 MB');
          const result=await importCanvasPackage(userId,await file.text());
          setCreated(result.id);setMessage(result.reused?'已找到此前导入的项目，未重复创建':'项目包已验证并保存，可打开新项目');
        });
      }}/></label>
      {busy&&<p role="status" className="mt-2">正在处理素材…</p>}{message&&<p role="status" className="mt-2">{message}</p>}
      {created&&<a href={`/canvas?id=${created}`} target="_blank" rel="noopener noreferrer" className="mt-2 block underline">打开导入的新项目</a>}
    </div>
  </details>;
}
