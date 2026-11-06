import type { NextRequest } from 'next/server';
import type { GenerateVideoAction, AgentActionResult, AgentContext } from '@/lib/agent/actions';
import { callInternalJson } from '@/lib/agent/executors/shared';
import { createHash } from 'node:crypto';

type GenerateVideoApiResult = {
  taskId?: string;
  status?: string;
  error?: string;
};

export async function runGenerateVideoAction(input: {
  request: NextRequest;
  action: GenerateVideoAction;
  context: AgentContext;
}): Promise<Extract<AgentActionResult,{kind:'video_started'}>> {
  if (!input.context.projectId || !input.context.executionRunId) throw new Error('请先保存项目再执行视频计划');
  // Video submission already has a durable idempotency ledger. Keep the same
  // UUID on retries rather than letting the route allocate a fresh paid job.
  const hash = createHash('sha256').update(`agent-video:${input.context.projectId}:${input.context.executionRunId}`).digest('hex');
  const requestId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const result = await callInternalJson<GenerateVideoApiResult>(input.request, '/api/generate-video', {
    requestId,
    projectId: input.context.projectId,
    generatorId: input.context.selectedElementId,
    expectedPrice: input.context.expectedVideoPrice,
    taskSource: 'agent',
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
    requestId,
    taskId: result.taskId,
    status: result.status,
    message: '已发起视频生成任务',
  };
}
