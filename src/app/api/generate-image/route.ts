import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS } from '@/lib/credits';

type GeminiProvider = 'proxy' | 'official' | 'auto';

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

interface GenerateImagePayload {
  prompt: string;
  referenceImage?: string;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio?: '1:1' | '4:3' | '16:9';
}

function getProvider(): GeminiProvider {
  const provider = (process.env.GEMINI_PROVIDER || 'proxy').toLowerCase();
  if (provider === 'official' || provider === 'auto') return provider;
  return 'proxy';
}

function buildPrompt(prompt: string, resolution: string, aspectRatio: string) {
  const aspectRatioInstruction = `Generate the image in ${aspectRatio} aspect ratio.`;
  const resolutionInstruction =
    resolution === '4K'
      ? 'Target a high-detail 4K-style composition.'
      : resolution === '2K'
        ? 'Target a high-detail 2K-style composition.'
        : 'Target a clear 1K-style composition.';

  return `${prompt}\n\n${aspectRatioInstruction}\n${resolutionInstruction}`;
}

function normalizeReferenceImage(referenceImage?: string) {
  if (!referenceImage) return undefined;
  return referenceImage.replace(/^data:image\/\w+;base64,/, '');
}

async function maybeTranslatePromptWithProxy(prompt: string) {
  const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
  const apiKey = process.env.GEMINI_API_KEY;
  const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';

  if (!hasChinese || !apiKey) {
    return prompt;
  }

  try {
    const client = new OpenAI({ apiKey, baseURL });
    const translateRes = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Translate the following image generation prompt to English. Only return the translated prompt, nothing else:\n${prompt}`,
        },
      ],
    });
    return translateRes.choices[0]?.message?.content?.trim() || prompt;
  } catch {
    return prompt;
  }
}

async function generateViaProxy(payload: GenerateImagePayload) {
  const apiKey = process.env.GEMINI_API_KEY;
  const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const client = new OpenAI({ apiKey, baseURL });
  const translatedPrompt = await maybeTranslatePromptWithProxy(payload.prompt);
  const finalPrompt = buildPrompt(
    translatedPrompt,
    payload.resolution || '1K',
    payload.aspectRatio || '1:1'
  );

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [];

  const base64Data = normalizeReferenceImage(payload.referenceImage);
  if (base64Data) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${base64Data}` },
    });
  }

  content.push({ type: 'text', text: finalPrompt });

  const response = (await client.chat.completions.create({
    model: process.env.GEMINI_PROXY_MODEL || 'gemini-3.1-flash-image-preview',
    messages: [{ role: 'user', content }],
  })) as unknown as GeminiChatCompletion;

  const parts = response.choices?.[0]?.message?.parts;
  if (parts && Array.isArray(parts)) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        return {
          imageData: `data:${mimeType};base64,${part.inlineData.data}`,
          textResponse: '',
          requestedAspectRatio: payload.aspectRatio || '1:1',
          requestedResolution: payload.resolution || '1K',
          provider: 'proxy',
        };
      }
    }
  }

  const messageContent = response.choices?.[0]?.message?.content;

  if (messageContent) {
    const base64Match = messageContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      return {
        imageData: base64Match[0],
        textResponse: '',
        requestedAspectRatio: payload.aspectRatio || '1:1',
        requestedResolution: payload.resolution || '1K',
        provider: 'proxy',
      };
    }

    const urlMatch = messageContent.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|webp|gif)/i);
    if (urlMatch) {
      return {
        imageData: urlMatch[0],
        textResponse: '',
        requestedAspectRatio: payload.aspectRatio || '1:1',
        requestedResolution: payload.resolution || '1K',
        provider: 'proxy',
      };
    }

    const trimmed = messageContent.trim();
    if (trimmed.length > 200 && !/\s/.test(trimmed)) {
      return {
        imageData: `data:image/png;base64,${trimmed}`,
        textResponse: '',
        requestedAspectRatio: payload.aspectRatio || '1:1',
        requestedResolution: payload.resolution || '1K',
        provider: 'proxy',
      };
    }

    throw new Error(`模型返回了文字而非图片: ${messageContent.slice(0, 300)}`);
  }

  throw new Error('No image data in proxy response');
}

async function generateViaOfficial(payload: GenerateImagePayload) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const model = process.env.GOOGLE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured');
  }

  const finalPrompt = buildPrompt(
    payload.prompt,
    payload.resolution || '1K',
    payload.aspectRatio || '1:1'
  );

  const parts: Array<Record<string, unknown>> = [];
  const base64Data = normalizeReferenceImage(payload.referenceImage);

  if (base64Data) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data,
      },
    });
  }

  parts.push({ text: finalPrompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
      }),
    }
  );

  const rawText = await response.text();
  let json: Record<string, unknown> = {};

  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    throw new Error(rawText || 'Google Gemini returned non-JSON response');
  }

  if (!response.ok) {
    const errorMessage =
      (json.error as { message?: string } | undefined)?.message ||
      rawText ||
      'Google Gemini request failed';
    throw new Error(errorMessage);
  }

  const candidates = json.candidates as Array<Record<string, unknown>> | undefined;
  const content = candidates?.[0]?.content as { parts?: Array<Record<string, unknown>> } | undefined;
  const responseParts = content?.parts || [];

  for (const part of responseParts) {
    const inlineData = part.inlineData as { data?: string; mimeType?: string } | undefined;
    if (inlineData?.data) {
      return {
        imageData: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
        textResponse: '',
        requestedAspectRatio: payload.aspectRatio || '1:1',
        requestedResolution: payload.resolution || '1K',
        provider: 'official',
      };
    }
  }

  const text = responseParts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();

  if (text) {
    throw new Error(`Google Gemini 返回了文字而非图片: ${text.slice(0, 300)}`);
  }

  throw new Error('No image data in official Gemini response');
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const creditResult = await consumeCredits({
      userId: user.id,
      amount: CREDIT_COSTS.generateImage,
      type: 'generate_image',
      description: '生成图片',
    });

    if (!creditResult.ok) {
      return NextResponse.json(
        {
          error: '积分不足',
          details: `当前积分 ${creditResult.currentCredits}，生成图片需要 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    const {
      prompt,
      referenceImage,
      resolution = '1K',
      aspectRatio = '1:1',
    } = (await request.json()) as GenerateImagePayload;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const payload: GenerateImagePayload = {
      prompt,
      referenceImage,
      resolution,
      aspectRatio,
    };

    const provider = getProvider();

    if (provider === 'proxy') {
      const result = await generateViaProxy(payload);
      return NextResponse.json(result);
    }

    if (provider === 'official') {
      const result = await generateViaOfficial(payload);
      return NextResponse.json(result);
    }

    try {
      const result = await generateViaOfficial(payload);
      return NextResponse.json(result);
    } catch (officialError) {
      console.warn('Official Gemini failed, fallback to proxy:', officialError);
      const result = await generateViaProxy(payload);
      return NextResponse.json(result);
    }
  } catch (error: unknown) {
    console.error('Error generating image:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: message,
      },
      { status: 500 }
    );
  }
}
