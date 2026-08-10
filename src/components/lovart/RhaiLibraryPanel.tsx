'use client';

import { BookOpen, Boxes, Pencil, Plus, Send, Trash2, Workflow, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import {
  loadRhaiWorkflows,
  prepareRhaiWorkflowElements,
  saveRhaiWorkflows,
  type RhaiWorkflowRecord,
} from '@/lib/rhai-workflow-store';

interface RhaiLibraryPanelProps {
  userId?: string | null;
  selectedElements: CanvasElement[];
  onFillWorkflow: (elements: CanvasElement[]) => void;
  onCreateScriptWriter: () => void;
  onCreateVideoBreakdown: () => void;
  onClose: () => void;
}

type RhaiAppId = 'script-writing' | 'video-breakdown';
interface RhaiApp { id: RhaiAppId; title: string; description: string }
const DEFAULT_AI_APPS: RhaiApp[] = [
  { id: 'script-writing', title: '剧本创作', description: '从创意大纲到分场、分镜与台词' },
  { id: 'video-breakdown', title: '视频内容拆解', description: '分析镜头、画面、运镜和旁白' },
];
const RHAI_APPS_STORAGE_KEY = 'doodleverse.rhai-apps.v1';

function getAppsStorageKey(userId?: string | null) {
  return `${RHAI_APPS_STORAGE_KEY}.${userId?.trim() || 'guest'}`;
}

function loadApps(userId?: string | null) {
  if (typeof window === 'undefined') return DEFAULT_AI_APPS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getAppsStorageKey(userId)) || 'null');
    return Array.isArray(parsed) ? parsed as RhaiApp[] : DEFAULT_AI_APPS;
  } catch {
    return DEFAULT_AI_APPS;
  }
}

