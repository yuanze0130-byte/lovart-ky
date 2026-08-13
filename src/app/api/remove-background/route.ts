import { NextRequest, NextResponse } from 'next/server';
import { removeBackground } from '@/lib/remove-background';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { CREDIT_COSTS } from '@/lib/credits';
import { randomUUID } from 'node:crypto';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'remove-background', { limit: 8, windowMs: 60_000 });

    const { image } = await readLimitedJson(request, 24 * 1024 * 1024) as { image?: unknown };

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const requestId = randomUUID();
    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'remove-background',
      creditCost: CREDIT_COSTS.removeBackground,
      estimatedCostMicros: estimatedCostMicrosFromCredits(CREDIT_COSTS.removeBackground),
      creditType: 'remove_background',
      description: 'AI 去背景',
      referenceType: 'remove_background',
      run: () => removeBackground(image),
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
      { error: 'Failed to remove background', details: message },
      { status: 500 }
    );
  }
}
