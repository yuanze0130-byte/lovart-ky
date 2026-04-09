import { NextRequest, NextResponse } from 'next/server';
import { removeBackground } from '@/lib/remove-background';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

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

    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const result = await removeBackground(image);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to remove background', details: message },
      { status: 500 }
    );
  }
}
