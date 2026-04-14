import { NextRequest, NextResponse } from 'next/server';
import { submitUpscaleTask } from '@/lib/upscale';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, getUpscaleCreditCost } from '@/lib/credits';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const { image, scale } = await request.json();

    const upscaleScale = typeof scale === 'number' ? scale : Number(scale || 2);
    const creditResult = await consumeCredits({
      userId: user.id,
      amount: getUpscaleCreditCost(upscaleScale),
      type: 'upscale',
      description: `AI 超分 (${upscaleScale}x)`,
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，超分需要 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    if (!Number.isFinite(upscaleScale) || upscaleScale <= 0) {
      return NextResponse.json({ error: 'Scale must be a positive number' }, { status: 400 });
    }

    const result = await submitUpscaleTask(image, upscaleScale);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to start upscale task', details: message },
      { status: 500 }
    );
  }
}
