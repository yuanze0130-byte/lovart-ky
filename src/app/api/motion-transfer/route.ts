import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getVideoCreditCost } from '@/lib/credits';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';

type MotionModel = 'kling-2.6' | 'kling-3.0';
type MotionMode = 'std' | 'pro' | '4k';
type MotionOrientation = 'image' | 'video';

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

function absoluteAssetUrl(value: string, origin: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return new URL(value, origin).toString();
  throw new Error('动作迁移参考素材必须先保存到服务器');
}

function resolveModel(model: MotionModel, mode: MotionMode) {
  const prefix = model === 'kling-3.0' ? 'MOTION_TRANSFER_KLING_30' : 'MOTION_TRANSFER_KLING_26';
  const fallbackPrefix = model === 'kling-3.0' ? 'kling-v3.0' : 'kling-v2.6';
  const fallbackMode = mode === 'std' ? 'std' : 'pro';
  return process.env[`${prefix}_${mode.toUpperCase()}_MODEL`]
    || `${fallbackPrefix}-${fallbackMode}-motion-control`;
}

function buildPayload(input: {
  imageUrl: string;
  videoUrl: string;
  prompt: string;
  model: string;
  mode: MotionMode;
  keepAudio: boolean;
  orientation: MotionOrientation;
  watermark: boolean;
}) {
  const style = (process.env.MOTION_TRANSFER_PAYLOAD_STYLE || 'snake').toLowerCase();
  const quality = input.mode === '4k' ? '4k' : input.mode;
  if (style === 'camel') {
    return {
      model: input.model,
      prompt: input.prompt,
      imageUrl: input.imageUrl,
      videoUrl: input.videoUrl,
      mode: quality,
      characterOrientation: input.orientation,
      keepOriginalSound: input.keepAudio,
      watermark: input.watermark,
    };
  }
  if (style === 'runninghub') {
    return {
      model: input.model,
      prompt: input.prompt,
      imageUrl: input.imageUrl,
      videoUrl: input.videoUrl,
      characterOrientation: input.orientation,
      keepOriginalSound: input.keepAudio ? 'yes' : 'no',
      watermark: input.watermark ? 'yes' : 'no',
      mode: quality,
    };
  }
  return {
    model: input.model,
    prompt: input.prompt,
    image_url: input.imageUrl,
    video_url: input.videoUrl,
    mode: quality,
    character_orientation: input.orientation,
    keep_original_sound: input.keepAudio,
    watermark: input.watermark,
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'motion-transfer', { limit: 4, windowMs: 60_000 });
    const body = await readLimitedJson(request, 64 * 1024) as {
      imageUrl?: string;
      videoUrl?: string;
      prompt?: string;
      model?: MotionModel;
      mode?: MotionMode;
      keepAudio?: boolean;
      orientation?: MotionOrientation;
      watermark?: boolean;
    };

    if (!body.imageUrl || !body.videoUrl) {
      return NextResponse.json({ error: '请同时连接参考图和参考视频' }, { status: 400 });
    }

    const model = body.model === 'kling-3.0' ? 'kling-3.0' : 'kling-2.6';
    const mode: MotionMode = body.mode === 'pro' || body.mode === '4k' ? body.mode : 'std';
    const orientation: MotionOrientation = body.orientation === 'video' ? 'video' : 'image';
    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseUrl(process.env.VIDEO_API_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.comfly.org');
    const path = process.env.MOTION_TRANSFER_API_PATH || '/v2/videos/generations';
    if (!apiKey) throw new Error('VIDEO_API_KEY or GEMINI_API_KEY not configured');

    const chargedAmount = getVideoCreditCost(mode === 'std' ? 'fast' : 'standard');
    const requestId = randomUUID();
    const effectiveModel = resolveModel(model, mode);
    const { result: motionResult, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'motion-transfer',
      creditCost: chargedAmount,
      estimatedCostMicros: estimatedCostMicrosFromCredits(chargedAmount),
      creditType: 'generate_video',
      description: `动作迁移 (${model}/${mode})`,
      referenceType: 'motion_transfer',
      meta: { model: effectiveModel, mode },
      run: async () => {
        const payload = buildPayload({
          imageUrl: absoluteAssetUrl(body.imageUrl!, request.nextUrl.origin),
          videoUrl: absoluteAssetUrl(body.videoUrl!, request.nextUrl.origin),
          prompt: body.prompt?.trim() || '',
          model: effectiveModel,
          mode,
          keepAudio: body.keepAudio !== false,
          orientation,
          watermark: body.watermark === true,
        });
        const endpoint = /^https?:\/\//i.test(path) ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: request.signal,
        });
        const rawText = await response.text();
        let result: Record<string, unknown> = {};
        try { result = rawText ? JSON.parse(rawText) as Record<string, unknown> : {}; } catch { result = {}; }
        if (!response.ok) {
          throw new Error(`上游动作迁移接口错误 (${response.status}): ${stringifyErrorPayload(result.error || result.message || rawText)}`);
        }

        const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
        const output = result.output && typeof result.output === 'object' && !Array.isArray(result.output) ? result.output as Record<string, unknown> : {};
        const urls = Array.isArray(result.urls) ? result.urls : [];
        const outputUrls = Array.isArray(output.urls) ? output.urls : [];
        const taskId = firstString(result.task_id, result.taskId, result.id, data.task_id, data.id) || '';
        const videoUrl = firstString(
          result.video_url,
          result.videoUrl,
          result.url,
          typeof result.output === 'string' ? result.output : undefined,
          output.video_url,
          output.url,
          urls[0],
          outputUrls[0],
          typeof data.output === 'string' ? data.output : undefined,
        ) || '';
        if (!taskId && !videoUrl) throw new Error(`上游未返回任务 ID 或视频地址: ${rawText.slice(0, 500)}`);
        return {
          taskId: taskId || undefined,
          videoUrl: videoUrl || undefined,
          status: result.status || data.status,
          jobStatus: normalizeGenerationJobStatus(String(result.status || data.status || (videoUrl ? 'succeeded' : 'queued'))),
          model: effectiveModel,
          mode,
        };
      },
    });
    return NextResponse.json({ ...motionResult, billing });
  } catch (error) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (isAiSafetyError(error) || isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    return NextResponse.json({ error: '动作迁移启动失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
