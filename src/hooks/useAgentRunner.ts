'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { persistentAgentRetry, agentRetryKey } from '@/lib/agent/retry-session';
import { agentCheckpoint, type AgentCheckpoint } from '@/lib/agent/checkpoint';
import { useAgentPlanApproval, type AgentProposal } from './useAgentPlanApproval';
import type { AgentActionResult, AgentChatResult, AgentChatTurn, AgentContext, AgentMode, AgentRunResponse } from '@/lib/agent/actions';

async function parseAgentRunError(response: Response): Promise<never> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as Partial<AgentRunResponse> | null;
    throw new Error(data?.error || `Agent run failed (${response.status})`);
  }

  const text = await response.text().catch(() => '');
  throw new Error(text || `Agent run failed (${response.status})`);
}

export function useAgentRunner(owner?: string, projectId?: string | null) {
  const {state:planApproval,ask:askApproval,reprice:repricePlan,confirm:confirmPlan} = useAgentPlanApproval();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AgentActionResult | null>(null);
  const [chat, setChat] = useState<AgentChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const [activePlan,setActivePlan] = useState<AgentCheckpoint|null>(null);
  const scopeRef = useRef({owner,projectId});
  scopeRef.current = {owner,projectId};
  useEffect(() => {
    setResult(null);setChat(null);setError(null);setActivePlan(null);
    let current = true;
    if (owner && projectId) void agentCheckpoint(owner, projectId).then(plan => { if (current) setActivePlan(plan); }).catch(() => { if (current) setError('执行计划读取失败，请稍后重试'); });
    return () => { current = false; activeRequestRef.current?.abort(); };
  }, [owner,projectId]);

  const runAgent = useCallback(async (message: string, context: AgentContext, options?: { mode?: AgentMode; history?: AgentChatTurn[]; resume?: boolean }) => {
    if (activeRequestRef.current) {
      throw new Error('Agent 正在执行，请等待当前任务完成或先取消');
    }
    const controller = new AbortController();
    const assertCurrent = () => {
      if (scopeRef.current.owner !== owner || scopeRef.current.projectId !== projectId) controller.abort();
      controller.signal.throwIfAborted();
    };
    activeRequestRef.current = controller;
    setIsRunning(true);
    setError(null);

    try {
      // Newly produced assets must not turn a retry of the same image plan into a new paid run.
      if (!owner) throw new Error('请先登录再执行 Agent 任务');
      const saved = projectId ? await agentCheckpoint(owner, projectId) : null;
      assertCurrent();
      if (options?.resume && (!saved || saved.applied)) throw new Error('没有需要继续的执行计划');
      if (!options?.resume && saved && !saved.applied) throw new Error('此项目有未完成计划，请先使用“继续计划”或“结束计划”');
      let retryKey = options?.resume ? saved!.retryKey : await agentRetryKey(owner, message, context, options?.mode);
      assertCurrent();
      let runId = options?.resume ? saved!.runId : await persistentAgentRetry(retryKey);
      assertCurrent();
      let payload = options?.resume ? saved!.payload : { message, context, mode: options?.mode, history: options?.history, runId };
      const previewResponse = await authedFetch('/api/agent/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, phase: 'preview' }), signal: controller.signal,
      });
      if (!previewResponse.ok) await parseAgentRunError(previewResponse);
      let prepared = await previewResponse.json() as AgentRunResponse;
      assertCurrent();
      if (!prepared.preview) throw new Error('未能取得执行计划，未开始生成');
      const approved = await askApproval({payload,prepared,retryKey,locked:Boolean(options?.resume)}, async (current, imagePlan, referenceId):Promise<AgentProposal> => {
        assertCurrent();
        const nextPayload = {...current.payload,imagePlan,context:{...current.payload.context,referenceId}};
        const nextKey = await agentRetryKey(owner,nextPayload.message,nextPayload.context,nextPayload.mode,imagePlan);
        nextPayload.runId = await persistentAgentRetry(nextKey);
        assertCurrent();
        const response = await authedFetch('/api/agent/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...nextPayload,phase:'preview'}),signal:controller.signal});
        if(!response.ok) await parseAgentRunError(response);
        const next = await response.json() as AgentRunResponse;
        assertCurrent();
        if(!next.preview) throw new Error('未能取得最新报价');
        return {payload:nextPayload,prepared:next,retryKey:nextKey,locked:false};
      },controller.signal);
      payload=approved.payload; prepared=approved.prepared;retryKey=approved.retryKey;runId=payload.runId!;
      const preview=prepared.preview!;
      assertCurrent();
      let checkpoint: AgentCheckpoint | null = null;
      if (payload.context.projectId && prepared.action && ['generate_images','create_grid','create_character_three_view','edit_selected_image','generate_storyboard_image'].includes(prepared.action.type)) {
        checkpoint = {owner,projectId:payload.context.projectId,runId,retryKey,payload,preview,applied:false,updatedAt:Date.now()};
        checkpoint = await agentCheckpoint(owner, payload.context.projectId, checkpoint);
        assertCurrent(); setActivePlan(checkpoint);
      } else setActivePlan(null);
      const response = await authedFetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, phase: 'execute', planDigest: preview.digest }),
        signal: controller.signal,
      });

      if (!response.ok) {
        await parseAgentRunError(response);
      }

      const data = (await response.json()) as AgentRunResponse;
      assertCurrent();
      if (!data.ok || (!data.result && !data.chat)) {
        throw new Error(data.error || 'Agent run failed');
      }

      assertCurrent();
      setResult(data.result || null);
      setChat(data.chat || null);
      return {
        ...data,
        runId,
        sourceImageId:prepared.action?.type==='generate_images' || prepared.action?.type==='edit_selected_image' ? preview.reference?.id || payload.context.selectedElementId || undefined : undefined,
        // Keep the retry identity until the caller has applied the result. In
        // particular, an asset decode failure must replay the existing paid run.
        acknowledgeApplied: async () => {
          assertCurrent();
          if (data.result?.kind === 'images_generated' && data.result.incomplete) return;
          if (checkpoint) {
            const applied = await agentCheckpoint(owner, checkpoint.projectId, {...checkpoint,applied:true,updatedAt:Date.now()});
            assertCurrent(); setActivePlan(applied);
          }
          try { await persistentAgentRetry(retryKey, runId); } catch { /* Retain safe replay identity. */ }
        },
      };
    } catch (err) {
      // A failed follow-up must not erase the previous completed result.
      const message = controller.signal.aborted
        ? '已停止后续步骤；已提交的任务仍会保留，请核对状态后继续'
        : err instanceof Error ? err.message : 'Agent run failed';
      if (scopeRef.current.owner === owner && scopeRef.current.projectId === projectId) setError(message);
      throw new Error(message);
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        setIsRunning(false);
      }
    }
  }, [owner,projectId,askApproval]);

  const cancelAgent = useCallback(() => {
    activeRequestRef.current?.abort();
  }, []);

  const dismissPlan = useCallback(async () => {
    if (!owner || !projectId || activeRequestRef.current) return;
    const plan = await agentCheckpoint(owner, projectId);
    if (plan) await agentCheckpoint(owner, projectId, undefined, plan.runId);
    if (scopeRef.current.owner === owner && scopeRef.current.projectId === projectId) setActivePlan(null);
  }, [owner, projectId]);

  return {
    planApproval,
    repricePlan,
    confirmPlan,
    dismissPlan,
    runAgent,
    isRunning,
    result,
    chat,
    error,
    cancelAgent,
    activePlan:activePlan && activePlan.owner === owner && activePlan.projectId === projectId ? activePlan : null,
  };
}
