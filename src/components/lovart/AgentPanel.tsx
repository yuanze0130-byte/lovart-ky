"use client";

import { Bot, Send, Square, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { AgentMode, AgentPanelResponse } from '@/lib/agent/actions';

type AgentPanelEntry = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  response?: AgentPanelResponse;
};

interface AgentPanelProps {
  onClose: () => void;
  onSubmit: (message: string, options?: { mode?: AgentMode }) => Promise<AgentPanelResponse>;
  isRunning: boolean;
  onCancel: () => void;
}
const MODE_OPTIONS: Array<{ value: AgentMode; label: string }> = [
  { value: 'design', label: '设计' },
  { value: 'branding', label: '品牌' },
  { value: 'image-editing', label: '图片编辑' },
  { value: 'research', label: '研究' },
];

const STARTER_PROMPTS = [
  '为当前主题创建 6 镜头分镜',
  '基于选中图片制作三视图',
  '生成 4 张不同方向的设计方案',
];

export function AgentPanel({ onClose, onSubmit, isRunning, onCancel }: AgentPanelProps) {
  const [mode, setMode] = useState<AgentMode>('design');
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useState<AgentPanelEntry[]>([]);

  const submit = async (input: string) => {
    const normalized = input.trim();
    if (!normalized || isRunning) return;
    const userEntry: AgentPanelEntry = { id: crypto.randomUUID(), role: 'user', content: normalized };
    setEntries((previous) => [...previous, userEntry]);
    setMessage('');
    try {
      const response = await onSubmit(normalized, { mode });
      setEntries((previous) => [...previous, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.reply,
        response,
      }]);
    } catch (error) {
      setEntries((previous) => [...previous, {
        id: crypto.randomUUID(),
        role: 'error',
        content: error instanceof Error ? error.message : 'Agent 执行失败',
      }]);
    }
  };

  return (
    <aside className="absolute bottom-4 right-4 top-20 z-[60] flex w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500 text-white"><Bot size={18} /></div>
          <div><div className="text-sm font-semibold text-gray-900 dark:text-white">Lovart Agent</div><div className="text-[11px] text-gray-500 dark:text-gray-400">读取当前画布、选择和分镜上下文</div></div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setEntries([])} disabled={entries.length === 0 || isRunning} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/10" title="清空对话"><Trash2 size={15} /></button>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" title="关闭 Agent"><X size={16} /></button>
        </div>
      </header>

      <div className="border-b border-gray-200 p-3 dark:border-white/10">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
          {MODE_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => setMode(option.value)} disabled={isRunning} className={`rounded-lg px-2 py-1.5 text-[11px] transition ${mode === option.value ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white dark:text-black' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-400/10 dark:text-sky-300"><Bot size={26} /></div>
            <div><div className="text-sm font-medium text-gray-800 dark:text-gray-100">告诉我你想在画布上完成什么</div><div className="mt-1 text-xs text-gray-500">Agent 会先分析上下文，再执行受支持的画布动作。</div></div>
            <div className="space-y-2 text-left">
              {STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => void submit(prompt)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-left text-xs text-gray-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:text-gray-300 dark:hover:bg-sky-400/10 dark:hover:text-sky-200">{prompt}</button>)}
            </div>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`rounded-2xl px-3.5 py-3 text-sm ${entry.role === 'user' ? 'ml-8 bg-gray-900 text-white dark:bg-white dark:text-black' : entry.role === 'error' ? 'mr-8 border border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'mr-8 border border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200'}`}>
            <div className="whitespace-pre-wrap leading-6">{entry.content}</div>
            {entry.response?.meta && entry.response.meta.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{entry.response.meta.map((item) => <span key={`${item.label}-${item.value}`} className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">{item.label}：{item.value}</span>)}</div>}
            {entry.response?.followUps && entry.response.followUps.length > 0 && <div className="mt-3 space-y-1.5">{entry.response.followUps.map((followUp) => <button key={followUp} type="button" onClick={() => void submit(followUp)} disabled={isRunning} className="block w-full rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-left text-[11px] text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">{followUp}</button>)}</div>}
          </div>
        ))}
        {isRunning && <div className="mr-8 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />Agent 正在处理当前任务…</div>}
      </div>

      <div className="border-t border-gray-200 p-3 dark:border-white/10">
        <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm focus-within:border-sky-300 dark:border-white/10 dark:bg-white/5">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(message); } }} disabled={isRunning} rows={3} placeholder="描述任务，Enter 发送，Shift+Enter 换行" className="w-full resize-none bg-transparent px-2 py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white" />
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-gray-400">只执行服务端允许的动作</span>
            {isRunning ? <button type="button" onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600"><Square size={12} fill="currentColor" />取消</button> : <button type="button" onClick={() => void submit(message)} disabled={!message.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send size={13} />发送</button>}
          </div>
        </div>
      </div>
    </aside>
  );
}
