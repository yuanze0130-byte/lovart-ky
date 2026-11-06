"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentChatTurn, AgentMode, AgentPanelResponse } from '@/lib/agent/actions';

export type AgentStage = 'idle' | 'running' | 'partial' | 'failed' | 'done';

export function useAgentPanelController(
  run: (message: string, options?: { mode?: AgentMode; history?: AgentChatTurn[]; excludedReferenceIds?: string[] }) => Promise<AgentPanelResponse>,
) {
  const [agentStage, setAgentStage] = useState<AgentStage>('idle');
  const completionTimerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
  }, []);

  const submit = useCallback(async (message: string, options?: { mode?: AgentMode; history?: AgentChatTurn[]; excludedReferenceIds?: string[] }) => {
    const normalized = message.trim();
    if (!normalized) throw new Error('请输入 Agent 任务');
    if (runningRef.current) throw new Error('Agent 正在执行，请等待当前任务结束');
    runningRef.current = true;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setAgentStage('running');
    try {
      const response = await run(normalized, options);
      setAgentStage(response.incomplete ? 'partial' : 'done');
      if (!response.incomplete) {
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          setAgentStage('idle');
        }, 1200);
      }
      return response;
    } catch (error) {
      setAgentStage('failed');
      throw error;
    } finally {
      runningRef.current = false;
    }
  }, [run]);

  return { agentStage, submit };
}
