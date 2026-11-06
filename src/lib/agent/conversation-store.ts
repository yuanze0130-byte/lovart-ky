import type { AgentMode, AgentPanelResponse } from './actions';

export type ConversationScope = { owner: string; projectId: string };
export type AgentPanelEntry = {
  id: string;
  turnId?: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  pending?: boolean;
  response?: AgentPanelResponse;
  sourceMessage?: string;
  mode?: AgentMode;
  planApplied?: boolean;
  planClaimId?: string;
};
export type AgentConversation = ConversationScope & {
  schema: 1;
  revision: number;
  epoch: number;
  entries: AgentPanelEntry[];
  mode: AgentMode;
  summary: string;
  contextStart: number;
};
export type ConversationChange =
  | { kind: 'append'; entry: AgentPanelEntry }
  | { kind: 'complete'; turnId: string; entry: AgentPanelEntry }
  | { kind: 'settings'; mode?: AgentMode; summary?: string; contextStart?: number }
  | { kind: 'claim-plan'; entryId: string; claimId: string }
  | { kind: 'applied'; entryId: string; claimId: string }
  | { kind: 'clear' };
export type ConversationMutation = ConversationChange & { epoch: number };
const modes = ['design', 'branding', 'image-editing', 'research'];
export class ConversationConflictError extends Error {}

export function emptyConversation(scope: ConversationScope): AgentConversation {
  return { ...scope, schema: 1, revision: 0, epoch: 0, entries: [], mode: 'design', summary: '', contextStart: 0 };
}

function validEntry(entry: AgentPanelEntry) {
  const response = entry?.response;
  return entry && typeof entry.id === 'string' && entry.id.length > 0
    && ['user', 'assistant', 'error'].includes(entry.role) && typeof entry.content === 'string'
    && (entry.turnId === undefined || typeof entry.turnId === 'string')
    && (entry.pending === undefined || typeof entry.pending === 'boolean')
    && (entry.planApplied === undefined || typeof entry.planApplied === 'boolean')
    && (entry.planClaimId === undefined || typeof entry.planClaimId === 'string')
    && (entry.sourceMessage === undefined || typeof entry.sourceMessage === 'string')
    && (entry.mode === undefined || modes.includes(entry.mode))
    && (!response || (['chat', 'action'].includes(response.kind) && typeof response.reply === 'string'
      && (response.plan === undefined || Boolean(response.plan && typeof response.plan === 'object' && !Array.isArray(response.plan)))
      && (response.followUps === undefined || (Array.isArray(response.followUps) && response.followUps.every(v => typeof v === 'string')))
      && (response.meta === undefined || (Array.isArray(response.meta) && response.meta.every(v => v && typeof v.label === 'string' && typeof v.value === 'string')))));
}

export function validateConversation(record: AgentConversation, scope: ConversationScope) {
  if (!record || record.schema !== 1 || record.owner !== scope.owner || record.projectId !== scope.projectId
    || !Number.isSafeInteger(record.revision) || record.revision < 0 || !Number.isSafeInteger(record.epoch) || record.epoch < 0
    || !Array.isArray(record.entries) || !record.entries.every(validEntry)
    || new Set(record.entries.map(e => e.id)).size !== record.entries.length
    || !modes.includes(record.mode) || typeof record.summary !== 'string'
    || !Number.isSafeInteger(record.contextStart) || record.contextStart < 0 || record.contextStart > record.entries.length) {
    throw new Error('聊天记录格式或归属异常，已保留原记录，请勿清空浏览器数据');
  }
}

/** Merge a single intent, never overwrite another tab with a stale full snapshot. */
export function changeConversation(record: AgentConversation, mutation: ConversationMutation): AgentConversation {
  if (mutation.epoch !== record.epoch) throw new ConversationConflictError('此对话已在其他窗口清空，请重新读取记录');
  const next = structuredClone(record);
  if (mutation.kind === 'clear') {
    next.entries = []; next.summary = ''; next.contextStart = 0; next.epoch++;
  } else if (mutation.kind === 'settings') {
    if (mutation.mode !== undefined) next.mode = mutation.mode;
    if (mutation.summary !== undefined) next.summary = mutation.summary;
    if (mutation.contextStart !== undefined) next.contextStart = mutation.contextStart;
  } else if (mutation.kind === 'claim-plan' || mutation.kind === 'applied') {
    const entry = next.entries.find(e => e.id === mutation.entryId);
    if (!entry || entry.planApplied || (mutation.kind === 'claim-plan' ? Boolean(entry.planClaimId) : entry.planClaimId !== mutation.claimId)) {
      throw new ConversationConflictError('方案已被处理或记录不存在，请先检查当前画布并重新读取记录');
    }
    if (mutation.kind === 'claim-plan') entry.planClaimId = mutation.claimId;
    else entry.planApplied = true;
  } else {
    const entry = mutation.entry;
    if (mutation.kind === 'complete') {
      const user = next.entries.find(e => e.turnId === mutation.turnId && e.role === 'user');
      if (!user || entry.turnId !== mutation.turnId) throw new Error('回复所属对话轮次不存在');
      user.pending = false;
    }
    const existing = next.entries.find(e => e.id === entry.id);
    // Replayed delivery cannot duplicate a response or undo an applied plan.
    if (!existing) next.entries.push(structuredClone(entry));
    else if (existing.role !== entry.role || existing.turnId !== entry.turnId) throw new Error('消息标识冲突');
  }
  next.revision++;
  validateConversation(next, record);
  return next;
}

export async function conversationStore(scope: ConversationScope, mutation?: ConversationMutation): Promise<AgentConversation> {
  if (!scope.owner || !scope.projectId) throw new Error('请先登录并打开项目');
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('doodleverse-agent-conversations', 1);
    let blocked = false;
    opening.onupgradeneeded = () => opening.result.createObjectStore('conversations');
    opening.onerror = () => reject(new Error('无法打开聊天记录存储，请检查浏览器存储权限'));
    opening.onblocked = () => { blocked = true; reject(new Error('聊天记录存储被其他窗口占用，请关闭旧窗口后重试')); };
    opening.onsuccess = () => {
      const db = opening.result;
      if (blocked) { db.close(); return; }
      const tx = db.transaction('conversations', mutation ? 'readwrite' : 'readonly');
      const store = tx.objectStore('conversations');
      const key = JSON.stringify([scope.owner, scope.projectId]);
      const request = store.get(key);
      let result = emptyConversation(scope);
      let error: Error | undefined;
      request.onsuccess = () => {
        try {
          result = request.result === undefined ? result : request.result;
          validateConversation(result, scope);
          if (mutation) { result = changeConversation(result, mutation); store.put(result, key); }
        } catch (cause) { error = cause instanceof Error ? cause : new Error('聊天记录保存失败'); tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(error || new Error('聊天记录未能保存，请重试；不会自动重发任务')); };
      tx.onerror = () => {};
    };
  });
}
