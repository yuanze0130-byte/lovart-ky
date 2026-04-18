import type { CreateStoryboardAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { buildStoryboardCreatedResult } from '@/lib/agent/drafts';
import { ensureProjectContext } from '@/lib/agent/executors/shared';

export async function runCreateStoryboardAction(input: {
  action: CreateStoryboardAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  ensureProjectContext(input.context);
  return buildStoryboardCreatedResult(
    input.action.prompt,
    input.action.shots || 6,
    input.action.aspectRatio || '9:16',
  );
}
