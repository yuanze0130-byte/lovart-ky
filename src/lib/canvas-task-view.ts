import type { CanvasTaskLogEntry } from './canvas-task-log';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

export type TaskView = Omit<CanvasTaskLogEntry, 'status'> & {
  status: CanvasTaskLogEntry['status'] | 'unknown';
  origin: 'local' | 'image-ledger' | 'video-ledger';
  requestId?: string;
  quote?: number;
  billing?: string;
  localEntry?: CanvasTaskLogEntry;
};
export interface ImageLedgerEntry {
  request_id: string; status: string; created_at: string; updated_at?: string;
  meta?: { generatorId?: string; modelVariant?: string; quotedCredits?: number; billingState?: string; prompt?: string; source?: string; taskId?: string };
}
export interface VideoLedgerEntry {
  request_id: string; task_id?: string | null; status: string; created_at: string;
  generator_id?: string | null; model_id: string; charged_credits: number; refunded_credits: number;
  failure_reason?: string | null; recovery_meta?: { prompt?: string; source?: string };
}

export function indexTaskResults(elements: CanvasElement[]) {
  const index = new Map<string, CanvasElement[]>();
  for (const element of elements) {
    if ((element.type !== 'image' && element.type !== 'video') || !element.content) continue;
    const requestId = element.generationMetadata?.recoveryRequestId;
    const taskId = element.generationMetadata?.taskId;
    const keys = [typeof requestId === 'string' ? `${element.type}:request:${requestId}` : '', typeof taskId === 'string' ? `${element.type}:task:${taskId}` : ''].filter(Boolean);
    for (const key of keys) index.set(key, [...(index.get(key) || []), element]);
  }
  return index;
}

export function resultsForTask(entry: TaskView, index: ReturnType<typeof indexTaskResults>) {
  const matches = [
    ...(index.get(`${entry.kind}:request:${entry.requestId || entry.id}`) || []),
    ...(entry.taskId ? index.get(`${entry.kind}:task:${entry.taskId}`) || [] : []),
  ];
  return Array.from(new Map(matches.map(element => [element.id, element])).values());
}
function statusOf(value: string): TaskView['status'] {
  if (value === 'created' || value === 'queued') return 'queued';
  if (['starting', 'running', 'processing'].includes(value)) return 'running';
  if (value === 'succeeded') return 'succeeded';
  if (value === 'cancelled') return 'cancelled';
  if (value === 'failed' || value === 'refunded') return 'failed';
  return 'unknown';
}
const imageBilling: Record<string, string> = {
  not_charged: '未扣费', charged: '已扣费', refunded: '已退款', refund_pending: '退款待核对',
  charged_pending_review: '已扣费，结果待核对', needs_review: '扣费待核对',
};

// Ledger status/billing wins over an older client log. Only exact identities
// are merged: two jobs from the same generator are still separate jobs.
export function buildCanvasTaskView(projectId: string, local: CanvasTaskLogEntry[], images: ImageLedgerEntry[], videos: VideoLedgerEntry[]): TaskView[] {
  const remote: TaskView[] = [
    ...images.map((run): TaskView => {
      const status = statusOf(run.status), meta = run.meta || {};
      return { id: `image:${run.request_id}`, requestId: run.request_id, projectId, taskId: meta.taskId,
        nodeId: meta.generatorId, kind: 'image', status, origin: 'image-ledger', level: status === 'failed' ? 'error' : 'info',
        progress: status === 'succeeded' ? 100 : 0, message: meta.source === 'agent' ? 'Agent 生图' : '图片生成',
        model: meta.modelVariant, promptPreview: meta.prompt, quote: meta.quotedCredits,
        billing: imageBilling[meta.billingState || ''] || '扣费状态未记录',
        createdAt: run.created_at, updatedAt: run.updated_at || run.created_at };
    }),
    ...videos.map((run): TaskView => {
      const status = statusOf(run.status);
      return { id: `video:${run.request_id}`, requestId: run.request_id, projectId, taskId: run.task_id || undefined,
        nodeId: run.generator_id || undefined, kind: 'video', status, origin: 'video-ledger', level: status === 'failed' ? 'error' : 'info',
        progress: status === 'succeeded' ? 100 : 0, message: run.recovery_meta?.source === 'agent' ? 'Agent 视频' : '视频生成',
        model: run.model_id, promptPreview: run.recovery_meta?.prompt, quote: run.charged_credits,
        billing: run.status === 'created' ? '扣费待核对' : run.refunded_credits > 0 ? `已退 ${run.refunded_credits} 积分` : '已扣费，尚无退款记录',
        error: run.failure_reason || undefined, createdAt: run.created_at, updatedAt: run.created_at };
    }),
  ];
  const remaining = local.filter(entry => entry.projectId === projectId);
  const used = new Set<string>();
  for (const run of remote) {
    const match = remaining.find(entry => entry.kind === run.kind && (entry.id === run.requestId || Boolean(run.taskId && entry.taskId === run.taskId)));
    if (match) {
      used.add(match.id);
      run.nodeId ||= match.nodeId;
      run.promptPreview ||= match.promptPreview;
      // A remote job must never expose the old unconditional client retry.
      run.referenceLabels = match.referenceLabels;
      run.referenceCount = match.referenceCount;
    }
  }
  const combined: TaskView[] = [...remote, ...remaining.filter(entry => !used.has(entry.id)).map(entry => ({ ...entry, origin: 'local' as const, localEntry: entry }))];
  return combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
