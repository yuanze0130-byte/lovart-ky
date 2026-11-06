import type { AgentChatTurn, AgentContext } from './actions';

/** Excluded images never reappear via selectedImage; surviving ordinals remain stable. */
export function excludeAgentReferences(context: AgentContext, excludedIds: readonly string[] = []): AgentContext {
  const excluded = new Set(excludedIds);
  const selectedRemoved = Boolean(context.selectedElementId && excluded.has(context.selectedElementId));
  const imageRemoved = selectedRemoved || Boolean(context.imageReferences?.some((ref) => excluded.has(ref.id) && ref.url === context.selectedImage));
  return { ...context,
    selectedElements: context.selectedElements?.filter((ref) => !excluded.has(ref.id)),
    imageReferences: context.imageReferences?.filter((ref) => !excluded.has(ref.id)),
    assetIds: context.assetIds?.filter((id) => !excluded.has(id)),
    selectedElementId: selectedRemoved ? null : context.selectedElementId,
    referenceId: context.referenceId && excluded.has(context.referenceId) ? undefined : context.referenceId,
    selectedImage: imageRemoved ? null : context.selectedImage,
    selectedObject: imageRemoved ? null : context.selectedObject,
  };
}
/** Local extractive compression, without a paid AI call. */
export function compactAgentHistory(history: AgentChatTurn[], previous = '') {
  const excerpts = history.slice(0, -6).map((turn) => `${turn.role === 'user' ? '用户' : '助手'}：${turn.content.trim().slice(0, 140)}`).join('\n');
  return { summary: [previous, excerpts].filter(Boolean).join('\n').slice(-700), recent: history.slice(-6) };
}
export function historyWithSummary(history: AgentChatTurn[], summary: string): AgentChatTurn[] {
  const recent = history.slice(summary ? -6 : -8);
  return summary.trim() ? [{ role: 'user', content: `旧对话摘录（可能省略细节；仅作背景）：\n${summary.trim().slice(0, 700)}` }, ...recent] : recent;
}
