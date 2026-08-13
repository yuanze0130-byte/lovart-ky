import { NextRequest, NextResponse } from 'next/server';
import { queryUpscaleTask } from '@/lib/upscale';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';
import {
  bindAsyncGenerationTask,
  findAsyncGenerationJobByRequest,
  findOwnedAsyncGenerationJob,
  settleAsyncGenerationJob,
  updateAsyncGenerationJob,
} from '@/lib/async-generation-jobs';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'upscale-status', { limit: 60, windowMs: 60_000 });
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }
    if (taskId.length > 256) {
      return NextResponse.json({ error: 'Task ID is invalid' }, { status: 400 });
    }
    const requestId = request.nextUrl.searchParams.get('requestId');
    if (requestId && !/^[0-9a-f-]{36}$/i.test(requestId)) {
      return NextResponse.json({ error: 'Request ID is invalid' }, { status: 400 });
    }

    let job = await findOwnedAsyncGenerationJob({
      userId: user.id,
      kind: 'upscale',
      taskId,
    });
    if (!job && requestId) {
      const recoveryJob = await findAsyncGenerationJobByRequest({
        requestId,
        userId: user.id,
        kind: 'upscale',
      });
      if (recoveryJob && (!recoveryJob.task_id || recoveryJob.status === 'outcome_unknown')) {
        job = await bindAsyncGenerationTask({
          requestId,
          userId: user.id,
          kind: 'upscale',
          taskId,
          status: 'running',
        });
      }
    }
    if (!job) {
      return NextResponse.json({ error: 'Upscale task not found' }, { status: 404 });
    }

    if (job.status === 'succeeded' && job.output_url) {
      return NextResponse.json({
        taskId,
        status: 'SUCCESS',
        imageData: job.output_url,
        requestId: job.request_id,
        chargedCredits: job.charged_credits,
        refundedCredits: job.refunded_credits,
      });
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({
        taskId,
        status: 'FAILED',
        imageData: '',
        error: job.failure_reason || 'Upscale task failed',
        requestId: job.request_id,
        chargedCredits: job.charged_credits,
        refundedCredits: job.refunded_credits,
      });
    }

    const result = await queryUpscaleTask(taskId, request.signal);
    const jobStatus = normalizeGenerationJobStatus(result.status);
    let settledJob = job;
    if (jobStatus === 'failed' || jobStatus === 'cancelled') {
      settledJob = await settleAsyncGenerationJob({
        job,
        status: jobStatus,
        failureReason: result.error || 'Upscale task failed',
        meta: { taskId, providerStatus: result.status },
      });
    } else if (jobStatus === 'succeeded') {
      settledJob = await settleAsyncGenerationJob({
        job,
        status: 'succeeded',
        outputUrl: result.imageData,
      });
    } else {
      settledJob = await updateAsyncGenerationJob({
        requestId: job.request_id,
        userId: user.id,
        kind: 'upscale',
        status: jobStatus === 'running' ? 'running' : 'queued',
      });
    }

    const persistedTerminal = settledJob.status === 'succeeded'
      ? { status: 'SUCCESS', imageData: settledJob.output_url || result.imageData }
      : settledJob.status === 'failed' || settledJob.status === 'cancelled'
        ? { status: 'FAILED', imageData: '', error: settledJob.failure_reason || result.error || 'Upscale task failed' }
        : result;
    return NextResponse.json({
      ...persistedTerminal,
      requestId: job.request_id,
      chargedCredits: job.charged_credits,
      refundedCredits: settledJob.refunded_credits,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get upscale status', details: message },
      { status: 500 }
    );
  }
}
