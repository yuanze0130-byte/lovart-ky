'use client';
import { useEffect, useRef, useState } from 'react';
import { loadLocalCanvasDraft, type LocalCanvasDraft } from '@/lib/local-canvas-store';
import { persistCanvasElementAssets } from '@/lib/canvas-asset-upload';
import { authedFetch } from '@/lib/authed-fetch';

export function LocalProjectRecovery({ userId, projectId }: { userId: string; projectId: string | null }) {
  const [draft, setDraft] = useState<LocalCanvasDraft | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyId, setCopyId] = useState<string | null>(null);
  const targetId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setDraft(null); setMessage(''); setCopyId(null);
    if (projectId) void loadLocalCanvasDraft(`recovery:${userId}:${projectId}`).then(value => {
      if (active) setDraft(value);
    }).catch(() => { if (active) setMessage('本机备份读取失败'); });
    return () => { active = false; };
  }, [userId, projectId]);
  if (!draft) return message ? <span role="status">{message}</span> : null;
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'canvas-local-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restoreCopy = async () => {
    if (busy || copyId || !window.confirm('将本机备份另存为一个新项目，原项目保持不变。继续吗？')) return;
    setBusy(true); setMessage('');
    const id = targetId.current || (targetId.current = crypto.randomUUID());
    try {
      const elements = await persistCanvasElementAssets(draft.elements);
      const response = await authedFetch('/api/projects/document', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revision: -1, title: `${draft.title.slice(0,480)}（本机恢复）`, elements, viewport: draft.viewport }) });
      if (response.status === 409) {
        const check = await authedFetch(`/api/projects/document?id=${id}`);
        if (!check.ok) throw new Error('无法确认恢复结果，请保留备份后重试');
      } else if (!response.ok) throw new Error('恢复副本失败，请保留备份后重试');
      setCopyId(id); setMessage('恢复副本已保存');
    } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败'); }
    finally { setBusy(false); }
  };
  return <details className="relative text-xs">
    <summary className="cursor-pointer">本机备份</summary>
    <div className="absolute left-0 top-7 z-[210] w-64 rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100">
      <p>{new Date(draft.updatedAt).toLocaleString()} · {draft.elements.length} 个元素</p>
      <p className="my-2 text-slate-500">当前浏览器保留的副本，可能早于云端内容。</p>
      <button type="button" onClick={exportDraft} className="mr-3 underline">导出备份</button>
      <button type="button" disabled={busy || Boolean(copyId)} onClick={() => void restoreCopy()} className="underline disabled:opacity-50">{busy ? '恢复中…' : '恢复为新项目'}</button>
      {message && <p role="status" className="mt-2">{message}</p>}
      {copyId && <a href={`/canvas?id=${copyId}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-blue-600 underline">打开恢复副本</a>}
    </div>
  </details>;
}
