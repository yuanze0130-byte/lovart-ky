'use client';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { listLocalSelectionTemplates, saveLocalCanvasDraft, removeLocalCanvasDraft, type LocalCanvasDraft } from '@/lib/local-canvas-store';
import { getSelectionWithConnections, duplicateCanvasSelection } from '@/lib/canvas-shortcuts';
import { persistCanvasElementAssets, refreshCanvasElementAssetUrls } from '@/lib/canvas-asset-upload';

export function SelectionTemplates({ userId, elements, selectedIds, onInsert, disabled }: {
  userId: string; elements: CanvasElement[]; selectedIds: string[]; disabled: boolean;
  onInsert: (elements: CanvasElement[], ids: string[]) => void;
}) {
  const [templates, setTemplates] = useState<LocalCanvasDraft[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scope = useRef<object | null>(null);
  useEffect(() => {
    const current = {};
    scope.current = current;
    let active = true;
    void listLocalSelectionTemplates(userId).then(rows => { if(active) setTemplates(rows); }).catch(() => { if(active) setError('模板读取失败'); });
    return () => { active = false; if (scope.current === current) scope.current = null; };
  }, [userId]);
  const run = async (action: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try { await action(); } catch(e) { setError(e instanceof Error ? e.message : '模板操作失败'); }
    finally { setBusy(false); }
  };
  return <details className="relative text-xs">
    <summary className="cursor-pointer">选区模板</summary>
    <div className="absolute right-0 top-7 z-[210] max-h-[65vh] w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100">
      <p className="mb-2">保存在当前浏览器，按账号隔离。插入时生成独立节点和内部连线。</p>
      <input aria-label="模板名称" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="模板名称" className="w-full rounded border p-2 text-slate-900" />
      <button type="button" disabled={disabled || busy || !name.trim() || !selectedIds.length} className="my-2 underline disabled:opacity-40" onClick={() => void run(async () => {
        const selection = getSelectionWithConnections(elements, selectedIds);
        if (!selection.some(e => e.type !== 'connector')) throw new Error('请至少选择一个节点');
        const stored = await persistCanvasElementAssets(selection);
        await saveLocalCanvasDraft({ id: `template:${userId}:${crypto.randomUUID()}`, title: name.trim(), elements: stored });
        setTemplates(await listLocalSelectionTemplates(userId)); setName('');
      })}>将当前选区保存为模板</button>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      {templates.map(template => <div key={template.id} className="border-t py-2">
        <p>{template.title} · {template.elements.filter(e => e.type !== 'connector').length} 个节点</p>
        <button type="button" disabled={disabled || busy} className="mr-3 underline" onClick={() => void run(async () => {
          const current = scope.current;
          const refreshed = await refreshCanvasElementAssetUrls(template.elements);
          if (!current || scope.current !== current) return;
          const copy = duplicateCanvasSelection(refreshed, refreshed.filter(e => e.type !== 'connector').map(e => e.id), () => crypto.randomUUID(), 48);
          onInsert(copy.elements, copy.selectedIds);
        })}>插入</button>
        <button type="button" disabled={disabled || busy} className="underline" onClick={() => void run(async () => {
          if (!window.confirm(`删除模板“${template.title}”？`)) return;
          await removeLocalCanvasDraft(template.id); setTemplates(await listLocalSelectionTemplates(userId));
        })}>删除</button>
      </div>)}
    </div>
  </details>;
}
