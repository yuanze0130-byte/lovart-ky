import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { consumeCredits, getVideoCreditCost, refundCredits } from '@/lib/credits';
import { normalizeGenerationJobStatus } from '@/lib/generation-jobs';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { getVideoModelDefinition, normalizeVideoGenerationConfig, type VideoAspectRatio, type VideoAudioMode } from '@/lib/video-models';

type VideoModelMode = 'standard' | 'fast';

interface GenerateVideoBody {
  prompt?: string;
  seconds?: number;
  size?: string;
  referenceImage?: string;
  modelMode?: VideoModelMode;
  modelId?: string;
  aspectRatio?: VideoAspectRatio;
  duration?: number;
  resolution?: string;
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

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;
  let chargedAmount = 0;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;
    enforceUserRateLimit(user.id, 'generate-video', { limit: 5, windowMs: 60_000 });

    const body = await readLimitedJson(request, 12 * 1024 * 1024) as GenerateVideoBody;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 10_000) {
      return NextResponse.json({ error: '提示词不能为空且不能超过 10000 个字符' }, { status: 400 });
    }

    const legacyModelId = body.modelMode === 'fast' ? 'jimeng-cli-seedance2.0fast' : 'jimeng-cli-seedance2.0';
    const config = normalizeVideoGenerationConfig({
      modelId: body.modelId || legacyModelId,
      aspectRatio: body.aspectRatio || inferRatioFromSize(body.size),
      duration: body.duration || body.seconds || 8,
      resolution: body.resolution,
      hd: body.hd,
      useStartEndFrames: body.useStartEndFrames,
      audioMode: body.audioMode,
      generateAudio: body.generateAudio,
      multiShot: body.multiShot,
      cameraFixed: body.cameraFixed,
    });
    const definition = getVideoModelDefinition(config.modelId);
    const selectedMode: VideoModelMode = definition.id.toLowerCase().includes('fast') || definition.id.toLowerCase().includes('turbo') ? 'fast' : 'standard';

    const suppliedReferences = [
      ...(Array.isArray(body.referenceImages) ? body.referenceImages : []),
      ...(body.referenceImage ? [body.referenceImage] : []),
    ].filter(isAllowedImageReference).slice(0, definition.maxReferenceImages || 1);
    const firstFrame = isAllowedImageReference(body.firstFrame) ? body.firstFrame : suppliedReferences[0];
    const lastFrame = config.useStartEndFrames && isAllowedImageReference(body.lastFrame) ? body.lastFrame : undefined;
    const effectiveReferences = definition.supportsReferenceImages
      ? [firstFrame, ...suppliedReferences].filter((image, index, list): image is string => Boolean(image) && list.indexOf(image) === index).slice(0, definition.maxReferenceImages || 1)
      : [];

    chargedAmount = getVideoCreditCost(selectedMode);
    const creditResult = await consumeCredits({
      userId: user.id,
      amount: chargedAmount,
      type: 'generate_video',
      description: `生成视频 (${definition.label})`,
    });
    if (!creditResult.ok) {
      return NextResponse.json({ error: '积分不足', details: `当前积分 ${creditResult.currentCredits}，生成视频需要 ${creditResult.requiredCredits} 积分` }, { status: 402 });
    }
    creditsConsumed = true;

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseURL(process.env.VIDEO_API_BASE_URL || 'https://ai.comfly.org');
    if (!apiKey) throw new Error('VIDEO_API_KEY 未配置');

    const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const images = effectiveReferences.map((image) => normalizeImageReference(image, publicOrigin));
    const payload = {
      model: definition.apiModel || definition.id,
      prompt,
      aspect_ratio: config.aspectRatio === 'auto' ? undefined : config.aspectRatio,
      duration: String(config.duration),
      resolution: config.resolution,
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
    return NextResponse.json({
      taskId,
      status: data.status,
      jobStatus: normalizeGenerationJobStatus(data.status || 'queued'),
      model: definition.apiModel || definition.id,
      modelId: definition.id,
      modelMode: selectedMode,
      ratio: config.aspectRatio,
      duration: config.duration,
      resolution: config.resolution,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (creditsConsumed && chargedUserId) {
      try { await refundCredits({ userId: chargedUserId, amount: chargedAmount, type: 'manual_adjust', description: '视频生成失败，自动退回积分' }); }
      catch (refundError) { console.error('Failed to refund credits after video generation error:', refundError); }
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to generate video', details: message }, { status: 500 });
  }
}
