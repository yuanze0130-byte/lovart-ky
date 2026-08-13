import { NextRequest, NextResponse } from 'next/server';
import { submitUpscaleTask } from '@/lib/upscale';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { getUpscaleCreditCost } from '@/lib/credits';
import { randomUUID } from 'node:crypto';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';

export async function POST(request: NextRequest) {
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
    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'upscale',
      creditCost,
      estimatedCostMicros: estimatedCostMicrosFromCredits(creditCost),
      creditType: 'upscale',
      description: `AI 超分 (${upscaleScale}x)`,
      referenceType: 'upscale',
      run: () => submitUpscaleTask(image, upscaleScale),
    });
    return NextResponse.json({ ...result, billing });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiSafetyError(error) || isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to start upscale task', details: message },
      { status: 500 }
    );
  }
}
