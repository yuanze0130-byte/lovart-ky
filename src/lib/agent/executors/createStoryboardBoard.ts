import type { AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { ensureProjectContext } from '@/lib/agent/executors/shared';

export async function runCreateStoryboardBoardAction(input: {
  context: AgentContext;
}): Promise<AgentActionResult> {
  ensureProjectContext(input.context);

  const count = input.context.storyboardCount || 0;
  if (count <= 0) {
    throw new Error('当前还没有 storyboard，无法展开制作板');
  }

  return {
    kind: 'storyboard_board_requested',
    count,
    message: `准备把 ${count} 个分镜展开成制作板`,
  };
}
