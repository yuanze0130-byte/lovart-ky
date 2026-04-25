import type { NextRequest } from 'next/server';
import type { GenerateVideoAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';

type GenerateVideoApiResult = {
  taskId?: string;
  status?: string;
  error?: string;
};

export async function runGenerateVideoAction(input: {
  request: NextRequest;
  action: GenerateVideoAction;
  context: AgentContext;
}): Promise<AgentActionResult> {
  const result = await callInternalJson<GenerateVideoApiResult>(input.request, '/api/generate-video', {
    prompt: input.action.prompt,
    seconds: input.action.durationSeconds || 5,
    size: input.action.size || '720x1280',
    modelMode: input.action.mode || 'standard',
  });

  if (!result.taskId) {
    throw new Error(result.error || '视频任务创建失败');
  }

  return {
    kind: 'video_started',
    taskId: result.taskId,
    status: result.status,
    message: '已发起视频生成任务',
  };
}
