import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import type { AnnotationObject, AnnotationPoint } from '@/lib/object-annotation';
import { detectObjectWithProvider } from '@/lib/object-detection-provider';
import { consumeCredits, CREDIT_COSTS, refundCredits } from '@/lib/credits';

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
  let chargedUserId: string | null = null;
  let creditsConsumed = false;
  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

    const creditResult = await consumeCredits({
      userId: user.id,
      amount: CREDIT_COSTS.detectObject,
      type: 'manual_adjust',
      description: '对象标记识别',
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，标记编辑需 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    creditsConsumed = true;

    const { image, imageWidth, imageHeight, click } = await request.json() as {
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

    try {
      const result = await detectObjectWithProvider({
        image,
        imageWidth: width,
        imageHeight: height,
        click,
        fallback,
      });

      return NextResponse.json(result);
    } catch (modelError) {
      console.warn('Object detection failed, using fallback:', modelError);
      return NextResponse.json({
        object: fallback,
        provider: 'fallback',
        details: modelError instanceof Error ? modelError.message : '对象识别失败，已生成候选框',
      });
    }
  } catch (error) {
    if (chargedUserId && creditsConsumed) {
      await refundCredits({
        userId: chargedUserId,
        amount: CREDIT_COSTS.detectObject,
        type: 'manual_adjust',
        description: '标记编辑失败退款',
      });
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
