import type { AgentContext, AgentImagePlan } from './actions';
import type { AgentWorkflow, WorkflowScope } from './workflow';

export type StoredWorkflow = {
  workflow: AgentWorkflow;
  context: AgentContext;
  imagePlan?: AgentImagePlan;
  updatedAt: number;
};
type Mutation = { kind: 'create'; record: StoredWorkflow }
  | { kind: 'update'; workflowId: string; expectedRevision: number; next: AgentWorkflow };

function validate(record: StoredWorkflow, scope: WorkflowScope) {
  const plan = record.workflow;
  if (plan.schema !== 1 || plan.owner !== scope.owner || plan.projectId !== scope.projectId
    || record.context.projectId !== scope.projectId || !plan.id || !Number.isSafeInteger(plan.revision)
    || plan.revision < 0 || !Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 24
    || JSON.stringify(record).length > 2_000_000) throw new Error('工作流记录无效或过大，未提交任务');
}

/** One active workflow per account/project. Revision checks and writes share one IDB transaction. */
export async function workflowStore(scope: WorkflowScope, mutation?: Mutation): Promise<StoredWorkflow | null> {
  if (!scope.owner || !scope.projectId) throw new Error('请先打开已登录的项目');
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('doodleverse-agent-workflows', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('workflows');
    opening.onerror = opening.onblocked = () => reject(new Error('无法读取工作流，请稍后重试'));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('workflows', mutation ? 'readwrite' : 'readonly');
      const store = tx.objectStore('workflows');
      const key = JSON.stringify([scope.owner, scope.projectId]);
      const request = store.get(key);
      let result: StoredWorkflow | null = null;
      let error: Error | null = null;
      request.onsuccess = () => {
        try {
          const existing = request.result as StoredWorkflow | undefined;
          if (existing) validate(existing, scope);
          result = existing || null;
          if (!mutation) return;
          if (mutation.kind === 'create') {
            validate(mutation.record, scope);
            if (mutation.record.workflow.revision !== 0 || mutation.record.workflow.steps.some(s => s.attempt !== 0 || s.status !== 'pending')) throw new Error('新工作流必须从未执行状态开始');
            if (existing && !['completed', 'cancelled'].includes(existing.workflow.status)) throw new Error('请先完成或结束当前工作流');
            if (existing?.workflow.id === mutation.record.workflow.id) throw new Error('请勿复用已结束的工作流标识');
            result = structuredClone(mutation.record);
          } else {
            if (!existing || existing.workflow.id !== mutation.workflowId
              || existing.workflow.revision !== mutation.expectedRevision) throw new Error('工作流已在其他页面更新，请重新读取');
            if (mutation.next.id !== existing.workflow.id || mutation.next.revision !== existing.workflow.revision + 1) throw new Error('工作流版本不连续');
            result = { ...existing, workflow: structuredClone(mutation.next), updatedAt: Date.now() };
            validate(result, scope);
          }
          store.put(result, key);
        } catch (cause) {
          error = cause instanceof Error ? cause : new Error('工作流保存失败');
          tx.abort();
        }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(error || new Error('工作流未能保存，未提交任务')); };
      tx.onerror = () => { /* Abort rejects after the transaction has rolled back. */ };
    };
  });
}
