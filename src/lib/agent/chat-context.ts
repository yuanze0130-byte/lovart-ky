import type { AgentChatTurn, AgentContext } from './actions';

function shortText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function sanitizeAgentChatHistory(value: unknown): AgentChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((entry): AgentChatTurn[] => {
    if (!entry || typeof entry !== 'object') return [];
    if (entry.role !== 'user' && entry.role !== 'assistant') return [];
    const content = shortText(entry.content, 800);
    return content ? [{ role: entry.role, content }] : [];
  });
}

export function summarizeAgentContext(context: AgentContext): string {
  const items = Array.isArray(context.storyboardItems)
    ? context.storyboardItems.filter((item) => item && typeof item === 'object').slice(0, 6)
    : [];
  const selectedItem = items.find((item) => item.id === context.selectedStoryboardItemId);
  const lines = [
    `页面：${context.page === 'canvas' ? '画布' : '其他页面'}`,
    `作用范围：${context.scope === 'selection' ? '当前选区' : '当前项目'}`,
    `当前有选中节点：${Boolean(context.selectedElementId) ? '是' : '否'}`,
    `当前有选中图片：${Boolean(context.selectedImage) ? '是' : '否'}`,
    `分镜数量：${Number.isFinite(context.storyboardCount) ? Math.max(0, Math.min(1000, Number(context.storyboardCount))) : 0}`,
  ];
  if (Array.isArray(context.selectedElements)) {
    lines.push(`选区节点：${context.selectedElements.slice(0, 50).filter(e => e && typeof e === 'object').map(e => `${shortText(e.id, 80)} (${shortText(e.type, 40)}) ${shortText(e.label, 200)}`).join('；')}`);
  }
  if (Array.isArray(context.imageReferences)) lines.push(`图片引用编号：${context.imageReferences.slice(0,50).map(ref=>`${ref.source==='result'?'上次结果':'选区'}第 ${ref.ordinal} 张：${shortText(ref.label,100)}${ref.id===context.referenceId?'（本次引用）':''}`).join('；')}`);
  if (selectedItem) lines.push(`选中分镜：第 ${Number.isInteger(selectedItem.order) ? selectedItem.order + 1 : 1} 镜，${shortText(selectedItem.title, 80)}`);
  if (context.selectedObject) lines.push(`选中图片对象：${shortText(context.selectedObject.label, 80) || '未命名对象'}`);
  if (items.length > 0) {
    lines.push(`分镜概览：${items.map((item) => `${Number.isInteger(item.order) ? item.order + 1 : 1}. ${shortText(item.title, 60)}`).join('；')}`);
  }
  return lines.join('\n');
}
