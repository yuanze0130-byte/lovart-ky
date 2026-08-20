import { NextRequest, NextResponse } from 'next/server';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { isImageModelId } from '@/lib/image-models';
import {
  isImageModelResolutionError,
  resolveImageUpstreamModel,
  type ImageResolution,
} from '@/lib/image-model-routing';
import { isImagePriceUnavailableError, quoteImageCredits } from '@/lib/image-pricing';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';

function isResolution(value: unknown): value is ImageResolution {
  return value === '1K' || value === '2K' || value === '4K';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'image-price-quote', { limit: 60, windowMs: 60_000 });
    const body = await readLimitedJson(request, 8 * 1024) as Record<string, unknown>;
    const modelId = isImageModelId(body.modelId) ? body.modelId : null;
    const resolution = isResolution(body.resolution) ? body.resolution : null;

    if (!modelId || !resolution) {
      return NextResponse.json({ ok: false, error: '图片模型或分辨率无效' }, { status: 400 });
    }

    const referenceCount = typeof body.referenceCount === 'number' ? body.referenceCount : 0;
    const upstreamModel = resolveImageUpstreamModel({ modelId, resolution });
    const quote = quoteImageCredits({ modelId, resolution, referenceCount, upstreamModel });
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (isImagePriceUnavailableError(error) || isImageModelResolutionError(error)) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 422 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    return NextResponse.json({ ok: false, error: '图片报价失败', details: message }, { status: 500 });
  }
}
