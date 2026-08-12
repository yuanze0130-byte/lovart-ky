import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { getVideoModelDefinition, normalizeVideoGenerationConfig, type VideoAspectRatio, type VideoAudioMode, type VideoQualityMode } from '@/lib/video-models';
import { isVideoPriceUnavailableError, quoteVideoCredits, type VideoPriceQuote } from '@/lib/video-pricing';

type VideoModelMode = 'standard' | 'fast';

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

    await supabase.from('video_generation_jobs').update({ status: 'starting', updated_at: new Date().toISOString() }).eq('request_id', requestId);
    const response = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
    const rawText = await response.text();
    let data: { id?: string; task_id?: string; status?: string; error?: unknown; message?: unknown } = {};
    try { data = rawText ? JSON.parse(rawText) as typeof data : {}; } catch { data = {}; }
    if (!response.ok) throw new Error(`上游视频接口错误 (${response.status}): ${stringifyErrorPayload(data.error || data.message || rawText)}`);

    const taskId = data.task_id || data.id;
    if (!taskId) throw new Error(`上游接口未返回任务 ID: ${rawText.slice(0, 500)}`);
    const taskStatus = data.status || 'queued';
    const { error: taskUpdateError } = await supabase.from('video_generation_jobs').update({
      task_id: taskId,
      status: taskStatus,
      updated_at: new Date().toISOString(),
    }).eq('request_id', requestId).eq('user_id', user.id);
    if (taskUpdateError) console.error('Failed to attach upstream video task to billing job:', taskUpdateError);

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
    if (creditsConsumed && chargedUserId && requestId) {
      try {
        const refund = await refundCredits({
          userId: chargedUserId,
          amount: chargedAmount,
          type: 'refund',
          originalType: 'generate_video',
          description: '视频任务启动失败，自动退回积分',
          referenceId: requestId,
          meta: { reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' },
        });
        const supabase = createServiceRoleSupabaseClient();
        await supabase.from('video_generation_jobs').update({
          status: 'refunded',
          refunded_credits: refund.refundedCredits,
          failure_reason: error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR',
          updated_at: new Date().toISOString(),
        }).eq('request_id', requestId).eq('user_id', chargedUserId);
      } catch (refundError) {
        console.error('Failed to refund credits after video generation error:', refundError);
      }
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to generate video', details: message, requestId, priceVersion: quote?.priceVersion }, { status: 500 });
  }
}
