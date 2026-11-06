import type { AgentRunRequest, AgentRunResponse } from './actions';

export type AgentCheckpoint = {
  owner: string;
  projectId: string;
  runId: string;
  retryKey: string;
  payload: AgentRunRequest;
  preview: NonNullable<AgentRunResponse['preview']>;
  applied: boolean;
  updatedAt: number;
};

// A single unfinished plan per project. Store the original context so a changed
// selection after reload cannot silently change a resumed paid operation.
export async function agentCheckpoint(owner: string, projectId: string,
  write?: AgentCheckpoint, removeRunId?: string): Promise<AgentCheckpoint | null> {
  if (write && (write.owner !== owner || write.projectId !== projectId || JSON.stringify(write).length > 512_000)) {
    throw new Error('执行计划过大或归属不一致，未开始执行');
  }
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('doodleverse-agent-checkpoints', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('plans');
    open.onerror = open.onblocked = () => reject(new Error('无法读取执行计划，请稍后重试'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('plans', 'readwrite'), store = tx.objectStore('plans');
      const key = JSON.stringify([owner, projectId]);
      let result: AgentCheckpoint | null = null;
      const read = store.get(key);
      read.onsuccess = () => {
        const existing = read.result as AgentCheckpoint | undefined;
        if (existing && (existing.owner !== owner || existing.projectId !== projectId || !existing.runId || !existing.payload || !existing.preview)) {
          tx.abort(); return;
        }
        result = existing || null;
        if (removeRunId && existing?.runId === removeRunId) { store.delete(key); result = null; }
        if (write) {
          if (existing && !existing.applied && existing.runId !== write.runId) { tx.abort(); return; }
          // An old tab cannot turn an applied plan back into an unfinished plan.
          result = existing?.runId === write.runId && existing.applied ? existing : write;
          store.put(result, key);
        }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(new Error('请先处理此项目已有的执行计划，再开始新计划')); };
      tx.onerror = () => {};
    };
  });
}
