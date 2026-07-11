"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentMode, AgentPanelResponse } from '@/lib/agent/actions';

export type AgentStage = 'idle' | 'analyzing' | 'planning' | 'building' | 'done';

export function useAgentPanelController(
  run: (message: string, options?: { mode?: AgentMode }) => Promise<AgentPanelResponse>,
) {
  const [agentStage, setAgentStage] = useState<AgentStage>('idle');
  const completionTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
  }, []);

  const submit = useCallback(async (message: string, options?: { mode?: AgentMode }) => {
    const normalized = message.trim();
    if (!normalized) throw new Error('请输入 Agent 任务');
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    setAgentStage('analyzing');
    try {
      const response = await run(normalized, options);
      setAgentStage(response.plan && Object.keys(response.plan).length > 0 ? 'planning' : 'building');
      return response;
    } finally {
      setAgentStage('done');
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        setAgentStage('idle');
      }, 1200);
    }
  }, [run]);

  return { agentStage, submit };
}
