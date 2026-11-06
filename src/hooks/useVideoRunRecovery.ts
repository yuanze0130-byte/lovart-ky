'use client';
import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {CanvasElement} from '@/components/lovart/CanvasArea';
import {authedFetch} from '@/lib/authed-fetch';
import {importRemoteCanvasVideo} from '@/lib/canvas-asset-upload';

type Run={request_id:string;task_id:string|null;status:string;generator_id:string|null;charged_credits:number;refunded_credits:number;recovery_meta?:{prompt?:string;source?:string}};
export function useVideoRunRecovery(projectId:string|null,enabled:boolean,setElements:Dispatch<SetStateAction<CanvasElement[]>>,beginOperation:()=>void,owner?:string,refreshKey?:string) {
  const [message,setMessage]=useState('');
  const scope=useRef({projectId,owner});
  if(scope.current.projectId!==projectId||scope.current.owner!==owner)scope.current={projectId,owner};
  useEffect(()=>{
    if(!enabled||!projectId)return;
    const opening=scope.current;let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const current=()=>!cancelled&&scope.current===opening;
    const handled=new Set<string>();
    async function poll(){
      try{
        const runs:Run[]=[];let cursor='';const seen=new Set<string>();
        do{
          const response=await authedFetch(`/api/projects/video-runs?id=${projectId}${cursor?'&after='+encodeURIComponent(cursor):''}`);
          if(!current())return;
          if(!response.ok)throw Error('ledger');
          runs.push(...await response.json());cursor=response.headers.get('X-Recovery-Cursor')||'';
          if(cursor&&seen.has(cursor))throw Error('pagination');if(cursor)seen.add(cursor);
        }while(cursor);
        const completed:Array<{run:Run;url:string}>=[];let pending=0,unknown=0,errors=0;
        for(const run of runs){
          if(!current())return;
          if(handled.has(run.request_id)||['failed','cancelled'].includes(run.status))continue;
          if(!run.task_id){unknown++;continue;}
          try{
            const response=await authedFetch(`/api/video-status?taskId=${encodeURIComponent(run.task_id)}`);
            if(!response.ok)throw Error('status');
            const status=await response.json();
            if(status.status==='succeeded'&&typeof status.videoUrl==='string'&&status.videoUrl){
              if(!current())return;
              const url=await importRemoteCanvasVideo(status.videoUrl);
              completed.push({run,url});
            }
            else if(['failed','cancelled'].includes(status.status))handled.add(run.request_id);
            else if(status.status==='outcome_unknown')unknown++;
            else pending++;
          }catch{errors++;}
        }
        if(!current())return;
        if(completed.length){
          beginOperation();
          setElements(elements=>{
            if(!current())return elements;
            let next=elements;
            for(const {run,url} of completed){
              const existing=next.find(e=>e.id===run.request_id||e.generationMetadata?.recoveryRequestId===run.request_id||e.generationMetadata?.taskId===run.task_id&&e.type==='video');
              if(existing?.type==='video')continue;
              const source=existing||next.find(e=>e.id===run.generator_id);
              const video:CanvasElement={...existing,id:existing?.id||run.request_id,type:'video',content:url,x:existing?existing.x:source?source.x+(source.width||320)+96:100,y:source?.y??100,width:existing?.width||384,height:existing?.height||216,prompt:run.recovery_meta?.prompt,
                generationMetadata:{...existing?.generationMetadata,recoveryRequestId:run.request_id,taskId:run.task_id!,taskStatus:'succeeded',recoveredAfterReopen:true,chargedCredits:run.charged_credits,refundedCredits:run.refunded_credits}};
              next=existing?next.map(e=>e.id===existing.id?video:e):[...next,video];
            }
            return next;
          });
          completed.forEach(({run})=>handled.add(run.request_id));
        }
        setMessage([pending?`${pending} 个视频任务生成中`:'',unknown?`${unknown} 个视频任务待核对，请勿重复提交`:'',errors?`${errors} 个视频任务查询失败，将自动重试`:''].filter(Boolean).join('；'));
        if(pending||unknown||errors)timer=setTimeout(()=>void poll(),20000);
      }catch{if(current()){setMessage('视频任务恢复查询失败，将自动重试');timer=setTimeout(()=>void poll(),20000);}}
    }
    void poll();return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[projectId,enabled,setElements,beginOperation,owner,refreshKey]);
  return message;
}
