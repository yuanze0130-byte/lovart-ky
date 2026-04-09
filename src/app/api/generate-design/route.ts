import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

export async function POST(request: NextRequest) {
  const quote = getBillingQuote('generate_design');

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.XAI_API_KEY;
    const baseURL = process.env.XAI_BASE_URL || 'https://ai.t8star.cn/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'XAI_API_KEY not configured' }, { status: 500 });
    }

    await consumeCredits({
      action: 'generate_design',
      quote,
      meta: {
        requestPath: '/api/generate-design',
        provider: 'xai',
        promptLength: prompt.length,
      },
    });

    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 360000,
    });

    const completion = await client.chat.completions.create({
      model: process.env.XAI_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            "You are a professional design assistant. Based on user's description, provide detailed design suggestions including layout, colors, typography, and visual elements. Be specific and creative.",
        },
        {
          role: 'user',
          content: `Create a design concept for: ${prompt}`,
        },
      ],
    });

    const designSuggestion = completion.choices[0]?.message?.content ?? '未收到回复';

    return NextResponse.json({
      suggestion: designSuggestion,
    });
  } catch (error: unknown) {
    console.error('Error generating design:', error);
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
        action: 'generate_design',
        quote,
        meta: {
          requestPath: '/api/generate-design',
          provider: 'xai',
          reason: message,
        },
      });
    } catch (refundError) {
      console.error('Failed to refund credits for generate-design:', refundError);
    }

    return NextResponse.json(
      {
        error: 'Failed to generate design',
        details: message,
      },
      { status: 500 }
    );
  }
}
