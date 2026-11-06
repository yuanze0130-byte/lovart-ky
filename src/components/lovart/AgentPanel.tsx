"use client";

import { Bot, Send, Square, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAgentConversation } from '@/hooks/useAgentConversation';
import type { AgentPanelEntry } from '@/lib/agent/conversation-store';
import type { AgentChatTurn, AgentContext, AgentMode, AgentPanelResponse } from '@/lib/agent/actions';
import { compactAgentHistory, historyWithSummary } from '@/lib/agent/context-controls';
import { excludeAgentReferences } from '@/lib/agent/context-controls';
import { AgentWorkflowPanel } from './AgentWorkflowPanel';
import type { WorkflowArtifact } from '@/lib/agent/workflow';
import { AI_TOOL_CREDIT_COSTS } from '@/lib/ai-tool-pricing';

interface AgentPanelProps {
  owner?: string;
  onWorkflowInsert?: (artifacts:WorkflowArtifact[],sourceId?:string)=>void;
  context?: AgentContext;
  visible: boolean;
  onClose: () => void;
  onSubmit: (message: string, options?: { mode?: AgentMode; history?: AgentChatTurn[]; excludedReferenceIds?: string[] }) => Promise<AgentPanelResponse>;
  onApplyPlan: (input: { prompt: string; mode: AgentMode; reply: string; summary?: string; plan: Record<string, unknown> }) => void;
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

export function AgentPanel({ owner, onWorkflowInsert, context, visible, onClose, onSubmit, onApplyPlan, isRunning, onCancel }: AgentPanelProps) {
  const [workflowOpen,setWorkflowOpen]=useState(false);
  const [message, setMessage] = useState('');
  const [excludedReferenceIds, setExcludedReferenceIds] = useState<string[]>([]);
  const [summaryEdit, setSummaryEdit] = useState<{ epoch: number; value: string } | null>(null);
  const conversation = useAgentConversation(owner, context?.projectId);
  const { entries, mode, summary: contextSummary, contextStart } = conversation.record;
  const summaryDraft = summaryEdit?.epoch === conversation.record.epoch ? summaryEdit.value : null;
  const submitting = useRef(false);
  const alive = useRef(true);
  const [sending, setSending] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const disabled = isRunning || sending || !conversation.ready || Boolean(conversation.error) || !owner || !context?.projectId;
  const updateSettings = (settings: { mode?: AgentMode; summary?: string; contextStart?: number }) => {
    void conversation.mutate({ kind: 'settings', ...settings }).catch(() => {});
  };
  const references = [
    ...(context?.imageReferences || []).map(ref => ({id: ref.id, label: `${ref.source === 'result' ? '结果' : '图片'} ${ref.ordinal} · ${ref.label}`})),
    ...(context?.selectedElements || []).filter(ref => !context?.imageReferences?.some(image => image.id === ref.id))
      .map(ref => ({id: ref.id, label: `${ref.type === 'text' ? '文字' : '节点'} · ${ref.label || ref.type}`})),
  ];
  const compactHistory = () => {
    const turns = entries.slice(contextStart).filter((entry): entry is AgentPanelEntry & { role: 'user' | 'assistant' } => entry.role !== 'error');
    const compacted = compactAgentHistory(turns.map(({role, content}) => ({role, content})), summaryDraft ?? contextSummary);
    // Compact the model context without deleting the user's visible history.
    updateSettings({ summary: compacted.summary, contextStart: Math.max(0, entries.indexOf(turns.slice(-6)[0])) });
  };

  const submit = async (input: string) => {
    const normalized = input.trim();
    if (!normalized || disabled || submitting.current) return;
    submitting.current = true; setSending(true);
    const epoch = conversation.record.epoch;
    const turnId = crypto.randomUUID();
    const history: AgentChatTurn[] = entries.slice(contextStart)
      .filter((entry): entry is AgentPanelEntry & { role: 'user' | 'assistant' } => entry.role !== 'error')
      .slice(-8)
      .map((entry) => ({ role: entry.role, content: entry.content }));
    const userEntry: AgentPanelEntry = { id: `${turnId}:user`, turnId, role: 'user', content: normalized, pending: true };
    try {
      // Persist before any paid operation. A reload never automatically replays it.
      await conversation.mutate({ kind: 'append', entry: userEntry }, epoch);
      if (!alive.current) return;
      setMessage('');
      let response: AgentPanelResponse;
      try {
        response = await onSubmit(normalized, { mode, history: historyWithSummary(history, summaryDraft ?? contextSummary), excludedReferenceIds });
      } catch (cause) {
        await conversation.mutate({ kind: 'complete', turnId, entry: {
          id: `${turnId}:reply`, turnId, role: 'error', content: cause instanceof Error ? cause.message : 'Agent 执行失败',
        } }, epoch);
        return;
      }
      await conversation.mutate({ kind: 'complete', turnId, entry: {
        id: `${turnId}:reply`, turnId,
        role: 'assistant',
        content: response.reply,
        response,
        sourceMessage: normalized,
        mode,
      } }, epoch);
    } catch {
      // Storage errors are shown with a save-only retry; never call onSubmit again.
    } finally {
      submitting.current = false;
      if (alive.current) setSending(false);
    }
  };

  const applyPlan = async (entry: AgentPanelEntry) => {
    if (disabled || submitting.current || entry.planClaimId || entry.planApplied || !entry.sourceMessage || !entry.mode || !entry.response?.plan) return;
    submitting.current = true; setSending(true);
    const epoch = conversation.record.epoch;
    const claimId = crypto.randomUUID();
    try {
      // Claim atomically before inserting, including competing tabs.
      await conversation.mutate({ kind: 'claim-plan', entryId: entry.id, claimId }, epoch);
      if (!alive.current) return;
      onApplyPlan({
        prompt: entry.sourceMessage,
        mode: entry.mode,
        reply: entry.response.reply,
        summary: entry.response.summary,
        plan: entry.response.plan,
      });
      await conversation.mutate({ kind: 'applied', entryId: entry.id, claimId }, epoch);
    } catch (error) {
      await conversation.mutate({ kind: 'append', entry: {
        id: crypto.randomUUID(),
        role: 'error',
        content: error instanceof Error ? error.message : '方案放入画布失败',
      } }, epoch).catch(() => {});
    } finally { submitting.current = false; if (alive.current) setSending(false); }
  };

  if(workflowOpen && owner && context?.projectId && onWorkflowInsert) return <aside className={`absolute bottom-4 right-4 top-20 z-[60] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-auto rounded-3xl border bg-white shadow-2xl dark:bg-slate-950 ${visible?'flex':'hidden'}`}>
    <header className="flex items-center justify-between border-b p-3 text-sm"><strong>创作工作流</strong><button type="button" onClick={()=>setWorkflowOpen(false)}>返回对话</button><button type="button" onClick={onClose} aria-label="关闭工作流">关闭</button></header>
    <AgentWorkflowPanel owner={owner} context={excludeAgentReferences(context,excludedReferenceIds)} onInsert={onWorkflowInsert} />
  </aside>;
  return (
    <aside className={`absolute bottom-4 right-4 top-20 z-[60] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[0_28px_90px_rgba(0,0,0,0.5)] ${visible ? 'flex' : 'hidden'}`}>
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500 text-white"><Bot size={18} /></div>
          <div><div className="text-sm font-semibold text-gray-900 dark:text-white">Lovart Agent</div><div className="text-[11px] text-gray-500 dark:text-gray-400">结合当前选择与分镜概况 · 创意对话 {AI_TOOL_CREDIT_COSTS.agentChat} 积分</div></div>
        </div>
        <div className="flex items-center gap-1">
          {owner && context?.projectId && onWorkflowInsert && <button type="button" disabled={disabled} onClick={()=>setWorkflowOpen(true)} className="rounded-lg px-2 py-1 text-xs text-sky-600">工作流</button>}
          <button type="button" onClick={() => { if (window.confirm('清空当前项目在此浏览器保存的聊天记录？画布内容和生成任务会保留。')) void conversation.mutate({ kind: 'clear' }).catch(() => {}); }} disabled={(entries.length === 0 && !contextSummary) || disabled} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/10" title="清空对话"><Trash2 size={15} /></button>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" title="关闭 Agent"><X size={16} /></button>
        </div>
      </header>

      <div className="border-b border-gray-200 p-3 dark:border-white/10">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
          {MODE_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => updateSettings({ mode: option.value })} disabled={disabled} className={`rounded-lg px-2 py-1.5 text-[11px] transition ${mode === option.value ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white dark:text-black' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'}`}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="border-b border-gray-200 px-4 py-2 text-xs dark:border-white/10">
        <details>
          <summary className="cursor-pointer">本次引用 · {references.filter(ref => !excludedReferenceIds.includes(ref.id)).length} 项</summary>
          <ul className="max-h-36 space-y-2 overflow-auto py-2">
            {references.map(ref => <li key={ref.id}><label className="flex items-start gap-2"><input type="checkbox" disabled={disabled} checked={!excludedReferenceIds.includes(ref.id)} onChange={event => setExcludedReferenceIds(ids => event.target.checked ? ids.filter(id => id !== ref.id) : [...ids, ref.id])} /><span className="break-words">{ref.label}</span></label></li>)}
          </ul>
          <p className="text-gray-500">取消勾选即可移除本次引用，不会删除画布节点。</p>
        </details>
        <button type="button" disabled={disabled || entries.slice(contextStart).filter(entry => entry.role !== 'error').length <= 6} onClick={compactHistory} className="mt-2 text-sky-600 disabled:opacity-40">压缩旧对话（不扣积分）</button>
        {contextSummary && <details className="mt-2"><summary className="cursor-pointer">旧对话摘录 · 可编辑</summary><textarea aria-label="旧对话摘录" value={summaryDraft ?? contextSummary} onChange={event => setSummaryEdit({ epoch: conversation.record.epoch, value: event.target.value })} onBlur={() => {
          if (summaryDraft === null) return;
          const summary = summaryDraft;
          const epoch = conversation.record.epoch;
          void conversation.mutate({ kind: 'settings', summary }, epoch).then(() => setSummaryEdit(edit => edit?.epoch === epoch && edit.value === summary ? null : edit)).catch(() => {});
        }} maxLength={700} rows={4} disabled={disabled} className="mt-2 w-full rounded border bg-transparent p-2" /><p className="text-gray-500">模型使用摘录和最近 6 条消息，完整聊天记录仍保留。</p></details>}
      </div>
      <div role="status" className="px-4 pt-2 text-[11px] text-gray-500">
        {conversation.error ? <span className="text-amber-600">{conversation.error} <button type="button" onClick={() => void conversation.retry()} className="underline">重试保存/读取</button></span>
          : !owner || !context?.projectId ? '登录并打开项目后可保存聊天记录'
          : !conversation.ready ? '正在读取聊天记录…' : '聊天记录保存在此浏览器 · 按账号和项目区分'}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-400/10 dark:text-sky-300"><Bot size={26} /></div>
            <div><div className="text-sm font-medium text-gray-800 dark:text-gray-100">告诉我你想在画布上完成什么</div><div className="mt-1 text-xs text-gray-500">Agent 会结合当前选择与分镜回答；明确要求时执行支持的画布动作。</div></div>
            <div className="space-y-2 text-left">
              {STARTER_PROMPTS.map((prompt) => <button key={prompt} type="button" disabled={disabled} onClick={() => void submit(prompt)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-left text-xs text-gray-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:text-gray-300 dark:hover:bg-sky-400/10 dark:hover:text-sky-200">{prompt}</button>)}
            </div>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={`rounded-2xl px-3.5 py-3 text-sm ${entry.role === 'user' ? 'ml-8 bg-gray-900 text-white dark:bg-white dark:text-black' : entry.role === 'error' ? 'mr-8 border border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'mr-8 border border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200'}`}>
            <div className="whitespace-pre-wrap leading-6">{entry.content}</div>
            {entry.pending && !isRunning && !sending && <p className="mt-2 text-xs opacity-70">此消息尚未记录回复。请先核对任务或执行计划，刷新不会自动重发。</p>}
            {entry.role === 'assistant' && entry.response?.kind === 'chat' && entry.response.plan && Object.keys(entry.response.plan).length > 0 && (
              <button type="button" onClick={() => void applyPlan(entry)} disabled={disabled || entry.planApplied || Boolean(entry.planClaimId)} className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-default disabled:opacity-60 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
                {entry.planApplied ? '已放到画布' : entry.planClaimId ? '放入结果待核对，请查看画布' : '将方案放到画布'}
              </button>
            )}
            {entry.response?.meta && entry.response.meta.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{entry.response.meta.map((item) => <span key={`${item.label}-${item.value}`} className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">{item.label}：{item.value}</span>)}</div>}
            {entry.response?.followUps && entry.response.followUps.length > 0 && <div className="mt-3 space-y-1.5">{entry.response.followUps.map((followUp) => <button key={followUp} type="button" onClick={() => void submit(followUp)} disabled={disabled} className="block w-full rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-left text-[11px] text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">{followUp}</button>)}</div>}
          </div>
        ))}
        {isRunning && <div className="mr-8 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200"><span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />Agent 正在处理当前任务…</div>}
      </div>

      <div className="border-t border-gray-200 p-3 dark:border-white/10">
        <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm focus-within:border-sky-300 dark:border-white/10 dark:bg-white/5">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(message); } }} disabled={disabled} rows={3} placeholder="描述任务，Enter 发送，Shift+Enter 换行" className="w-full resize-none bg-transparent px-2 py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-white" />
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-gray-400">只执行服务端允许的动作</span>
            {isRunning ? <button type="button" onClick={onCancel} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-600"><Square size={12} fill="currentColor" />取消</button> : <button type="button" onClick={() => void submit(message)} disabled={disabled || !message.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send size={13} />发送</button>}
          </div>
        </div>
      </div>
    </aside>
  );
}
