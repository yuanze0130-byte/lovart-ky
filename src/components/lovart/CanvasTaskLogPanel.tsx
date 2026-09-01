'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Clock3, Copy, Crosshair, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import type { CanvasTaskLogEntry } from '@/lib/canvas-task-log';
import type { CanvasTaskLogSyncState } from '@/hooks/useCanvasTaskLog';

type TaskFilter = 'all' | 'active' | 'succeeded' | 'failed';

interface CanvasTaskLogPanelProps {
  entries: CanvasTaskLogEntry[];
  syncState: CanvasTaskLogSyncState;
  onClose: () => void;
  onClear: () => void;
  onLocateNode: (nodeId: string) => void;
  onRetryTask: (entry: CanvasTaskLogEntry) => void;
}

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '进行中' },
  { id: 'succeeded', label: '成功' },
  { id: 'failed', label: '失败' },
];

function statusLabel(status: CanvasTaskLogEntry['status']) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '生成中';
  if (status === 'succeeded') return '成功';
  if (status === 'cancelled') return '已取消';
  return '失败';
}

function StatusIcon({ entry }: { entry: CanvasTaskLogEntry }) {
  if (entry.status === 'succeeded') return <CheckCircle2 size={15} className="text-emerald-500" />;
  if (entry.status === 'failed') return <CircleAlert size={15} className="text-rose-500" />;
  if (entry.status === 'running') return <LoaderCircle size={15} className="animate-spin text-sky-500" />;
  return <Clock3 size={15} className="text-amber-500" />;
}

export function CanvasTaskLogPanel({ entries, syncState, onClose, onClear, onLocateNode, onRetryTask }: CanvasTaskLogPanelProps) {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const filtered = useMemo(() => entries.filter((entry) => {
    if (filter === 'active') return entry.status === 'queued' || entry.status === 'running';
    if (filter === 'succeeded') return entry.status === 'succeeded';
    if (filter === 'failed') return entry.status === 'failed' || entry.status === 'cancelled';
    return true;
  }), [entries, filter]);
  const activeCount = entries.filter((entry) => entry.status === 'queued' || entry.status === 'running').length;

  return (
    <section className="absolute bottom-4 left-1/2 z-[70] flex h-[360px] w-[min(920px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/94" aria-label="画布任务日志">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            任务日志
            {activeCount > 0 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-600 dark:bg-sky-400/10 dark:text-sky-200">{activeCount} 个进行中</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
            <span>当前项目最多保留 200 条任务记录</span>
            <span className={syncState === 'synced' ? 'text-emerald-500' : syncState === 'offline' ? 'text-amber-500' : ''}>
              {syncState === 'synced' ? '云端已同步' : syncState === 'syncing' ? '正在同步云端…' : syncState === 'offline' ? '云端不可用，已保存在本机' : '仅保存在本机'}
            </span>
          </div>
        </div>
        <button type="button" onClick={onClear} disabled={entries.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-white/10" title="清空日志"><Trash2 size={13} />清空</button>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" title="关闭日志"><X size={15} /></button>
      </header>
      <div className="flex gap-1 border-b border-gray-200 px-3 py-2 dark:border-white/10">
        {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-lg px-3 py-1.5 text-xs transition ${filter === item.id ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/8'}`}>{item.label}</button>)}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5"><StatusIcon entry={entry} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-100">{entry.message}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] text-gray-500 shadow-sm dark:bg-white/8 dark:text-gray-300">{statusLabel(entry.status)} · {Math.round(entry.progress)}%</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] text-gray-400 shadow-sm dark:bg-white/8">{entry.kind}</span>
                  {entry.model && <span className="max-w-48 truncate rounded-full bg-white px-2 py-0.5 text-[9px] text-gray-400 shadow-sm dark:bg-white/8" title={entry.model}>{entry.model}</span>}
                </div>
                {entry.error && <div className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] leading-4 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200">{entry.error}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] text-gray-400">
                  <span>{new Date(entry.updatedAt).toLocaleString()}</span>
                  {entry.provider && <span>渠道：{entry.provider}</span>}
                  {entry.taskId && <span className="max-w-52 truncate" title={entry.taskId}>任务：{entry.taskId}</span>}
                  {typeof entry.referenceCount === 'number' && <span>参考素材：{entry.referenceCount}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {(entry.status === 'failed' || entry.status === 'cancelled') && entry.nodeId && <button type="button" onClick={() => onRetryTask(entry)} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-gray-500 hover:bg-white hover:text-emerald-600 dark:hover:bg-white/10" title="重新运行这个节点"><RotateCcw size={12} />重试</button>}
                {entry.nodeId && <button type="button" onClick={() => onLocateNode(entry.nodeId!)} className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-sky-600 dark:hover:bg-white/10" title="定位节点"><Crosshair size={13} /></button>}
                {(entry.error || entry.taskId) && <button type="button" onClick={() => void navigator.clipboard.writeText(entry.error || entry.taskId || '')} className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:bg-white hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-white" title="复制错误或任务 ID"><Copy size={13} /></button>}
              </div>
            </div>
            {(entry.status === 'queued' || entry.status === 'running') && <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10"><div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${entry.progress}%` }} /></div>}
          </article>
        ))}
        {filtered.length === 0 && <div className="grid h-full min-h-40 place-items-center text-xs text-gray-400">当前筛选下暂无任务记录</div>}
      </div>
    </section>
  );
}
