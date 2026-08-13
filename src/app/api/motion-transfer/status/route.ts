import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { getGenerationJobFailureKind, normalizeGenerationJobStatus, normalizeGenerationProgress, normalizeProviderStatus } from '@/lib/generation-jobs';
import { enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';
import {
  bindAsyncGenerationTask,
  findAsyncGenerationJobByRequest,
  findOwnedAsyncGenerationJob,
  settleAsyncGenerationJob,
  updateAsyncGenerationJob,
} from '@/lib/async-generation-jobs';

function normalizeVideoBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function stringifyErrorPayload(value: unknown) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'motion-transfer-status', { limit: 60, windowMs: 60_000 });
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    if (taskId.length > 256) return NextResponse.json({ error: 'Task ID is invalid' }, { status: 400 });
    const requestId = request.nextUrl.searchParams.get('requestId');
    if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return NextResponse.json({ error: 'Request ID is invalid' }, { status: 400 });
    }

    let job = await findOwnedAsyncGenerationJob({
      userId: user.id,
      kind: 'motion_transfer',
      taskId,
    });
    if (!job && requestId) {
      const recoveryJob = await findAsyncGenerationJobByRequest({
        requestId,
        userId: user.id,
        kind: 'motion_transfer',
      });
      if (recoveryJob && (!recoveryJob.task_id || recoveryJob.status === 'outcome_unknown')) {
        job = await bindAsyncGenerationTask({
          requestId,
          userId: user.id,
          kind: 'motion_transfer',
          taskId,
          status: 'running',
        });
      }
    }
    if (!job) return NextResponse.json({ error: 'Motion transfer task not found' }, { status: 404 });

    if (job.status === 'succeeded' && job.output_url) {
      return NextResponse.json({
        taskId,
        status: 'succeeded',
        jobStatus: 'succeeded',
        progress: 100,
        videoUrl: job.output_url,
        requestId: job.request_id,
        chargedCredits: job.charged_credits,
        refundedCredits: job.refunded_credits,
      });
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({
        taskId,
        status: job.status,
        jobStatus: job.status,
        failureKind: job.status === 'cancelled' ? 'cancelled' : 'failed',
        progress: 0,
        error: job.failure_reason || 'Motion transfer task failed',
        requestId: job.request_id,
        chargedCredits: job.charged_credits,
        refundedCredits: job.refunded_credits,
      });
    }

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseUrl(process.env.VIDEO_API_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.comfly.org');
    const pathTemplate = process.env.MOTION_TRANSFER_STATUS_PATH || '/v2/videos/generations/{taskId}';
    if (!apiKey) throw new Error('VIDEO_API_KEY or GEMINI_API_KEY not configured');
    const path = pathTemplate.replace('{taskId}', encodeURIComponent(taskId));
    const endpoint = /^https?:\/\//i.test(path) ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: request.signal,
    });
    const rawText = await response.text();
    let result: Record<string, unknown> = {};
    try { result = rawText ? JSON.parse(rawText) as Record<string, unknown> : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(`上游任务查询错误 (${response.status}): ${stringifyErrorPayload(result.error || rawText)}`);

    const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
    const content = data.content && typeof data.content === 'object' && !Array.isArray(data.content) ? data.content as Record<string, unknown> : {};
    const output = result.output && typeof result.output === 'object' && !Array.isArray(result.output) ? result.output as Record<string, unknown> : {};
    const rawStatus = String(data.status || result.status || 'running');
    const normalizedStatus = normalizeProviderStatus(rawStatus);
    const jobStatus = normalizeGenerationJobStatus(normalizedStatus);
    const urls = Array.isArray(result.urls) ? result.urls : [];
    const contentUrls = Array.isArray(content.urls) ? content.urls : [];
    const videoUrl = firstString(
      result.video_url,
      result.videoUrl,
      result.url,
      typeof result.output === 'string' ? result.output : undefined,
      output.video_url,
      output.url,
      urls[0],
      typeof data.output === 'string' ? data.output : undefined,
      content.video_url,
      content.url,
      contentUrls[0],
    ) || '';

    const terminalWithoutOutput = jobStatus === 'succeeded' && !videoUrl;
    const effectiveJobStatus = terminalWithoutOutput ? 'failed' : jobStatus;
    const failureReason = firstString(
      data.fail_reason,
      result.error,
      terminalWithoutOutput ? 'Upstream task completed without a video URL' : undefined,
    );
    let settledJob = job;
    if (effectiveJobStatus === 'failed' || effectiveJobStatus === 'cancelled') {
      settledJob = await settleAsyncGenerationJob({
        job,
        status: effectiveJobStatus,
        failureReason: failureReason || 'Motion transfer task failed',
        meta: { taskId, providerStatus: normalizedStatus || null },
      });
    } else if (effectiveJobStatus === 'succeeded') {
      settledJob = await settleAsyncGenerationJob({
        job,
        status: 'succeeded',
        outputUrl: videoUrl,
      });
    } else {
      settledJob = await updateAsyncGenerationJob({
        requestId: job.request_id,
        userId: user.id,
        kind: 'motion_transfer',
        status: effectiveJobStatus === 'running' ? 'running' : 'queued',
      });
    }

    const persistedJobStatus = settledJob.status === 'succeeded'
      || settledJob.status === 'failed'
      || settledJob.status === 'cancelled'
      ? settledJob.status
      : effectiveJobStatus;
    const persistedFailureStatus = persistedJobStatus === 'failed' || persistedJobStatus === 'cancelled';
    return NextResponse.json({
      taskId,
      status: persistedJobStatus === 'succeeded'
        ? 'succeeded'
        : persistedFailureStatus ? persistedJobStatus : normalizedStatus,
      jobStatus: persistedJobStatus,
      failureKind: persistedFailureStatus ? getGenerationJobFailureKind(persistedJobStatus) : undefined,
      progress: normalizeGenerationProgress(result.progress as number | string | undefined, persistedJobStatus),
      videoUrl: settledJob.output_url || videoUrl || undefined,
      error: persistedFailureStatus ? settledJob.failure_reason || failureReason : undefined,
      model: result.model,
      requestId: job.request_id,
      chargedCredits: job.charged_credits,
      refundedCredits: settledJob.refunded_credits,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    return NextResponse.json({ error: '查询动作迁移状态失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
