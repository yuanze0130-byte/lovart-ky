'use client';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
type Run={request_id:string;status:string;meta:{agentStep?:number;agentAttempt?:number;billingState?:string}};
const statuses:Record<string,string>={running:'生成中',succeeded:'已完成',failed:'失败',outcome_unknown:'结果待核对'};
export function AgentPlanProgress({plan,isRunning,onResume,onStop,onDismiss}:{plan:{projectId:string;runId:string;applied?:boolean;preview:{steps:string[];stepNumbers?:number[];estimatedCredits:number;scope:string}};isRunning:boolean;onResume:()=>Promise<unknown>;onStop:()=>void;onDismiss:()=>Promise<void>}) {
  const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(true);
  useEffect(()=>{
    if(!open)return;
    let active=true;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const response=await authedFetch(`/api/projects/image-runs?id=${encodeURIComponent(plan.projectId)}&history=1&run=${encodeURIComponent(plan.runId)}`);
        if(!response.ok)throw new Error('步骤状态读取失败，稍后重试');
        const data=await response.json() as Run[];
        if(active){setRuns(data);setError('');}
      } catch {if(active)setError('步骤状态读取失败，稍后重试');}
      finally {if(active)timer=setTimeout(()=>void poll(),5000);}
    };
    void poll();return()=>{active=false;clearTimeout(timer);};
  },[open,plan.projectId,plan.runId]);
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="relative text-xs">
    <summary className="cursor-pointer">Agent 执行计划</summary>
    <section aria-label="Agent 逐步进度" className="absolute right-0 top-7 z-[210] max-h-[65vh] w-[min(420px,90vw)] overflow-auto rounded-xl border bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-white">
      <p>{plan.preview.scope} · 预计合计 {plan.preview.estimatedCredits} 积分</p>
      <p className="my-2 text-slate-500">状态来自已登记的任务；查询不会重新生成。取消页面请求后，上游任务仍可能继续。</p>
      <div className="my-3 flex gap-3">{isRunning ? <button onClick={onStop}>停止后续步骤</button> : <>{!plan.applied && <button onClick={() => void onResume().catch(error => setError(error instanceof Error ? error.message : '继续失败'))}>继续计划</button>}<button onClick={() => { if (plan.applied || window.confirm('结束此计划？已提交的任务仍会保留在任务记录中。')) void onDismiss().catch(() => setError('结束计划失败')); }}>{plan.applied ? '关闭计划' : '结束计划'}</button></>}</div>
      {error&&<p role="alert" className="text-red-500">{error}</p>}
      <ol>{plan.preview.steps.map((step,index)=>{
        const stepNumber=plan.preview.stepNumbers ? plan.preview.stepNumbers[index] : index<plan.preview.steps.length-1 ? index+1 : undefined;
        const attempts=runs.filter(run=>stepNumber!==undefined && run.meta.agentStep===stepNumber).sort((a,b)=>(b.meta.agentAttempt||1)-(a.meta.agentAttempt||1));
        const latest=attempts[0];
        return <li key={index} className="border-t py-3"><p>{index+1}. {step}</p><p className="mt-1">{latest?(statuses[latest.status]||'待核对'):(index === plan.preview.steps.length - 1 && plan.applied ? '已加入画布' : '尚未完成')}{latest&&` · 第 ${latest.meta.agentAttempt||1} 次尝试`}</p>{latest?.meta.billingState==='refunded'&&<p>已退款</p>}{latest?.meta.billingState==='refund_pending'&&<p>退款待核对</p>}</li>;
      })}</ol>
    </section>
  </details>;
}
