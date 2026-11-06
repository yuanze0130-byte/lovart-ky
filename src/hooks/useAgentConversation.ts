'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { changeConversation, ConversationConflictError, conversationStore, emptyConversation, type AgentConversation, type ConversationChange, type ConversationMutation } from '@/lib/agent/conversation-store';

/** Account/project scoped local history. Loading history never calls an AI API. */
export function useAgentConversation(owner?: string, projectId?: string | null) {
  const scope = useMemo(() => ({ owner: owner || '', projectId: projectId || '' }), [owner, projectId]);
  const [record, setRecord] = useState<AgentConversation>(() => emptyConversation(scope));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(record);
  const mounted = useRef(false);
  const failed = useRef<ConversationMutation | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const show = useCallback((next: AgentConversation) => {
    if (!mounted.current || next.owner !== scope.owner || next.projectId !== scope.projectId) return;
    if (next.revision < current.current.revision) return;
    current.current = next; setRecord(next); setReady(true);
  }, [scope]);
  const read = useCallback(async () => {
    if (failed.current) return;
    try {
      const next = await conversationStore(scope);
      if (mounted.current && !failed.current) { show(next); setError(''); }
    } catch (cause) {
      if (mounted.current) { setReady(false); setError(cause instanceof Error ? cause.message : '聊天记录读取失败'); }
    }
  }, [scope, show]);
  useEffect(() => {
    mounted.current = true;
    if (scope.owner && scope.projectId) void read();
    else { setReady(true); setError(''); }
    const refresh = () => { if (!failed.current && scope.owner && scope.projectId) void queue.current.then(read); };
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel.current = new BroadcastChannel(`agent-chat:${JSON.stringify(scope)}`);
        channel.current.onmessage = refresh;
      } catch { /* Focus refresh remains available when cross-tab messaging is disabled. */ }
    }
    window.addEventListener('focus', refresh);
    return () => { mounted.current = false; channel.current?.close(); channel.current = null; window.removeEventListener('focus', refresh); };
  }, [scope, read]);

  const write = useCallback((mutation: ConversationMutation) => {
    const task = queue.current.then(async () => {
      if (failed.current) throw new Error('请先重试保存聊天记录');
      try {
        const next = await conversationStore(scope, mutation);
        show(next);
        if (mounted.current) setError('');
        try { channel.current?.postMessage('changed'); } catch { /* A saved message remains saved. */ }
        return next;
      } catch (cause) {
        failed.current = cause instanceof ConversationConflictError ? null : mutation;
        if (mounted.current) {
          // Keep an unsaved reply visible while retaining the exact mutation for retry.
          try { setRecord(changeConversation(current.current, mutation)); } catch { /* Preserve existing visible history. */ }
          setError(cause instanceof Error ? cause.message : '聊天记录保存失败');
        }
        throw cause;
      }
    });
    queue.current = task.catch(() => {});
    return task;
  }, [scope, show]);
  const mutate = useCallback((change: ConversationChange, epoch = current.current.epoch) => write({ ...change, epoch }), [write]);
  const retry = useCallback(async () => {
    const mutation = failed.current;
    failed.current = null;
    if (mutation) { try { await write(mutation); } catch { /* Displayed by write. */ } }
    else await read();
  }, [read, write]);
  return { record, ready, error, mutate, retry };
}
