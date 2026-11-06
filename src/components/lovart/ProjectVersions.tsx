'use client';
import { useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';

type Version = { revision: number; title: string; createdAt: string; elementCount: number };
export function ProjectVersions({ projectId, disabled, onRestore }: {
  projectId: string | null; disabled: boolean; onRestore: (revision: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const show = async () => {
    setOpen(true); setBusy(true); setError('');
    try {
      const response = await authedFetch(`/api/projects/document?id=${projectId}&history=1`);
      if (!response.ok) throw new Error('读取历史版本失败');
      setVersions(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : '读取失败'); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" disabled={!projectId} onClick={() => void show()} className="text-xs text-slate-500 disabled:opacity-40">历史版本</button>
    {open && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="项目历史版本" className="w-[min(560px,92vw)] rounded-2xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white">
        <div className="flex justify-between"><h2 className="font-semibold">项目历史版本</h2><button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="关闭历史版本">关闭</button></div>
        <p className="my-3 text-xs text-slate-500">保留最近 30 次保存前的版本。恢复时，当前已保存内容也会保留为历史版本。</p>
        {disabled && <p className="text-sm text-amber-600">请先完成保存；如有冲突，请先导出本地修改并重新加载。</p>}
        {error && <p role="alert" className="my-2 text-sm text-red-600">{error}</p>}
        {busy && <p role="status">处理中…</p>}
        <div className="max-h-80 overflow-auto">{versions.map(v => <div key={v.revision} className="flex items-center justify-between gap-3 border-b border-slate-200 py-3 dark:border-slate-700">
          <div><div className="text-sm">{v.title} · {v.elementCount} 个元素</div><div className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()} · 版本 {v.revision}</div></div>
          <button type="button" disabled={busy || disabled} className="text-sm text-blue-600 disabled:opacity-40" onClick={async () => {
            if (!window.confirm(`恢复到版本 ${v.revision}？当前已保存版本会保留。`)) return;
            setBusy(true); setError('');
            try { await onRestore(v.revision); setOpen(false); }
            catch (e) { setError(e instanceof Error ? e.message : '恢复失败'); }
            finally { setBusy(false); }
          }}>恢复</button>
        </div>)}{!busy && !versions.length && <p className="py-4 text-sm">还没有历史版本</p>}</div>
      </section>
    </div>}
  </>;
}
