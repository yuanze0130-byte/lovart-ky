'use client';
import {useEffect,useState} from 'react';
import {authedFetch} from '@/lib/authed-fetch';
type Run={request_id:string;status:string;created_at:string;model_id:string;generator_id:string|null;charged_credits:number;refunded_credits:number;price_version:string;recovery_meta:{source?:string;prompt?:string}};
const states:Record<string,string>={created:'提交准备中',starting:'正在提交',queued:'排队中',running:'生成中',processing:'生成中',succeeded:'已完成',failed:'失败',cancelled:'已取消',refunded:'已退款',outcome_unknown:'结果待核对'};
export function VideoRunLedger({projectId}:{projectId:string}){
  const [open,setOpen]=useState(false),[runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    if(!open)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      try{
        const response=await authedFetch(`/api/projects/video-runs?id=${projectId}&history=1`);
        if(!response.ok)throw Error('视频记录读取失败，将自动重试');
        const data:Run[]=await response.json();
        if(!cancelled){setRuns(data);setLoaded(true);setError('');}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'读取失败');}
      finally{if(!cancelled)timer=setTimeout(()=>void poll(),10000);}
    };
    void poll();return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[open,projectId]);
  return <details onToggle={event=>setOpen(event.currentTarget.open)} className="relative text-xs">
    <summary className="cursor-pointer">视频任务</summary>
    <div className="absolute right-0 top-7 z-[210] max-h-[65vh] w-[min(420px,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100">
      <p className="mb-2 font-medium">最近 100 条视频任务</p>
      <p className="mb-3 text-slate-500">查询不会提交生成。早期未绑定项目的任务不会显示在此处。</p>
      {error&&<p role="alert" className="text-red-500">{error}</p>}
      {!loaded&&!error&&<p role="status">正在读取…</p>}
      {loaded&&!runs.length&&<p>暂无已登记的视频任务</p>}
      {runs.map(run=><article key={run.request_id} className="border-t border-slate-200 py-3 dark:border-slate-700">
        <p>{run.model_id} · {states[run.status]||'状态待核对'}</p>
        <p className="mt-1">报价：{run.charged_credits} 积分 · {run.status==='created'?'扣费待核对':run.refunded_credits>0?`已退 ${run.refunded_credits} 积分`:'已扣费，尚无退款记录'}</p>
        {run.status==='outcome_unknown'&&<p className="mt-1 text-amber-600">结果待核对，请勿重复提交。</p>}
        <p className="mt-1 break-all text-slate-500">来源：{run.recovery_meta?.source==='agent'?'Agent':'画布'}{run.generator_id?` · 节点 ${run.generator_id}`:''}</p>
        <p className="mt-1 line-clamp-2">{run.recovery_meta?.prompt}</p>
        <p className="mt-1 break-all text-slate-500">{new Date(run.created_at).toLocaleString()}<br/>任务编号：{run.request_id}<br/>报价版本：{run.price_version}</p>
      </article>)}
    </div>
  </details>;
}
