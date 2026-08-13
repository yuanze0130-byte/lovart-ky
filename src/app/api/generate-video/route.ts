import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { consumeCredits } from '@/lib/credits';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { getVideoModelDefinition, normalizeVideoGenerationConfig, type VideoAspectRatio, type VideoAudioMode, type VideoQualityMode } from '@/lib/video-models';
import { isVideoPriceUnavailableError, quoteVideoCredits, type VideoPriceQuote } from '@/lib/video-pricing';
import { acquireAiExecution, finalizeAiBudget, isAiSafetyError, reserveAiBudget } from '@/lib/ai-safety';

type VideoModelMode = 'standard' | 'fast';
type VideoTerminalStatus = 'succeeded' | 'failed' | 'cancelled' | 'outcome_unknown';

class VideoUpstreamRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoUpstreamRejectedError';
  }
}

class VideoUpstreamOutcomeUnknownError extends Error {
  constructor(
    message: string,
    readonly code: 'VIDEO_UPSTREAM_OUTCOME_UNKNOWN' | 'VIDEO_TASK_BINDING_FAILED',
    readonly status: 503 | 504,
    readonly taskId?: string,
  ) {
    super(message);
    this.name = 'VideoUpstreamOutcomeUnknownError';
  }
}

interface GenerateVideoBody {
  requestId?: string;
  prompt?: string;
  seconds?: number;
  size?: string;
  referenceImage?: string;
  modelMode?: VideoModelMode;
  modelId?: string;
  aspectRatio?: VideoAspectRatio;
  duration?: number;
  resolution?: string;
  qualityMode?: VideoQualityMode;
  hd?: boolean;
  useStartEndFrames?: boolean;
  audioMode?: VideoAudioMode;
  generateAudio?: boolean;
  multiShot?: boolean;
  cameraFixed?: boolean;
  referenceImages?: string[];
  firstFrame?: string;
  lastFrame?: string;
}

function stringifyErrorPayload(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function isAbortOrTransportError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError) return true;
  const code = String((error as Error & { code?: unknown }).code || '').toUpperCase();
  return ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)
    || /fetch failed|network|socket|connection reset|timed? ?out/i.test(error.message);
}

