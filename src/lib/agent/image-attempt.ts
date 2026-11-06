import { createHash } from 'node:crypto';

export type ImageAttempt = { status: string; result: unknown; meta: unknown };
export async function resolveImageAttempt(runId: string, step: number,
  read: (id: string) => Promise<ImageAttempt | null>, settled: (id: string) => Promise<boolean>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = attempt === 0 ? `${runId}:${step}` : `${runId}:${step}:retry:${attempt}`;
    const hex = createHash('sha256').update(key).digest('hex');
    const requestId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const previous = await read(requestId);
    if (!previous || previous.status === 'succeeded') return { requestId, previous, attempt };
    const meta = previous.meta && typeof previous.meta === 'object' ? previous.meta as Record<string, unknown> : {};
    if (previous.status !== 'failed' || !['refunded','not_charged'].includes(String(meta.billingState)) || !await settled(requestId)) {
      throw new Error(`第 ${step+1} 步结果或账务尚未确认，请在生图任务中核对，未重复提交`);
    }
  }
  throw new Error(`第 ${step+1} 步已尝试三次，请检查输入或渠道后创建新计划`);
}
