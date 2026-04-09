import { NextRequest, NextResponse } from 'next/server';
import { removeBackground } from '@/lib/remove-background';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  const quote = getBillingQuote('remove_background');

  try {
    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const provider = process.env.REMOVE_BG_PROVIDER || 'stub';

    if (provider !== 'stub') {
      await consumeCredits({
        action: 'remove_background',
        quote,
        meta: {
          requestPath: '/api/remove-background',
          provider,
        },
      });
    }

    const result = await removeBackground(image);
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

    if ((process.env.REMOVE_BG_PROVIDER || 'stub') !== 'stub') {
      try {
        await refundCredits({
          action: 'remove_background',
          quote,
          meta: {
            requestPath: '/api/remove-background',
            provider: process.env.REMOVE_BG_PROVIDER || 'stub',
            reason: message,
          },
        });
      } catch (refundError) {
        console.error('Failed to refund credits for remove-background:', refundError);
      }
    }

    return NextResponse.json(
      { error: 'Failed to remove background', details: message },
      { status: 500 }
    );
  }
}
