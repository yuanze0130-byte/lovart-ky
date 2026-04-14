import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS, refundCredits } from '@/lib/credits';

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

function decodeReferenceImage(referenceImage: string) {
  const matched = referenceImage.match(/^data:(image\/[^;]+);base64,(.+)$/);
  const mimeType = matched?.[1] || 'image/jpeg';
  const base64Data = matched?.[2] || referenceImage;
  const buffer = Buffer.from(base64Data, 'base64');
  const extension = mimeType.split('/')[1] || 'jpg';
  return { mimeType, buffer, extension };
}

async function uploadReferenceImage(userId: string, referenceImage: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.VIDEO_REFERENCE_BUCKET || 'video-references';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase storage is not configured for video reference upload');
  }

  const { mimeType, buffer, extension } = decodeReferenceImage(referenceImage);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const path = `${userId}/${randomUUID()}.${extension}`;

  const uploadResult = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadResult.error) {
    throw new Error(`Failed to upload reference image: ${uploadResult.error.message}`);
  }

  const signedUrlResult = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new Error(`Failed to create signed URL for reference image: ${signedUrlResult.error?.message || 'unknown error'}`);
  }

  return signedUrlResult.data.signedUrl;
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

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
          details: `当前积分 ${creditResult.currentCredits}，生成视频需 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    creditsConsumed = true;

    const { prompt, size, referenceImage, modelMode } = (await request.json()) as {
      prompt?: string;
      seconds?: number;
      size?: string;
      referenceImage?: string;
      modelMode?: VideoModelMode;
    };

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required');
    }

    const apiKey = process.env.VIDEO_API_KEY;
    const baseUrl = process.env.VIDEO_API_BASE_URL || 'https://ai.t8star.cn';

    if (!apiKey) {
      throw new Error('VIDEO_API_KEY not configured');
    }

    const selectedMode: VideoModelMode = modelMode === 'fast' ? 'fast' : 'standard';
    const resolvedModel = VIDEO_MODELS[selectedMode] || process.env.VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
    const ratio = inferRatioFromSize(size);
    const promptWithRatio = prompt.includes('--ratio') ? prompt : `${prompt} --ratio ${ratio}`;

    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      { type: 'text', text: promptWithRatio },
    ];

    if (referenceImage) {
      const referenceUrl = await uploadReferenceImage(user.id, referenceImage);
      content.push({
        type: 'image_url',
        image_url: { url: referenceUrl },
      });
    }

    const payload = {
      model: resolvedModel,
      content,
    };

    const response = await fetch(`${baseUrl}/seedance/v3/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data: { id?: string; status?: string; error?: unknown; message?: unknown } = {};

    try {
      data = rawText ? (JSON.parse(rawText) as { id?: string; status?: string; error?: unknown; message?: unknown }) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        `Upstream video API error (${response.status} ${response.statusText}): ${stringifyErrorPayload(data.error || data.message || rawText || 'Failed to start video generation')}`
      );
    }

    return NextResponse.json({
      taskId: data.id,
      status: data.status,
      model: resolvedModel,
      modelMode: selectedMode,
      ratio,
    });
  } catch (error: unknown) {
    if (creditsConsumed && chargedUserId) {
      try {
        await refundCredits({
          userId: chargedUserId,
          amount: CREDIT_COSTS.generateVideo,
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
