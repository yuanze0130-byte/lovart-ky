export type ImageBatchStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'cancelled';
export interface ImageBatchRow {
  id: string;
  prompt: string;
  requestId: string;
  status: ImageBatchStatus;
  credits: number;
  result?: string;
  error?: string;
  dependsOn?: string;
  referenceImage?: string;
  sourceRowIndex?: number;
  outputBaseline?: string;
}
export type ImageBatchOutcome = { status: 'succeeded'; result: string } | { status: 'failed' | 'unknown' | 'cancelled'; error: string };

// A restored in-flight request is never submitted again automatically.
export function restoreImageBatch(rows: ImageBatchRow[]): ImageBatchRow[] {
  return rows.map(row => row.status === 'running' ? { ...row, status: 'unknown', error: '上次提交的结果待核对' } : { ...row });
}

export function imageBatchQuote(rows: ImageBatchRow[]) {
  return rows.filter(row => row.status === 'queued').reduce((total, row) => total + row.credits, 0);
}

export class ImageBatchQueue {
  private rows: ImageBatchRow[];
  private active = false;
  private stopped = false;
  private persistence: Promise<void> = Promise.resolve();
  constructor(rows: ImageBatchRow[], private readonly save: (rows: ImageBatchRow[]) => Promise<void>) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id) || (row.dependsOn && !seen.has(row.dependsOn))) throw Error('批次依赖必须指向前面的有效行');
      seen.add(row.id);
    }
    this.rows = restoreImageBatch(rows);
  }
  snapshot() { return this.rows.map(row => ({ ...row })); }
  private persist() {
    const snapshot = this.snapshot();
    // A failed write prevents later submissions until a new queue is restored.
    this.persistence = this.persistence.then(() => this.save(snapshot));
    return this.persistence;
  }
  async cancelUnsubmitted() {
    this.stopped = true;
    this.rows = this.rows.map(row => row.status === 'queued' ? { ...row, status: 'cancelled' } : row);
    await this.persist();
  }
  async retryFailed(newRequestId: () => string) {
    if (this.active) throw Error('请等待当前批次完成');
    this.rows = this.rows.map(row => row.status === 'failed' ? { ...row, requestId: newRequestId(), status: 'queued', error: undefined } : row);
    this.stopped = false;
    await this.persist();
  }
  async reconcile(requestId: string, outcome: ImageBatchOutcome) {
    if (this.active) throw Error('请等待当前批次完成后核对');
    this.rows = this.rows.map(row => row.requestId === requestId && row.status === 'unknown' ? { ...row, ...outcome } : row);
    await this.persist();
  }
  async run(execute: (row: ImageBatchRow, references: string[]) => Promise<ImageBatchOutcome>, concurrency = 2) {
    if (this.active) return;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw Error('并发数应为 1–3');
    this.active = true;
    try {
      await this.persist();
      const worker = async () => {
        while (!this.stopped) {
          const row = this.rows.find(item => item.status === 'queued' && (!item.dependsOn || this.rows.some(parent=>parent.id===item.dependsOn && parent.status==='succeeded' && Boolean(parent.result?.trim()))));
          if (!row) return;
          row.status = 'running';
          await this.persist();
          // Cancellation can arrive while the submission journal is being saved.
          if (this.stopped) { row.status = 'cancelled'; await this.persist(); return; }
          let outcome: ImageBatchOutcome;
          try {
            const parent = this.rows.find(item=>item.id===row.dependsOn);
            const references = [row.referenceImage, parent?.result].filter((value): value is string=>Boolean(value));
            outcome = await execute({ ...row }, references);
            if (outcome.status === 'succeeded' && !outcome.result?.trim()) outcome = {status:'unknown',error:'任务未返回有效图片，下游已暂停'};
          }
          catch (error) { outcome = { status: 'unknown', error: error instanceof Error ? error.message : '结果待核对' }; }
          Object.assign(row, outcome);
          await this.persist();
        }
      };
      const results = await Promise.allSettled(Array.from({ length: concurrency }, worker));
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } finally { this.active = false; }
  }
}
