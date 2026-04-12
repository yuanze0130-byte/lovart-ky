import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';

type VideoModelMode = 'standard' | 'fast';
type SupportedVideoRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3' | '4:5';

const DEFAULT_VIDEO_MODEL = 'sora-2';
const VIDEO_MODELS: Record<VideoModelMode, string> = {
  standard: process.env.VIDEO_MODEL_STANDARD || process.env.VIDEO_MODEL || 'doubao-seedance-2-0-260128',
  fast: process.env.VIDEO_MODEL_FAST || 'doubao-seedance-2-0-fast-260128',
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const creditResult = await consumeCredits({
      userId: user.id,
      amount: CREDIT_COSTS.generateVideo,
      type: 'generate_video',
      description: '生成视频',
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，生成视频需要 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    const { prompt, seconds, size, referenceImage, modelMode } = (await request.json()) as {
      prompt?: string;
      seconds?: number;
      size?: string;
      referenceImage?: string;
      modelMode?: VideoModelMode;
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.VIDEO_API_KEY;
    const baseUrl = process.env.VIDEO_API_BASE_URL || 'https://www.clockapi.fun/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'VIDEO_API_KEY not configured' }, { status: 500 });
    }

    const selectedMode: VideoModelMode = modelMode === 'fast' ? 'fast' : 'standard';
    const resolvedModel = VIDEO_MODELS[selectedMode] || process.env.VIDEO_MODEL || DEFAULT_VIDEO_MODEL;

    const form = new FormData();
    form.append('model', resolvedModel);
    form.append('prompt', prompt);

    if (seconds) form.append('seconds', seconds.toString());
    if (size) form.append('size', size);

    if (referenceImage) {
      const base64Data = referenceImage.includes('base64,')
        ? referenceImage.split('base64,')[1]
        : referenceImage;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      form.append('input_reference', blob, 'reference.jpg');
    }

    const response = await fetch(`${baseUrl}/v2/videos/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const rawText = await response.text();
    let data: { id?: string; status?: string; error?: string; message?: string } = {};

    try {
      data = rawText ? (JSON.parse(rawText) as { id?: string; status?: string; error?: string; message?: string }) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        `Upstream video API error (${response.status} ${response.statusText}): ${data.error || data.message || rawText || 'Failed to start video generation'}`
      );
    }

    return NextResponse.json({ taskId: data.id, status: data.status, model: resolvedModel, modelMode: selectedMode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate video', details: message },
      { status: 500 }
    );
  }
}