async function settleVideoJob(params: {
  requestId: string;
  userId: string;
  status: VideoTerminalStatus;
  taskId?: string | null;
  failureReason?: string;
  meta?: Record<string, string | number | boolean | null>;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('settle_video_generation_job_atomic', {
    p_request_id: params.requestId,
    p_user_id: params.userId,
    p_terminal_status: params.status,
    p_task_id: params.taskId || null,
    p_failure_reason: params.failureReason?.slice(0, 1_000) || null,
    p_meta: params.meta || {},
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result?.success && result?.error_code !== 'VIDEO_JOB_TERMINAL_CONFLICT') {
    throw new Error(result?.error_code || 'VIDEO_JOB_SETTLEMENT_FAILED');
  }
  return result;
}

async function bindVideoTaskWithRetry(params: {
  requestId: string;
  userId: string;
  taskId: string;
  status: 'queued' | 'running';
}) {
  const supabase = createServiceRoleSupabaseClient();
  let lastError: unknown = new Error('Video task binding failed');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('video_generation_jobs')
      .update({ task_id: params.taskId, status: params.status, updated_at: new Date().toISOString() })
      .eq('request_id', params.requestId)
      .eq('user_id', params.userId)
      .is('task_id', null)
      .select('task_id,status')
      .maybeSingle();

    if (!error && data?.task_id === params.taskId) return;
    if (error) lastError = error;

    const { data: existing, error: verifyError } = await supabase
      .from('video_generation_jobs')
      .select('task_id,status')
      .eq('request_id', params.requestId)
      .eq('user_id', params.userId)
      .maybeSingle();
    if (!verifyError && existing?.task_id === params.taskId) return;
    if (!verifyError && existing?.task_id && existing.task_id !== params.taskId) {
      throw new VideoUpstreamOutcomeUnknownError(
        'Video request is already bound to a different upstream task',
        'VIDEO_TASK_BINDING_FAILED',
        503,
        params.taskId,
      );
    }
    if (verifyError) lastError = verifyError;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }

  console.error('[generate-video] failed to persist upstream task id after retries', {
    requestId: params.requestId,
    taskId: params.taskId,
    errorName: lastError instanceof Error ? lastError.name : typeof lastError,
  });
  throw new VideoUpstreamOutcomeUnknownError(
    'Upstream accepted the video task, but its task ID could not be persisted after retries',
    'VIDEO_TASK_BINDING_FAILED',
    503,
    params.taskId,
  );
}

function inferRatioFromSize(size?: string): VideoAspectRatio {
  const ratios: Record<string, VideoAspectRatio> = {
    '1280x720': '16:9', '1792x1024': '16:9', '720x1280': '9:16', '1024x1792': '9:16',
    '1024x1024': '1:1', '1024x768': '4:3', '768x1024': '3:4', '1536x640': '21:9',
    '1152x768': '3:2', '768x1152': '2:3',
  };
  return ratios[size || ''] || '16:9';
}

function normalizeVideoBaseURL(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function isAllowedImageReference(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 3 * 1024 * 1024
    && (/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value) || /^https?:\/\//i.test(value) || value.startsWith('/media/canvas/'));
}

function normalizeImageReference(value: string, origin: string) {
  if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return value;
  return new URL(value, origin).toString();
}

function normalizeRequestId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : crypto.randomUUID();
}

function responseFromExistingJob(job: {
  request_id: string;
  task_id: string | null;
  status: string;
  model_id: string;
  upstream_model: string;
  charged_credits: number;
  price_version: string;
  estimated_comfly_cost_micros: number;
}) {
  if (job.status === 'outcome_unknown') {
    const body = {
      error: 'The upstream video outcome is awaiting reconciliation',
      code: 'VIDEO_UPSTREAM_OUTCOME_UNKNOWN',
      requestId: job.request_id,
      taskId: job.task_id || undefined,
      chargedCredits: job.charged_credits,
      refundedCredits: 0,
      recoverable: true,
      idempotent: true,
    };
    return NextResponse.json(body, {
      status: 409,
      headers: job.task_id ? { 'X-Doodleverse-Recoverable-Task-Id': job.task_id } : undefined,
    });
  }
  if (!job.task_id) return null;
  return NextResponse.json({
    requestId: job.request_id,
    taskId: job.task_id,
    status: job.status,
    jobStatus: normalizeGenerationJobStatus(job.status),
    model: job.upstream_model,
    modelId: job.model_id,
    chargedCredits: job.charged_credits,
    priceVersion: job.price_version,
    comflyEstimatedCost: job.estimated_comfly_cost_micros / 100_000,
    idempotent: true,
  });
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;
  let chargedAmount = 0;
  let requestId: string | null = null;
  let quote: VideoPriceQuote | null = null;
  let budgetReserved = false;
  let upstreamStarted = false;
  let knownTaskId: string | null = null;
  let releaseExecution: (() => void) | null = null;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;
    enforceUserRateLimit(user.id, 'generate-video', { limit: 5, windowMs: 60_000 });

    const body = await readLimitedJson(request, 12 * 1024 * 1024) as GenerateVideoBody;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 10_000) {
      return NextResponse.json({ error: '提示词不能为空且不能超过 10000 个字符' }, { status: 400 });
    }

    requestId = normalizeRequestId(body.requestId);
    const legacyModelId = body.modelMode === 'fast' ? 'doubao-seedance-2-0-fast-260128' : 'doubao-seedance-2-0-260128';
    const config = normalizeVideoGenerationConfig({
      modelId: body.modelId || legacyModelId,
      aspectRatio: body.aspectRatio || inferRatioFromSize(body.size),
      duration: body.duration || body.seconds || 8,
      resolution: body.resolution,
      qualityMode: body.qualityMode,
      hd: body.hd,
      useStartEndFrames: body.useStartEndFrames,
      audioMode: body.audioMode,
      generateAudio: body.generateAudio,
      multiShot: body.multiShot,
      cameraFixed: body.cameraFixed,
    });
    quote = quoteVideoCredits(config);
    chargedAmount = quote.credits;
    const definition = getVideoModelDefinition(config.modelId);
    const selectedMode: VideoModelMode = definition.id.toLowerCase().includes('fast') || definition.id.toLowerCase().includes('turbo') ? 'fast' : 'standard';
    const supabase = createServiceRoleSupabaseClient();

    const { data: existingJob, error: existingError } = await supabase
      .from('video_generation_jobs')
      .select('request_id,task_id,status,model_id,upstream_model,charged_credits,price_version,estimated_comfly_cost_micros')
      .eq('request_id', requestId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingJob) {
      if (existingJob.model_id !== config.modelId || existingJob.charged_credits !== quote.credits || existingJob.price_version !== quote.priceVersion) {
        return NextResponse.json({ error: '请求标识已用于其他视频配置', code: 'VIDEO_REQUEST_CONFLICT' }, { status: 409 });
      }
      const existingResponse = responseFromExistingJob(existingJob);
      if (existingResponse) return existingResponse;
      return NextResponse.json({ error: '相同请求正在处理中', code: 'VIDEO_REQUEST_IN_PROGRESS', requestId }, { status: 409 });
    }

    await reserveAiBudget({
      requestId,
      userId: user.id,
      scope: 'generate-video',
      estimatedCostMicros: quote.costMicros,
    });
    budgetReserved = true;
    releaseExecution = acquireAiExecution({ requestId, userId: user.id, scope: 'generate-video' });

    const { error: jobInsertError } = await supabase.from('video_generation_jobs').insert({
      request_id: requestId,
      user_id: user.id,
      model_id: config.modelId,
      upstream_model: quote.upstreamModel,
      price_group: quote.group,
      price_version: quote.priceVersion,
      duration: config.duration,
      resolution: config.resolution || null,
      quality_mode: config.qualityMode,
      generate_audio: config.generateAudio,
      estimated_comfly_cost_micros: quote.costMicros,
      charged_credits: quote.credits,
      status: 'created',
    });
    if (jobInsertError) throw jobInsertError;

    const creditResult = await consumeCredits({
      userId: user.id,
      amount: chargedAmount,
      type: 'generate_video',
      description: `生成视频 (${definition.label})，${chargedAmount}积分`,
      referenceId: requestId,
      referenceType: 'video_generation',
      meta: {
        modelId: config.modelId,
        upstreamModel: quote.upstreamModel,
        priceGroup: quote.group,
        priceVersion: quote.priceVersion,
        comflyCostMicros: quote.costMicros,
        duration: config.duration,
        resolution: config.resolution || null,
        qualityMode: config.qualityMode,
        generateAudio: config.generateAudio,
      },
    });
    if (!creditResult.ok) {
      await supabase.from('video_generation_jobs').delete().eq('request_id', requestId).eq('user_id', user.id);
      await finalizeAiBudget(requestId, 'released');
      budgetReserved = false;
      return NextResponse.json({ error: '积分不足', details: `当前积分 ${creditResult.currentCredits}，生成视频需要 ${creditResult.requiredCredits} 积分` }, { status: 402 });
    }
    creditsConsumed = true;

    const suppliedReferences = [
      ...(Array.isArray(body.referenceImages) ? body.referenceImages : []),
      ...(body.referenceImage ? [body.referenceImage] : []),
    ].filter(isAllowedImageReference).slice(0, definition.maxReferenceImages || 1);
    const firstFrame = isAllowedImageReference(body.firstFrame) ? body.firstFrame : suppliedReferences[0];
    const lastFrame = config.useStartEndFrames && isAllowedImageReference(body.lastFrame) ? body.lastFrame : undefined;
    const effectiveReferences = definition.supportsReferenceImages
      ? [firstFrame, ...suppliedReferences].filter((image, index, list): image is string => Boolean(image) && list.indexOf(image) === index).slice(0, definition.maxReferenceImages || 1)
      : [];

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseURL(process.env.VIDEO_API_BASE_URL || 'https://ai.comfly.org');
    if (!apiKey) throw new Error('VIDEO_API_KEY 未配置');

    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const images = effectiveReferences.map((image) => normalizeImageReference(image, publicOrigin));
    const payload = {
      model: quote.upstreamModel,
      group: quote.group,
      prompt,
      aspect_ratio: config.aspectRatio === 'auto' ? undefined : config.aspectRatio,
      duration: String(config.duration),
      resolution: config.resolution,
      quality: config.qualityMode,
      hd: config.hd || undefined,
      private: true,
      images: images.length ? images : undefined,
      first_frame_image: firstFrame ? normalizeImageReference(firstFrame, publicOrigin) : undefined,
      last_frame_image: lastFrame ? normalizeImageReference(lastFrame, publicOrigin) : undefined,
      generate_audio: definition.supportsGenerateAudio ? config.generateAudio : undefined,
      audio: definition.supportsAudioMode ? config.audioMode : undefined,
      multi_shot: definition.supportsMultiShot ? config.multiShot : undefined,
      camera_fixed: definition.supportsCameraFixed ? config.cameraFixed : undefined,
    };

    const { error: startingError } = await supabase
      .from('video_generation_jobs')
      .update({ status: 'starting', updated_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .eq('user_id', user.id);
    if (startingError) throw startingError;
    if (request.signal.aborted) throw new DOMException('Request aborted before upstream submission', 'AbortError');

    upstreamStarted = true;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v2/videos/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
    } catch (fetchError) {
      if (isAbortOrTransportError(fetchError)) {
        throw new VideoUpstreamOutcomeUnknownError(
          'The upstream request was dispatched, but its response was interrupted',
          'VIDEO_UPSTREAM_OUTCOME_UNKNOWN',
          504,
        );
      }
      throw fetchError;
    }

    if (!response.ok) {
      let rejectedText = '';
      try { rejectedText = await response.text(); } catch { /* HTTP status is already definitive. */ }
      let rejectedData: { error?: unknown; message?: unknown } = {};
      try { rejectedData = rejectedText ? JSON.parse(rejectedText) as typeof rejectedData : {}; } catch { rejectedData = {}; }
      throw new VideoUpstreamRejectedError(
        `Upstream video API rejected the task (${response.status}): ${stringifyErrorPayload(rejectedData.error || rejectedData.message || rejectedText)}`,
      );
    }

    let rawText = '';
    try {
      rawText = await response.text();
    } catch {
      throw new VideoUpstreamOutcomeUnknownError(
        'The upstream accepted the request, but its response body was interrupted',
        'VIDEO_UPSTREAM_OUTCOME_UNKNOWN',
        504,
      );
    }
    let data: { id?: string; task_id?: string; status?: string; error?: unknown; message?: unknown } = {};
    try { data = rawText ? JSON.parse(rawText) as typeof data : {}; } catch { data = {}; }
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new VideoUpstreamOutcomeUnknownError(
        'The upstream returned success without a recoverable task ID',
        'VIDEO_UPSTREAM_OUTCOME_UNKNOWN',
        504,
      );
    }
    knownTaskId = taskId;
    const taskStatus = data.status || 'queued';
    const normalizedTaskStatus = normalizeGenerationJobStatus(taskStatus);
    await bindVideoTaskWithRetry({
      requestId,
      userId: user.id,
      taskId,
      status: normalizedTaskStatus === 'running' || normalizedTaskStatus === 'succeeded' ? 'running' : 'queued',
    });
    if (normalizedTaskStatus === 'failed' || normalizedTaskStatus === 'cancelled') {
      throw new VideoUpstreamRejectedError(`Upstream video task entered terminal status: ${taskStatus}`);
    }
    if (normalizedTaskStatus === 'succeeded') {
      await settleVideoJob({ requestId, userId: user.id, status: 'succeeded', taskId });
    }
    await finalizeAiBudget(requestId, 'completed').catch((error) => {
      console.error('[generate-video] 无法完成成本预留记录', error);
    });
    budgetReserved = false;

    return NextResponse.json({
      requestId,
      taskId,
      status: taskStatus,
      jobStatus: normalizeGenerationJobStatus(taskStatus),
      model: quote.upstreamModel,
      modelId: definition.id,
      modelMode: selectedMode,
      ratio: config.aspectRatio,
      duration: config.duration,
      resolution: config.resolution,
      chargedCredits: quote.credits,
      priceVersion: quote.priceVersion,
      comflyEstimatedCost: quote.comflyCost,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (isVideoPriceUnavailableError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    const upstreamOutcomeUnknown = error instanceof VideoUpstreamOutcomeUnknownError
      || (upstreamStarted && isAbortOrTransportError(error));
    const recoverableTaskId = error instanceof VideoUpstreamOutcomeUnknownError
      ? error.taskId || knownTaskId
      : knownTaskId;

    if (creditsConsumed && chargedUserId && requestId) {
      try {
        await settleVideoJob({
          requestId,
          userId: chargedUserId,
          status: upstreamOutcomeUnknown ? 'outcome_unknown' : 'failed',
          taskId: recoverableTaskId,
          failureReason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
          meta: {
            upstreamStarted,
            outcomeUnknown: upstreamOutcomeUnknown,
            errorName: error instanceof Error ? error.name : typeof error,
          },
        });
      } catch (settlementError) {
        console.error('[generate-video] failed to settle video billing job', {
          requestId,
          outcomeUnknown: upstreamOutcomeUnknown,
          errorName: settlementError instanceof Error ? settlementError.name : typeof settlementError,
        });
      }
    }
    if (budgetReserved && requestId) {
      await finalizeAiBudget(requestId, upstreamStarted ? 'completed' : 'released').catch((finalizeError) => {
        console.error('[generate-video] 无法释放成本预留记录', finalizeError);
      });
      budgetReserved = false;
    }
    if (isAiSafetyError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined });
    }
    if (upstreamOutcomeUnknown) {
      const outcomeError = error instanceof VideoUpstreamOutcomeUnknownError ? error : null;
      return NextResponse.json({
        error: outcomeError?.message || 'The upstream video outcome is unknown after a connection interruption',
        code: outcomeError?.code || 'VIDEO_UPSTREAM_OUTCOME_UNKNOWN',
        requestId,
        taskId: recoverableTaskId || undefined,
        chargedCredits: chargedAmount,
        refundedCredits: 0,
        recoverable: true,
      }, {
        status: outcomeError?.status || 504,
        headers: recoverableTaskId ? { 'X-Doodleverse-Recoverable-Task-Id': recoverableTaskId } : undefined,
      });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to generate video', details: message, requestId, priceVersion: quote?.priceVersion }, { status: 500 });
  } finally {
    releaseExecution?.();
  }
}
