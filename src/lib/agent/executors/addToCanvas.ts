import type { AddToCanvasAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { buildDraftCanvasElements } from '@/lib/agent/drafts';

export async function runAddToCanvasAction(input: {
  action: AddToCanvasAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  const assetIds = input.action.assetIds || input.context.assetIds || [];
  if (assetIds.length === 0) {
    throw new Error('当前没有可加入画布的结果');
  }

  return {
    kind: 'canvas_update_planned',
    assetIds,
    target: input.action.target || 'canvas',
    elementDrafts: buildDraftCanvasElements({ assetIds, type: 'image', aspectRatio: '1:1' }),
    message: `已为 ${assetIds.length} 个资源生成画布放置草稿`,
  };
}
