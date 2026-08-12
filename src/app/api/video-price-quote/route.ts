import { NextRequest, NextResponse } from 'next/server';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { normalizeVideoGenerationConfig, type VideoGenerationConfig } from '@/lib/video-models';
import { isVideoPriceUnavailableError, quoteVideoCredits } from '@/lib/video-pricing';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'video-price-quote', { limit: 60, windowMs: 60_000 });
    const body = await readLimitedJson(request, 16 * 1024) as Partial<VideoGenerationConfig>;
    const config = normalizeVideoGenerationConfig(body);
    const quote = quoteVideoCredits(config);
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (isVideoPriceUnavailableError(error)) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 422 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    return NextResponse.json({ ok: false, error: '视频报价失败', details: message }, { status: 500 });
  }
}
