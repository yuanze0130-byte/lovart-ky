'use client';

import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { PanelLeft, X, FolderOpen, Images, ListChecks, Bot, Boxes } from 'lucide-react';

export type WorkspacePanel = 'history' | 'tasks' | 'agent' | 'tools' | 'image-chat' | 'image-batch';

export function CanvasWorkspaceSidebar({ activePanel, onSelect, onLeave, agentEnabled, hasFailedTasks, children }: {
  activePanel: WorkspacePanel | null;
  onSelect: (panel: WorkspacePanel) => void;
  onLeave: (event: MouseEvent<HTMLAnchorElement>) => void;
  agentEnabled: boolean;
  hasFailedTasks: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !sidebar.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const items = [
    { id: 'image-chat' as const, label: '对话生图', icon: Images },
    { id: 'image-batch' as const, label: '表格批量生图', icon: ListChecks },
    { id: 'history' as const, label: '生成素材', icon: Images },
    { id: 'tasks' as const, label: '任务记录', icon: ListChecks },
    ...(agentEnabled ? [{ id: 'agent' as const, label: 'Agent 对话', icon: Bot }] : []),
    { id: 'tools' as const, label: '应用工具', icon: Boxes },
  ];
  return <div ref={root}>
    <button ref={trigger} type="button" aria-label="工作区导航" aria-expanded={open} aria-controls="canvas-workspace-navigation" onClick={() => setOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-3 text-xs text-gray-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-gray-200">
      <PanelLeft size={16} /><span>工作区</span>
    </button>
    {open && createPortal(<aside ref={sidebar} id="canvas-workspace-navigation" aria-label="工作区导航" className="fixed bottom-4 left-4 top-16 z-[190] flex w-[224px] max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-gray-200 bg-white p-3 text-gray-800 shadow-xl dark:border-white/10 dark:bg-slate-950 dark:text-gray-100">
      <div className="mb-5 flex items-center justify-between px-2 pt-1"><span className="text-sm font-semibold">工作区</span><button type="button" aria-label="收起侧边栏" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"><X size={16} /></button></div>
      <nav className="space-y-1" aria-label="创作导航">
        <Link href="/projects" onClick={onLeave} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-gray-100 dark:hover:bg-white/10"><FolderOpen size={18} />项目库</Link>
        {items.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={activePanel === id} onClick={() => { onSelect(id); setOpen(false); trigger.current?.focus(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm ${activePanel === id ? 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300' : 'hover:bg-gray-100 dark:hover:bg-white/10'}`}>
          <Icon size={18} /><span>{label}</span>{id === 'tasks' && hasFailedTasks && <span aria-label="有失败任务" className="ml-auto h-2 w-2 rounded-full bg-rose-500" />}
        </button>)}
      </nav>
      <div className="mt-auto border-t border-gray-100 pt-3 dark:border-white/10"><p className="mb-2 px-3 text-xs text-gray-400">画布设置与外观</p><div className="flex items-center justify-between px-1">{children}</div></div>
    </aside>, document.body)}
  </div>;
}
