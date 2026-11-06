import { claimWorkflowStep, nextWorkflowStep, settleWorkflowStep, workflowInputs,
  type WorkflowArtifact, type WorkflowScope, type WorkflowStep } from './workflow';
import { workflowStore, type StoredWorkflow } from './workflow-store';

export type WorkflowOutcome = { status: 'completed'; output: WorkflowArtifact[] }
  | { status: 'failed' | 'unknown'; error: string };
export type WorkflowExecution = { record: StoredWorkflow; step: WorkflowStep; inputs: WorkflowArtifact[] };
export type WorkflowAdapter<Permit> = {
  /** Preview and approve before claiming. Approval must not submit a paid request. */
  approve: (execution: WorkflowExecution) => Promise<Permit | null>;
  execute: (execution: WorkflowExecution, permit: Permit) => Promise<WorkflowOutcome>;
  /** Strictly query an existing requestId; never call the generation endpoint here. */
  reconcile: (execution: WorkflowExecution) => Promise<WorkflowOutcome>;
};

async function finish(scope: WorkflowScope, execution: WorkflowExecution, outcome: WorkflowOutcome) {
  const current = await workflowStore(scope);
  if (!current || current.workflow.id !== execution.record.workflow.id) throw new Error('原工作流已关闭，结果保留在任务记录中');
  const next = settleWorkflowStep(current.workflow, scope, execution.step.id, execution.step.attempt, outcome);
  return workflowStore(scope, { kind: 'update', workflowId: current.workflow.id, expectedRevision: current.workflow.revision, next });
}

/** Executes one approved step. Caller re-renders and chooses whether to continue. */
export async function advanceWorkflow<Permit>(scope: WorkflowScope, adapter: WorkflowAdapter<Permit>) {
  const record = await workflowStore(scope);
  if (!record) throw new Error('没有可执行的工作流');
  const step = nextWorkflowStep(record.workflow, scope);
  if (!step) return record;
  const inputs = workflowInputs(record.workflow, step.id)!;
  const permit = await adapter.approve({ record, step, inputs });
  if (permit === null) return workflowStore(scope);
  // CAS after approval prevents a second tab, pause, cancellation or changed selection from submitting.
  const claimed = await workflowStore(scope, { kind: 'update', workflowId: record.workflow.id,
    expectedRevision: record.workflow.revision, next: claimWorkflowStep(record.workflow, scope, step.id) });
  const execution = { record: claimed!, step: claimed!.workflow.steps.find(s => s.id === step.id)!, inputs };
  let outcome: WorkflowOutcome;
  try { outcome = await adapter.execute(execution, permit); }
  catch { outcome = { status: 'unknown', error: '请求中断，须查询原任务状态后继续，未重新提交' }; }
  // Keep failures writing results visible. A storage failure must never cause resubmission.
  return finish(scope, execution, outcome);
}

export async function reconcileWorkflow<Permit>(scope: WorkflowScope, adapter: WorkflowAdapter<Permit>) {
  const record = await workflowStore(scope);
  if (!record) throw new Error('工作流不存在');
  const step = record.workflow.steps.find(s => s.status === 'unknown' || s.status === 'running');
  if (!step) return record;
  const execution = { record, step, inputs: workflowInputs(record.workflow, step.id) || [] };
  let outcome: WorkflowOutcome;
  try { outcome = await adapter.reconcile(execution); }
  catch { outcome = { status: 'unknown', error: '原任务暂时无法查询，请稍后核对' }; }
  return finish(scope, execution, outcome);
}
