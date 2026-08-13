import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import type { AnnotationObject, AnnotationPoint } from '@/lib/object-annotation';
import { detectObjectWithProvider } from '@/lib/object-detection-provider';
import { CREDIT_COSTS, refundCredits } from '@/lib/credits';
import { randomUUID } from 'node:crypto';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function createFallbackObject(click: AnnotationPoint, imageWidth: number, imageHeight: number): AnnotationObject {
  const boxWidth = Math.max(72, Math.round(imageWidth * 0.28));
  const boxHeight = Math.max(72, Math.round(imageHeight * 0.28));

  const x = clamp(click.x - boxWidth / 2, 0, Math.max(0, imageWidth - boxWidth));
  const y = clamp(click.y - boxHeight / 2, 0, Math.max(0, imageHeight - boxHeight));

  return {
    id: `detected-${Date.now()}`,
    label: '对象',
    score: 0.5,
    bbox: { x, y, width: boxWidth, height: boxHeight },
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'detect-object', { limit: 10, windowMs: 60_000 });

    const { image, imageWidth, imageHeight, click } = await readLimitedJson(request, 24 * 1024 * 1024) as {
      image?: string;
      imageWidth?: number;
      imageHeight?: number;
      click?: AnnotationPoint;
    };

    if (!click || typeof click.x !== 'number' || typeof click.y !== 'number') {
      return NextResponse.json({ error: 'Missing click point' }, { status: 400 });
    }

    const width = typeof imageWidth === 'number' && imageWidth > 0 ? imageWidth : 512;
    const height = typeof imageHeight === 'number' && imageHeight > 0 ? imageHeight : 512;
    const fallback = createFallbackObject(click, width, height);

    if (!image || typeof image !== 'string') {
      return NextResponse.json({
        object: {
          ...fallback,
          provider: 'fallback',
          details: '未提供可识别的图片，已生成候选框',
        },
        provider: 'fallback',
        details: '未提供可识别的图片，已生成候选框',
      });
    }

    const requestId = randomUUID();
    try {
      const { result, billing } = await runMeteredAiOperation({
        requestId,
        userId: user.id,
        scope: 'detect-object',
        creditCost: CREDIT_COSTS.detectObject,
        estimatedCostMicros: estimatedCostMicrosFromCredits(CREDIT_COSTS.detectObject),
        creditType: 'manual_adjust',
        description: '对象标记识别',
        referenceType: 'object_detection',
        run: () => detectObjectWithProvider({
          image,
          imageWidth: width,
          imageHeight: height,
          click,
          fallback,
        }),
      });

      if (result.provider === 'fallback' || result.provider === 'stub' || result.provider === 'sam-placeholder') {
        await refundCredits({
          userId: user.id,
          amount: CREDIT_COSTS.detectObject,
          type: 'refund',
          description: '对象标记识别回退退款',
          referenceId: requestId,
          originalType: 'manual_adjust',
        });
      }

      return NextResponse.json({ ...result, billing });
    } catch (modelError) {
      if (isAiSafetyError(modelError) || isAiToolRequestError(modelError)) throw modelError;
      console.warn('Object detection failed, using fallback:', modelError);

      return NextResponse.json({
        object: fallback,
        provider: 'fallback',
        details: modelError instanceof Error ? modelError.message : '对象识别失败，已生成候选框',
      });
    }
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiSafetyError(error) || isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    return NextResponse.json(
      {
        error: '对象识别失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
