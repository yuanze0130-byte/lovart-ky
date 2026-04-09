import { NextRequest, NextResponse } from 'next/server';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  let quote = getBillingQuote('generate_video');

  try {
    const { prompt, seconds, size, referenceImage } = await request.json();
    quote = getBillingQuote('generate_video', {
      seconds,
      size,
      referenceImage: Boolean(referenceImage),
    });

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.VIDEO_API_KEY;
    const baseUrl = process.env.VIDEO_API_BASE_URL || 'https://www.clockapi.fun/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'VIDEO_API_KEY not configured' }, { status: 500 });
    }

    await consumeCredits({
      action: 'generate_video',
      quote,
      meta: {
        requestPath: '/api/generate-video',
        provider: 'video_api',
        seconds: seconds || 10,
        size: size || '720x1280',
        hasReferenceImage: Boolean(referenceImage),
        promptLength: prompt.length,
      },
    });

    const form = new FormData();
    form.append('model', 'sora-2');
    form.append('prompt', prompt);

    if (seconds) form.append('seconds', seconds.toString());
    if (size) form.append('size', size);

    if (referenceImage) {
      const base64Data = referenceImage.includes('base64,')
        ? referenceImage.split('base64,')[1]
        : referenceImage;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      form.append('input_reference', blob, 'reference.jpg');
    }

    const response = await fetch(`${baseUrl}/videos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = (await response.json()) as { id?: string; status?: string; error?: string };
    if (!response.ok) throw new Error(data.error || 'Failed to start video generation');

    return NextResponse.json({ taskId: data.id, status: data.status });
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

    try {
      await refundCredits({
        action: 'generate_video',
        quote,
        meta: {
          requestPath: '/api/generate-video',
          provider: 'video_api',
          reason: message,
        },
      });
    } catch (refundError) {
      console.error('Failed to refund credits for generate-video:', refundError);
    }

    return NextResponse.json(
      { error: 'Failed to generate video', details: message },
      { status: 500 }
    );
  }
}
