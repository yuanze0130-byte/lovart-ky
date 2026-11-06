/** Shared workflow state for Agent plans and dependent table rows.
 * Persist a claimed step before submitting it. Unknown outcomes are query-only.
 * These transitions do not authorize billing; executors must verify server quotes.
 */
export type WorkflowArtifact =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; url: string; nodeId?: string; ordinal: number;
      prompt?:string;modelId?:import('../image-models').ImageModelId;resolution?:import('../image-models').ImageModelResolution;
      workflowId?:string;workflowStepId?:string;sourceImageId?:string };
export type WorkflowDependency = { stepId: string; kind: WorkflowArtifact['kind']; selected?: boolean };
export type WorkflowStep = {
  id: string;
  kind: 'analyze' | 'prompt' | 'generate' | 'edit';
  title: string;
  input: string;
  dependencies: WorkflowDependency[];
  status: 'pending' | 'running' | 'unknown' | 'completed' | 'failed' | 'cancelled';
  requestId: string;
  attempt: number;
  output: WorkflowArtifact[];
  selectedArtifactId?: string;
  error?: string;
};
export type AgentWorkflow = {
  schema: 1;
  id: string;
  owner: string;
  projectId: string;
  revision: number;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  steps: WorkflowStep[];
};
export type WorkflowScope = Pick<AgentWorkflow, 'owner' | 'projectId'>;
export type WorkflowStepDefinition = Pick<WorkflowStep, 'id' | 'kind' | 'title' | 'input' | 'dependencies'>;

