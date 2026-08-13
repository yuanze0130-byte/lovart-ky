import { NextRequest, NextResponse } from 'next/server';
import { submitUpscaleTask, UpscaleUpstreamResponseError } from '@/lib/upscale';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { getUpscaleCreditCost } from '@/lib/credits';
import { randomUUID } from 'node:crypto';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import {
  AsyncGenerationTaskBindingError,
  bindAsyncGenerationTask,
  createAsyncGenerationJob,
  settleAsyncGenerationJob,
  updateAsyncGenerationJob,
} from '@/lib/async-generation-jobs';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';
import type { AsyncGenerationJobRow } from '@/lib/supabase';

function isAbortOrTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function isLikelyTransportError(error: unknown) {
  if (!(error instanceof Error) || error instanceof UpscaleUpstreamResponseError) return false;
  const code = String((error as Error & { code?: unknown }).code || '').toUpperCase();
  return error instanceof TypeError
    || ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)
    || /fetch failed|network|socket|connection reset|timed? ?out/i.test(error.message);
}

function isUpscaleOutcomeUnknown(error: unknown) {
  return isAbortOrTimeoutError(error) || isLikelyTransportError(error);
}

export async function POST(request: NextRequest) {
  const asyncJobRef: { current: AsyncGenerationJobRow | null } = { current: null };
  let upstreamSubmissionStarted = false;
  let acceptedTaskId: string | null = null;
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'upscale', { limit: 6, windowMs: 60_000 });

    const { image, scale } = await readLimitedJson(request, 24 * 1024 * 1024) as { image?: unknown; scale?: unknown };
    const upscaleScale = typeof scale === 'number' ? scale : Number(scale || 2);

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    if (!Number.isFinite(upscaleScale) || upscaleScale <= 0) {
      return NextResponse.json({ error: 'Scale must be a positive number' }, { status: 400 });
    }

    const creditCost = getUpscaleCreditCost(upscaleScale);
    const requestId = randomUUID();
    asyncJobRef.current = await createAsyncGenerationJob({
      requestId,
      userId: user.id,
      kind: 'upscale',
      creditType: 'upscale',
      chargedCredits: creditCost,
      meta: { scale: upscaleScale },
    });
    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'upscale',
      creditCost,
      estimatedCostMicros: estimatedCostMicrosFromCredits(creditCost),
      creditType: 'upscale',
      description: `AI 超分 (${upscaleScale}x)`,
      referenceType: 'upscale',
      shouldRefundOnError: (error) => !(upstreamSubmissionStarted && isUpscaleOutcomeUnknown(error)),
      run: async () => {
        const result = await submitUpscaleTask(image, upscaleScale, request.signal, () => {
          upstreamSubmissionStarted = true;
        });
        if ('taskId' in result) {
          acceptedTaskId = result.taskId;
          const jobStatus = normalizeGenerationJobStatus(result.taskStatus);
          if (jobStatus === 'failed' || jobStatus === 'cancelled') {
            throw new Error('Upscale task was rejected by the upstream provider');
          }
          asyncJobRef.current = await bindAsyncGenerationTask({
            requestId,
            userId: user.id,
            kind: 'upscale',
            taskId: result.taskId,
            status: jobStatus === 'running' ? 'running' : 'queued',
          });
        } else {
          asyncJobRef.current = await updateAsyncGenerationJob({
            requestId,
            userId: user.id,
            kind: 'upscale',
            status: 'succeeded',
            outputUrl: result.imageData,
          });
        }
        return result;
      },
    });
    return NextResponse.json({ ...result, requestId, billing });
  } catch (error: unknown) {
    const asyncJob = asyncJobRef.current;
    const recoveryTaskId = error instanceof AsyncGenerationTaskBindingError ? error.taskId : acceptedTaskId;
    const upstreamOutcomeUnknown = Boolean(recoveryTaskId)
      || (upstreamSubmissionStarted && isUpscaleOutcomeUnknown(error));
    if (asyncJob && asyncJob.status !== 'succeeded') {
      await settleAsyncGenerationJob({
        job: asyncJob,
        status: upstreamOutcomeUnknown ? 'outcome_unknown' : 'failed',
        failureReason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        meta: { upstreamOutcomeUnknown, ...(recoveryTaskId ? { recoveryTaskId } : {}) },
        refund: !upstreamOutcomeUnknown,
      }).catch((settlementError) => {
        console.error('[upscale] Failed to settle rejected async task', settlementError);
      });
    }
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiSafetyError(error) || isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    if (upstreamOutcomeUnknown) {
      return NextResponse.json(
        {
          error: 'Upscale task outcome is unknown after cancellation or timeout',
          code: 'UPSCALE_UPSTREAM_OUTCOME_UNKNOWN',
          requestId: asyncJob?.request_id,
          taskId: recoveryTaskId || undefined,
          recoverable: Boolean(recoveryTaskId),
        },
        {
          status: 504,
          headers: recoveryTaskId ? { 'X-Doodleverse-Recoverable-Task-Id': recoveryTaskId } : undefined,
        },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to start upscale task', details: message },
      { status: 500 }
    );
  }
}
