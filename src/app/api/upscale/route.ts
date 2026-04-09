import { NextRequest, NextResponse } from 'next/server';
import { submitUpscaleTask } from '@/lib/upscale';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  let quote = getBillingQuote('upscale');

  try {
    const { image, scale } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const upscaleScale = typeof scale === 'number' ? scale : Number(scale || 2);
    if (!Number.isFinite(upscaleScale) || upscaleScale <= 0) {
      return NextResponse.json({ error: 'Scale must be a positive number' }, { status: 400 });
    }

    quote = getBillingQuote('upscale', { scale: upscaleScale });
    const provider = process.env.UPSCALE_PROVIDER || 'stub';

    if (provider !== 'stub') {
      await consumeCredits({
        action: 'upscale',
        quote,
        meta: {
          requestPath: '/api/upscale',
          provider,
          scale: upscaleScale,
        },
      });
    }

    const result = await submitUpscaleTask(image, upscaleScale);
    return NextResponse.json({ ...result, creditsCharged: provider !== 'stub' ? quote.credits : 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: '请先登录后再使用 AI 功能' }, { status: 401 });
    }

    if (message === 'SUPABASE_TOKEN_MISSING') {
      return NextResponse.json({ error: '未获取到积分系统认证令牌' }, { status: 401 });
    }

    if (message === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前功能需要 ${quote.credits} 积分`,
          requiredCredits: quote.credits,
        },
        { status: 402 }
      );
    }

    if ((process.env.UPSCALE_PROVIDER || 'stub') !== 'stub') {
      try {
        await refundCredits({
          action: 'upscale',
          quote,
          meta: {
            requestPath: '/api/upscale',
            provider: process.env.UPSCALE_PROVIDER || 'stub',
            reason: message,
          },
        });
      } catch (refundError) {
        console.error('Failed to refund credits for upscale:', refundError);
      }
    }

    return NextResponse.json(
      { error: 'Failed to start upscale task', details: message },
      { status: 500 }
    );
  }
}
