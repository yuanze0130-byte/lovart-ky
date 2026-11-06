export interface ImageQueueOptions {
  key?: string;
  fingerprint?: string;
  projectId?: string;
  signal?: AbortSignal;
  onState?: (state: 'queued' | 'running' | 'cancelled') => void;
}

export class ImageQueueCancelledError extends Error {
  readonly code = 'IMAGE_NOT_SUBMITTED';
  readonly billingState = 'not_charged';
  readonly outcome = 'failed';
  constructor() { super('已取消排队，尚未提交或扣费'); this.name = 'ImageQueueCancelledError'; }
}

// Cancellation removes waiting work only. A started paid request keeps its slot
// and finishes into the server ledger even when its view has been closed.
export function createImageRequestQueue(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid queue limit');
  let active = 0;
  const waiting: Array<{ start: () => void; cancel: () => void; projectId?: string }> = [];
  const pending = new Map<string, { promise: Promise<unknown>; fingerprint?: string }>();
  const notify = (options: ImageQueueOptions, state: 'queued' | 'running' | 'cancelled') => {
    try { options.onState?.(state); } catch { /* Observers cannot change execution. */ }
  };
  const drain = () => { while (active < limit && waiting.length) waiting.shift()!.start(); };
  function run<T>(execute: () => Promise<T>, options: ImageQueueOptions = {}): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(new ImageQueueCancelledError());
    const existing = options.key ? pending.get(options.key) : undefined;
    if (existing) {
      if (existing.fingerprint !== options.fingerprint) return Promise.reject(new Error('该节点已有不同的任务，请等待完成后再提交'));
      return existing.promise as Promise<T>;
    }
    let started = false;
    let settled = false;
    let entry: (typeof waiting)[number];
    const promise = new Promise<T>((resolve, reject) => {
      const cancel = () => {
        if (started || settled) return;
        settled = true;
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        options.signal?.removeEventListener('abort', cancel);
        notify(options, 'cancelled');
        reject(new ImageQueueCancelledError());
      };
      entry = { projectId: options.projectId, cancel, start: () => {
        if (settled) return;
        started = true; active++;
        options.signal?.removeEventListener('abort', cancel);
        notify(options, 'running');
        Promise.resolve().then(execute).then(resolve, reject).finally(() => { settled = true; active--; drain(); });
      } };
      options.signal?.addEventListener('abort', cancel, { once: true });
      waiting.push(entry);
      notify(options, 'queued');
    });
    if (options.key) {
      const record = { promise, fingerprint: options.fingerprint };
      pending.set(options.key, record);
      void promise.finally(() => { if (pending.get(options.key!) === record) pending.delete(options.key!); }).catch(() => {});
    }
    drain();
    return promise;
  }
  run.cancelProject = (projectId: string) => { [...waiting].filter(entry => entry.projectId === projectId).forEach(entry => entry.cancel()); };
  run.snapshot = () => ({ active, queued: waiting.length, limit });
  return run;
}

export const runQueuedImageRequest = createImageRequestQueue(3);
