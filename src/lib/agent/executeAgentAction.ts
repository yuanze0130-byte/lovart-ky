import type { NextRequest } from 'next/server';
import type { AgentAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { runAddToCanvasAction } from '@/lib/agent/executors/addToCanvas';
import { runCreateStoryboardAction } from '@/lib/agent/executors/createStoryboard';
import { runCreateStoryboardBoardAction } from '@/lib/agent/executors/createStoryboardBoard';
import { runEditSelectedImageAction } from '@/lib/agent/executors/editSelectedImage';
import { runGenerateImagesAction } from '@/lib/agent/executors/generateImages';
import { runGenerateStoryboardImageAction } from '@/lib/agent/executors/generateStoryboardImage';
import { runGenerateStoryboardVideoAction } from '@/lib/agent/executors/generateStoryboardVideo';
import { runGenerateVideoAction } from '@/lib/agent/executors/generateVideo';

export async function executeAgentAction(input: {
  request: NextRequest;
  userId: string;
  action: AgentAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  switch (input.action.type) {
    case 'create_storyboard':
      return runCreateStoryboardAction({ action: input.action, context: input.context });
    case 'create_storyboard_board':
      return runCreateStoryboardBoardAction({ context: input.context });
    case 'generate_images':
      return runGenerateImagesAction({ request: input.request, action: input.action, context: input.context });
    case 'generate_storyboard_image':
      return runGenerateStoryboardImageAction({ action: input.action, context: input.context });
    case 'generate_storyboard_video':
      return runGenerateStoryboardVideoAction({ action: input.action, context: input.context });
    case 'generate_video':
      return runGenerateVideoAction({ request: input.request, action: input.action, context: input.context });
    case 'add_to_canvas':
      return runAddToCanvasAction({ action: input.action, context: input.context });
    case 'edit_selected_image':
      return runEditSelectedImageAction({ request: input.request, action: input.action, context: input.context });
    default:
      throw new Error('Unsupported agent action');
  }
}