export function RhaiLibraryPanel({ userId, selectedElements, onFillWorkflow, onCreateScriptWriter, onCreateVideoBreakdown, onClose }: RhaiLibraryPanelProps) {
  const [tab, setTab] = useState<'workflow' | 'app'>('workflow');
  const [workflows, setWorkflows] = useState<RhaiWorkflowRecord[]>([]);
  const [apps, setApps] = useState<RhaiApp[]>(() => loadApps(userId));
  const [storageError, setStorageError] = useState<string | null>(null);
  const selectedNodeCount = useMemo(() => selectedElements.filter((element) => element.type !== 'connector').length, [selectedElements]);

  useEffect(() => {
    let active = true;
    void loadRhaiWorkflows(userId)
      .then((stored) => { if (active) setWorkflows(stored); })
      .catch((error) => { if (active) setStorageError(error instanceof Error ? error.message : '读取 RHAI 工作流失败'); });
    return () => { active = false; };
  }, [userId]);

  const save = async (next: RhaiWorkflowRecord[]) => {
    setStorageError(null);
    try {
      await saveRhaiWorkflows(userId, next);
      setWorkflows(next);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : '保存 RHAI 工作流失败');
    }
  };

  const addWorkflow = () => {
    const elements = prepareRhaiWorkflowElements(selectedElements);
    if (elements.length === 0) return;
    const workflow: RhaiWorkflowRecord = {
      id: `workflow-${Date.now()}`,
      title: `工作流 ${workflows.length + 1}`,
      elements,
      createdAt: new Date().toISOString(),
    };
    void save([workflow, ...workflows]);
  };

  const rename = (workflow: RhaiWorkflowRecord) => {
    const title = window.prompt('输入新的工作流名称', workflow.title)?.trim();
    if (title) void save(workflows.map((item) => item.id === workflow.id ? { ...item, title } : item));
  };

  const saveApps = (next: RhaiApp[]) => {
    try {
      window.localStorage.setItem(getAppsStorageKey(userId), JSON.stringify(next));
      setApps(next);
    } catch {
      setStorageError('保存 RHAI 应用设置失败');
    }
  };

  const renameApp = (app: RhaiApp) => {
    const title = window.prompt('输入新的 AI 应用名称', app.title)?.trim();
    if (title) saveApps(apps.map((item) => item.id === app.id ? { ...item, title } : item));
  };

  return (
    <aside className="absolute bottom-4 left-4 top-16 z-[150] flex w-[320px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/98 shadow-[0_24px_80px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/12 dark:bg-[#15161a]/98 dark:text-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2 text-sm font-semibold"><Boxes size={16} className="text-sky-500" />RH AI 应用库</div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/8 dark:hover:text-white" aria-label="关闭 RHAI 应用库"><X size={15} /></button>
      </div>

      <div className="grid grid-cols-2 border-b border-gray-200 dark:border-white/10">
        <button type="button" onClick={() => setTab('workflow')} className={`flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${tab === 'workflow' ? 'border-sky-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-400'}`}><Workflow size={14} />工作流 <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] dark:bg-white/10">{workflows.length}</span></button>
        <button type="button" onClick={() => setTab('app')} className={`flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-xs font-medium ${tab === 'app' ? 'border-sky-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-400'}`}><Boxes size={14} />AI 应用 <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] dark:bg-white/10">{apps.length}</span></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'workflow' ? (
          <>
            <button type="button" disabled={selectedNodeCount === 0} onClick={addWorkflow} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50 px-3 py-2.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-sky-400/25 dark:bg-sky-400/8 dark:text-sky-200"><Plus size={14} />将当前选区保存为工作流{selectedNodeCount > 0 ? ` · ${selectedNodeCount}` : ''}</button>
            {storageError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-700 dark:border-amber-300/20 dark:bg-amber-400/8 dark:text-amber-100">{storageError}</div>}
            <div className="space-y-2.5">{workflows.map((workflow) => (
              <article key={workflow.id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="grid h-12 w-14 shrink-0 place-items-center rounded-lg bg-gray-200 text-gray-500 dark:bg-white/8 dark:text-white/45"><Workflow size={20} /></div>
                  <div className="min-w-0"><div className="truncate text-xs font-semibold text-gray-800 dark:text-white">{workflow.title}</div><div className="mt-1 text-[9px] text-gray-400">Workflow ID: {workflow.id.slice(-10)}</div><div className="mt-1 text-[9px] text-gray-400">{workflow.elements.filter((element) => element.type !== 'connector').length} 个节点</div></div>
                </div>
                <div className="grid grid-cols-3 border-t border-gray-200 dark:border-white/8">
                  <button type="button" onClick={() => rename(workflow)} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] text-gray-500 hover:bg-gray-100 dark:text-white/45 dark:hover:bg-white/8"><Pencil size={11} />重命名</button>
                  <button type="button" onClick={() => onFillWorkflow(workflow.elements)} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] text-gray-600 hover:bg-gray-100 dark:text-white/65 dark:hover:bg-white/8"><Send size={11} />填充</button>
                  <button type="button" onClick={() => void save(workflows.filter((item) => item.id !== workflow.id))} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/8"><Trash2 size={11} />删除</button>
                </div>
              </article>
            ))}</div>
            {workflows.length === 0 && <div className="grid min-h-44 place-items-center px-6 text-center text-[11px] leading-5 text-gray-400">框选画布上的一组节点，即可保存为可重复填充的 RHAI 工作流。</div>}
          </>
        ) : (
          <div className="space-y-2.5">{apps.map((app) => {
            const Icon = app.id === 'script-writing' ? BookOpen : Boxes;
            const fill = app.id === 'script-writing' ? onCreateScriptWriter : onCreateVideoBreakdown;
            return (
              <article key={app.id} className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="flex items-center gap-3 px-3 py-3"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500/15 to-fuchsia-500/15 text-sky-600 dark:text-sky-300"><Icon size={22} /></div><div className="min-w-0"><div className="truncate text-xs font-semibold text-gray-800 dark:text-white">{app.title}</div><div className="mt-1 text-[10px] leading-4 text-gray-400">{app.description}</div><div className="mt-1 text-[9px] text-gray-400">ID: rhai-{app.id}</div></div></div>
                <div className="grid grid-cols-3 border-t border-gray-200 dark:border-white/8"><button type="button" onClick={() => renameApp(app)} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] text-gray-400"><Pencil size={11} />重命名</button><button type="button" onClick={fill} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium text-sky-600 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-400/8"><Send size={11} />填充</button><button type="button" onClick={() => saveApps(apps.filter((item) => item.id !== app.id))} className="flex items-center justify-center gap-1 px-2 py-2 text-[10px] text-gray-400"><Trash2 size={11} />删除</button></div>
              </article>
            );
          })}</div>
        )}
      </div>
    </aside>
  );
}
