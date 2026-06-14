import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { consumeCredits, getVideoCreditCost, refundCredits } from '@/lib/credits';

type VideoModelMode = 'standard' | 'fast';
type SupportedVideoRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3' | '4:5';

const DEFAULT_VIDEO_MODEL = 'sora-2';
const VIDEO_MODELS: Record<VideoModelMode, string> = {
  standard: process.env.VIDEO_MODEL_STANDARD || process.env.VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
  fast: process.env.VIDEO_MODEL_FAST || DEFAULT_VIDEO_MODEL,
};

function stringifyErrorPayload(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function inferRatioFromSize(size?: string): SupportedVideoRatio {
  switch (size) {
    case '1280x720':
    case '1792x1024':
      return '16:9';
    case '720x1280':
    case '1024x1792':
      return '9:16';
    case '1024x1024':
      return '1:1';
    case '1024x768':
      return '4:3';
    case '768x1024':
      return '3:4';
    case '1536x640':
      return '21:9';
    case '1152x768':
      return '3:2';
    case '768x1152':
      return '2:3';
    case '1024x1280':
      return '4:5';
    default:
      return '9:16';
  }
}

function normalizeVideoBaseURL(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function normalizeSoraAspectRatio(ratio: SupportedVideoRatio): '16:9' | '9:16' {
  return ratio === '16:9' || ratio === '21:9' || ratio === '3:2' || ratio === '4:3' ? '16:9' : '9:16';
}

function normalizeSoraDuration(seconds?: number): '10' | '15' | '25' {
  if (!seconds) return '10';
  if (seconds >= 25) return '25';
  if (seconds >= 15) return '15';
  return '10';
}

function normalizeReferenceImageForSora(referenceImage: string) {
  if (/^data:image\/[^;]+;base64,/i.test(referenceImage)) {
    return referenceImage;
  }

  return `data:image/jpeg;base64,${referenceImage}`;
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;
  let chargedAmount = 0;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

    const body = (await request.json()) as {
      prompt?: string;
      seconds?: number;
      size?: string;
      referenceImage?: string;
      modelMode?: VideoModelMode;
    };

    const selectedMode: VideoModelMode = body.modelMode === 'fast' ? 'fast' : 'standard';

    chargedAmount = getVideoCreditCost(selectedMode);
    const creditResult = await consumeCredits({
      userId: user.id,
      amount: chargedAmount,
      type: 'generate_video',
      description: `生成视频 (${selectedMode})`,
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，生成视频需 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    creditsConsumed = true;

    const { prompt, size, referenceImage } = body;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required');
    }

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseURL(process.env.VIDEO_API_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn');

    if (!apiKey) {
      throw new Error('VIDEO_API_KEY or GEMINI_API_KEY not configured');
    }

    const resolvedModel = VIDEO_MODELS[selectedMode] || process.env.VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
    const ratio = normalizeSoraAspectRatio(inferRatioFromSize(size));
    const duration = normalizeSoraDuration(body.seconds);
    const effectiveModel = duration === '25' && resolvedModel === 'sora-2'
      ? 'sora-2-pro'
      : resolvedModel;

    const payload = {
      model: effectiveModel,
      prompt,
      aspect_ratio: ratio,
      duration,
      hd: false,
      private: true,
      ...(referenceImage ? { images: [normalizeReferenceImageForSora(referenceImage)] } : {}),
    };

    const response = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data: { id?: string; task_id?: string; status?: string; error?: unknown; message?: unknown } = {};

    try {
      data = rawText ? (JSON.parse(rawText) as { id?: string; task_id?: string; status?: string; error?: unknown; message?: unknown }) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        `Upstream video API error (${response.status} ${response.statusText}): ${stringifyErrorPayload(data.error || data.message || rawText || 'Failed to start video generation')}`
      );
    }

    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error(`Upstream video API did not return task_id: ${rawText.slice(0, 500)}`);
    }

    return NextResponse.json({
      taskId,
      status: data.status,
      model: effectiveModel,
      modelMode: selectedMode,
      ratio,
      duration,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (creditsConsumed && chargedUserId) {
      try {
        await refundCredits({
          userId: chargedUserId,
          amount: chargedAmount,
          type: 'manual_adjust',
          description: '视频生成失败，自动退回积分',
        });
      } catch (refundError) {
        console.error('Failed to refund credits after video generation error:', refundError);
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate video', details: message },
      { status: 500 }
    );
  }
}
