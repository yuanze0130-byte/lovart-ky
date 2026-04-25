import { NextRequest, NextResponse } from 'next/server';
import { removeBackground } from '@/lib/remove-background';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS, refundCredits } from '@/lib/credits';

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const creditResult = await consumeCredits({
      userId: user.id,
      amount: CREDIT_COSTS.removeBackground,
      type: 'remove_background',
      description: 'AI 去背景',
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，去背景需要 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    creditsConsumed = true;

    const result = await removeBackground(image);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (chargedUserId && creditsConsumed) {
      await refundCredits({
        userId: chargedUserId,
        amount: CREDIT_COSTS.removeBackground,
        type: 'manual_adjust',
        description: 'AI 去背景失败退款',
      });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to remove background', details: message },
      { status: 500 }
    );
  }
}
