'use client';

import { useCallback, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import type { AgentActionResult, AgentChatResult, AgentContext, AgentMode, AgentRunResponse } from '@/lib/agent/actions';

async function parseAgentRunError(response: Response): Promise<never> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as Partial<AgentRunResponse> | null;
    throw new Error(data?.error || `Agent run failed (${response.status})`);
  }

  const text = await response.text().catch(() => '');
  throw new Error(text || `Agent run failed (${response.status})`);
}

export function useAgentRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AgentActionResult | null>(null);
  const [chat, setChat] = useState<AgentChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAgent = useCallback(async (message: string, context: AgentContext, options?: { mode?: AgentMode }) => {
    setIsRunning(true);
    setError(null);

    try {
      const response = await authedFetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, context, mode: options?.mode }),
      });

      if (!response.ok) {
        await parseAgentRunError(response);
      }

      const data = (await response.json()) as AgentRunResponse;
      if (!data.ok || (!data.result && !data.chat)) {
        throw new Error(data.error || 'Agent run failed');
      }

      setResult(data.result || null);
      setChat(data.chat || null);
      return data;
    } catch (err) {
      setResult(null);
      setChat(null);
      const message = err instanceof Error ? err.message : 'Agent run failed';
      setError(message);
      throw err;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    runAgent,
    isRunning,
    result,
    chat,
    error,
  };
}