function assertScope(plan: AgentWorkflow, scope: WorkflowScope) {
  if (plan.owner !== scope.owner || plan.projectId !== scope.projectId) throw new Error('工作流不属于当前账号或项目');
}
function stepById(plan: AgentWorkflow, id: string) {
  const step = plan.steps.find((item) => item.id === id);
  if (!step) throw new Error('工作流步骤不存在');
  return step;
}
function revised(plan: AgentWorkflow) {
  const next = structuredClone(plan);
  next.revision += 1;
  return next;
}
export function createWorkflow(scope: WorkflowScope, id: string, definitions: WorkflowStepDefinition[]): AgentWorkflow {
  if (!scope.owner || !scope.projectId || !id || !definitions.length || definitions.length > 24) throw new Error('工作流参数无效');
  const seen = new Set<string>();
  for (const step of definitions) {
    if (!step.id || seen.has(step.id) || !step.title.trim() || !step.input.trim()
      || !['analyze', 'prompt', 'generate', 'edit'].includes(step.kind)) throw new Error('工作流步骤无效');
    // Ordered dependencies make cycles and forward references impossible.
    if (step.dependencies.some((dep) => !seen.has(dep.stepId) || !['image', 'text'].includes(dep.kind))) {
      throw new Error('依赖必须指向前面的有效步骤');
    }
    seen.add(step.id);
  }
  return {
    schema: 1, ...scope, id, revision: 0, status: 'active',
    steps: definitions.map((step) => ({ ...structuredClone(step), status: 'pending', attempt: 0,
      requestId: crypto.randomUUID(), output: [] })),
  };
}
export function workflowInputs(plan: AgentWorkflow, stepId: string): WorkflowArtifact[] | null {
  const step = stepById(plan, stepId);
  const inputs: WorkflowArtifact[] = [];
  for (const dep of step.dependencies) {
    const parent = stepById(plan, dep.stepId);
    if (parent.status !== 'completed') return null;
    const matches = parent.output.filter((item) => item.kind === dep.kind
      && (!dep.selected || item.id === parent.selectedArtifactId));
    if (!matches.length) return null;
    inputs.push(...matches);
  }
  return structuredClone(inputs);
}
/** Use the selected dependency, never the original canvas selection, for later edits. */
export function workflowSourceId(plan: AgentWorkflow, stepId: string, fallback?: string): string | undefined {
  const step = stepById(plan, stepId);
  if (step.kind !== 'edit') return undefined;
  const source = workflowInputs(plan, stepId)?.find(item=>item.kind === 'image');
  return source?.kind === 'image' ? source.nodeId || source.id : step.dependencies.some(dep=>dep.kind==='image') ? undefined : fallback;
}
export function nextWorkflowStep(plan: AgentWorkflow, scope: WorkflowScope): WorkflowStep | null {
  assertScope(plan, scope);
  if (plan.status !== 'active' || plan.steps.some((s) => s.status === 'running' || s.status === 'unknown')) return null;
  const step = plan.steps.find((s) => s.status === 'pending' && workflowInputs(plan, s.id) !== null);
  return step ? structuredClone(step) : null;
}
export function claimWorkflowStep(plan: AgentWorkflow, scope: WorkflowScope, stepId: string): AgentWorkflow {
  if (nextWorkflowStep(plan, scope)?.id !== stepId) throw new Error('步骤尚不可执行，可能在等待前置结果或用户选择');
  const next = revised(plan), step = stepById(next, stepId);
  step.status = 'running'; step.attempt += 1; delete step.error;
  return next;
}
export function settleWorkflowStep(plan: AgentWorkflow, scope: WorkflowScope, stepId: string, attempt: number,
  outcome: { status: 'completed'; output: WorkflowArtifact[] } | { status: 'failed' | 'unknown'; error: string }): AgentWorkflow {
  assertScope(plan, scope);
  const current = stepById(plan, stepId);
  if (current.attempt !== attempt || !['running', 'unknown'].includes(current.status)) throw new Error('步骤回传已过期');
  if (outcome.status === 'completed') {
    const ids = new Set<string>();
    const ordinals = new Set<number>();
    for (const artifact of outcome.output) {
      if (!artifact.id || ids.has(artifact.id)) throw new Error('结果标识无效');
      ids.add(artifact.id);
      if (artifact.kind === 'image') {
        if (!artifact.url.trim() || !Number.isSafeInteger(artifact.ordinal) || artifact.ordinal < 1 || ordinals.has(artifact.ordinal)) throw new Error('图片结果无效');
        ordinals.add(artifact.ordinal);
      } else if (artifact.kind !== 'text' || !artifact.text.trim()) throw new Error('文字结果无效');
    }
    const expectedKind = ['generate', 'edit'].includes(current.kind) ? 'image' : 'text';
    if (!outcome.output.some((a) => a.kind === expectedKind)) throw new Error('缺少有效结果，须继续查询原任务');
  }
  const next = revised(plan), step = stepById(next, stepId);
  step.status = outcome.status;
  if (outcome.status === 'completed') { step.output = structuredClone(outcome.output); delete step.error; }
  else step.error = outcome.error;
  if (next.status !== 'cancelled' && next.steps.every((s) => s.status === 'completed')) next.status = 'completed';
  return next;
}
export function controlWorkflow(plan: AgentWorkflow, scope: WorkflowScope, action: 'pause' | 'resume' | 'cancel'): AgentWorkflow {
  assertScope(plan, scope);
  if (plan.status === 'completed' || plan.status === 'cancelled') throw new Error('工作流已结束');
  const next = revised(plan);
  next.status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'cancelled';
  // Submitted steps remain reconcilable even after the user cancels future work.
  if (action === 'cancel') for (const step of next.steps) if (['pending', 'failed'].includes(step.status)) step.status = 'cancelled';
  return next;
}
export function retryWorkflowStep(plan: AgentWorkflow, scope: WorkflowScope, stepId: string): AgentWorkflow {
  assertScope(plan, scope);
  if (!['active', 'paused'].includes(plan.status)) throw new Error('工作流已结束');
  const next = revised(plan), step = stepById(next, stepId);
  if (step.status !== 'failed') throw new Error('仅可重试已确认失败的步骤；未知任务须先查询');
  step.status = 'pending'; delete step.error;
  // Text failures are only exposed after the server confirms no provider submission.
  // Keep the failed ledger immutable and use a fresh request for that text attempt.
  if (step.kind === 'analyze' || step.kind === 'prompt') step.requestId = crypto.randomUUID();
  // Image retries retain identity so the existing ledger reuses successful images.
  return next;
}
export function selectWorkflowArtifact(plan: AgentWorkflow, scope: WorkflowScope, stepId: string, artifactId: string): AgentWorkflow {
  assertScope(plan, scope);
  if (!['active', 'paused'].includes(plan.status)) throw new Error('工作流已结束');
  const next = revised(plan), step = stepById(next, stepId);
  if (step.status !== 'completed' || !step.output.some((a) => a.id === artifactId)) throw new Error('所选结果不存在');
  if (next.steps.some((s) => s.dependencies.some((d) => d.stepId === stepId && d.selected) && s.attempt > 0)) {
    throw new Error('后续任务已提交，请新建修改步骤以切换引用');
  }
  step.selectedArtifactId = artifactId;
  return next;
}
export function recoverWorkflow(plan: AgentWorkflow, scope: WorkflowScope): AgentWorkflow {
  assertScope(plan, scope);
  const next = revised(plan);
  for (const step of next.steps) if (step.status === 'running') {
    step.status = 'unknown'; step.error = '执行中断，正在等待原任务状态核对';
  }
  return next;
}
