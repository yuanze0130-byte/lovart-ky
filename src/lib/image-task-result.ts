import { collectImageResponseCandidates, type ImageResponseCandidate } from './image-response-candidates';

export type ImageTaskObservation =
  | { state: 'pending' }
  | { state: 'result_pending' }
  | { state: 'failed'; reason: string }
  | { state: 'succeeded'; candidates: ImageResponseCandidate[] };

export function observeImageTask(payload: unknown): ImageTaskObservation {
  if (!payload || typeof payload !== 'object') return { state: 'pending' };
  const root = payload as Record<string, unknown>;
  const inner = root.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? root.data as Record<string, unknown> : root;
  const status = String(inner.status || '').toUpperCase();
  if (['FAILURE','FAILED','CANCELLED','CANCELED'].includes(status)) {
    return { state: 'failed', reason: typeof inner.fail_reason === 'string' ? inner.fail_reason.slice(0,500) : '上游明确返回任务失败' };
  }
  if (!['SUCCESS','SUCCEEDED','COMPLETED'].includes(status)) return { state: 'pending' };
  const candidates = collectImageResponseCandidates(inner.data || inner.images || inner.output || []);
  return candidates.length ? { state: 'succeeded', candidates } : { state: 'result_pending' };
}

export interface ImageTaskBinding {
  taskId: string;
  upstreamModel: string;
  pollBaseURL: string;
  targetLabel: 'primary' | 'fallback';
  routeGroup: string;
}
