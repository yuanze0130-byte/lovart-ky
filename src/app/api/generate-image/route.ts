import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { consumeCredits, refundCredits } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

interface GeminiInlineDataPart {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
}

interface GeminiMessage {
  content?: string | null;
  parts?: GeminiInlineDataPart[];
}

interface GeminiChatCompletion {
  choices?: Array<{
    message?: GeminiMessage;
  }>;
}

export async function POST(request: NextRequest) {
  let quote = getBillingQuote('generate_image');

  try {
    const { prompt, referenceImage, resolution } = await request.json();
    quote = getBillingQuote('generate_image', {
      resolution,
      referenceImage: Boolean(referenceImage),
    });

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    await consumeCredits({
      action: 'generate_image',
      quote,
      meta: {
        requestPath: '/api/generate-image',
        provider: 'gemini',
        resolution: resolution || '1K',
        hasReferenceImage: Boolean(referenceImage),
        promptLength: prompt.length,
      },
    });

    const client = new OpenAI({ apiKey, baseURL });

    const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
    let finalPrompt = prompt;

    if (hasChinese) {
      const translateRes = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `Translate the following image generation prompt to English. Only return the translated prompt, nothing else:\n${prompt}`,
          },
        ],
      });
      finalPrompt = translateRes.choices[0]?.message?.content?.trim() || prompt;
    }

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];

    if (referenceImage) {
      const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Data}` },
      });
    }

    content.push({ type: 'text', text: finalPrompt });

    const response = (await client.chat.completions.create({
      model: 'gemini-3.1-flash-image-preview',
      messages: [{ role: 'user', content }],
    })) as unknown as GeminiChatCompletion;

    const parts = response.choices?.[0]?.message?.parts;
    if (parts && Array.isArray(parts)) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          return NextResponse.json({
            imageData: `data:${mimeType};base64,${part.inlineData.data}`,
            textResponse: '',
          });
        }
      }
    }

    const messageContent = response.choices?.[0]?.message?.content;

    if (messageContent) {
      const base64Match = messageContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (base64Match) {
        return NextResponse.json({
          imageData: base64Match[0],
          textResponse: '',
        });
      }

      const urlMatch = messageContent.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|webp|gif)/i);
      if (urlMatch) {
        return NextResponse.json({
          imageData: urlMatch[0],
          textResponse: '',
        });
      }

      const trimmed = messageContent.trim();
      if (trimmed.length > 200 && !/\s/.test(trimmed)) {
        return NextResponse.json({
          imageData: `data:image/png;base64,${trimmed}`,
          textResponse: '',
        });
      }

      console.log('Model returned text:', messageContent.slice(0, 500));
      return NextResponse.json(
        {
          error: '模型返回了文字而非图片',
          details: messageContent.slice(0, 300),
        },
        { status: 500 }
      );
    }

    console.log('Full response:', JSON.stringify(response, null, 2));
    return NextResponse.json({ error: 'No image data in response' }, { status: 500 });
  } catch (error: unknown) {
    console.error('Error generating image:', error);
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
        action: 'generate_image',
        quote,
        meta: {
          requestPath: '/api/generate-image',
          provider: 'gemini',
          reason: message,
        },
      });
    } catch (refundError) {
      console.error('Failed to refund credits for generate-image:', refundError);
    }

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: message,
      },
      { status: 500 }
    );
  }
}
