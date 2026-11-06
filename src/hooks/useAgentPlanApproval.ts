'use client';
import { useCallback, useRef, useState } from 'react';
import type { AgentImagePlan, AgentRunRequest, AgentRunResponse } from '@/lib/agent/actions';

export type AgentProposal = { payload:AgentRunRequest; prepared:AgentRunResponse; retryKey:string; locked:boolean };
type ApprovalState = { proposal:AgentProposal; busy:boolean; error:string };
type Session = { proposal:AgentProposal; busy:boolean; resolve:(p:AgentProposal)=>void; reject:(e:Error)=>void; reprice:(p:AgentProposal,plan?:AgentImagePlan,referenceId?:string)=>Promise<AgentProposal> };

export function useAgentPlanApproval() {
  const [state,setState] = useState<ApprovalState|null>(null);
  const session = useRef<Session|null>(null);
  const ask = useCallback(async (proposal:AgentProposal,reprice:Session['reprice'],signal:AbortSignal) => {
    signal.throwIfAborted();
    let onAbort:()=>void = () => {};
    try {
      return await new Promise<AgentProposal>((resolve,reject)=>{
        const current:Session={proposal,busy:false,resolve,reject,reprice};
        session.current=current;
        onAbort=()=>{ if(session.current===current){session.current=null;setState(null);reject(new Error('已取消执行计划'));} };
        signal.addEventListener('abort',onAbort,{once:true});
        setState({proposal,busy:false,error:''});
      });
    } finally { signal.removeEventListener('abort',onAbort); }
  },[]);
  const reprice = useCallback(async (plan?:AgentImagePlan,referenceId?:string) => {
    const current=session.current;
    if(!current || current.busy || current.proposal.locked)return;
    current.busy=true;setState({proposal:current.proposal,busy:true,error:''});
    try {
      const next=await current.reprice(current.proposal,plan,referenceId);
      if(session.current!==current)return;
      current.proposal=next;current.busy=false;
      setState({proposal:next,busy:false,error:''});
    } catch(error) {
      if(session.current!==current)return;
      current.busy=false;
      setState({proposal:current.proposal,busy:false,error:error instanceof Error?error.message:'报价更新失败'});
    }
  },[]);
  const confirm = useCallback(()=>{
    const current=session.current;if(!current || current.busy)return;
    session.current=null;setState(null);current.resolve(current.proposal);
  },[]);
  return { state,ask,reprice,confirm };
}
