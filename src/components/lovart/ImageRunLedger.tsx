'use client';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';

type Run = { request_id: string; status: string; created_at: string; meta: {
  generatorId?: string; modelVariant?: string; resolution?: string; quotedCredits?: number; billingState?: string; prompt?: string; source?: string; agentStep?: number;
} };
const states: Record<string, string> = { running: '生成中', succeeded: '已完成', failed: '失败', outcome_unknown: '结果待核对' };
const billing: Record<string, string> = { not_charged: '未扣费', charged: '已扣费', refunded: '已退款', refund_pending: '退款待核对', charged_pending_review: '已扣费，结果待核对', needs_review: '扣费待核对' };
export function ImageRunLedger({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await authedFetch(`/api/projects/image-runs?id=${projectId}&history=1`);
        if (!response.ok) throw new Error('任务记录读取失败，稍后自动重试');
        const data: Run[] = await response.json();
        if (!cancelled) { setRuns(data); setError(''); setLoaded(true); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败'); }
      finally { if (!cancelled) timer = setTimeout(() => void poll(), 5000); }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, projectId]);
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="relative text-xs">
    <summary className="cursor-pointer">生图任务</summary>
    <div className="absolute right-0 top-7 z-[210] max-h-[65vh] w-[min(420px,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100">
      <p className="mb-3 font-medium">最近 100 条生图任务</p>
      <p className="mb-3 text-slate-500">查询不会重新生成或重复扣费。早期任务未记录的报价显示为“未记录”。</p>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      {!loaded && !error && <p role="status">正在读取…</p>}
      {loaded && !runs.length && <p>暂无已登记的生图任务</p>}
      {runs.map(run => <article key={run.request_id} className="border-t border-slate-200 py-3 dark:border-slate-700">
        <p>{run.meta.modelVariant || '图片'} · {run.meta.resolution || '—'} · {states[run.status] || '待核对'}</p>
        <p className="mt-1">报价：{typeof run.meta.quotedCredits === 'number' ? `${run.meta.quotedCredits} 积分` : '未记录'} · {billing[run.meta.billingState || ''] || '扣费状态未记录'}</p>
        <p className="mt-1 break-all text-slate-500">来源：{run.meta.source === 'agent' ? `Agent 第 ${run.meta.agentStep || '?'} 步 · ` : ''}{run.meta.generatorId ? `画布节点 ${run.meta.generatorId}` : '画布生图'}</p>
        <p className="mt-1 line-clamp-2">{run.meta.prompt}</p>
        <p className="mt-1 break-all text-slate-500">{new Date(run.created_at).toLocaleString()}<br />任务编号：{run.request_id}</p>
      </article>)}
    </div>
  </details>;
}
