import OpenAI from 'openai';
import { GoogleGenAI, Modality } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, CREDIT_COSTS, refundCredits } from '@/lib/credits';

type GeminiProvider = 'proxy' | 'official' | 'auto';
type ModelVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
type SupportedAspectRatio = '1:1' | '4:3' | '16:9' | '9:16';
type SupportedResolution = '1K' | '2K' | '4K';

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
  referenceImages?: string[];
  resolution?: SupportedResolution;
  aspectRatio?: SupportedAspectRatio;
  modelVariant?: ModelVariant;
  editMode?: ImageEditMode;
}

interface NormalizedReferenceImage {
  kind: 'url' | 'inline';
  url?: string;
  data?: string;
  mimeType?: string;
}

function getProvider(): GeminiProvider {
  const provider = (process.env.GEMINI_PROVIDER || 'proxy').toLowerCase();
  if (provider === 'official' || provider === 'auto') return provider;
  return 'proxy';
}

function buildPrompt(prompt: string, resolution: SupportedResolution, aspectRatio: SupportedAspectRatio) {
  const aspectRatioInstruction = `Generate the image in ${aspectRatio} aspect ratio.`;
  const resolutionInstruction =
    resolution === '4K'
      ? 'Target a high-detail 4K-style composition.'
      : resolution === '2K'
        ? 'Target a high-detail 2K-style composition.'
        : 'Target a clear 1K-style composition.';

  return `${prompt}\n\n${aspectRatioInstruction}\n${resolutionInstruction}`;
}

function normalizeReferenceImage(referenceImage?: string): NormalizedReferenceImage | undefined {
  if (!referenceImage) return undefined;

  const trimmed = referenceImage.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) {
    return {
      kind: 'url',
      url: trimmed,
    };
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      kind: 'inline',
      mimeType: dataUrlMatch[1],
      data: dataUrlMatch[2],
    };
  }

  return {
    kind: 'inline',
    mimeType: 'image/jpeg',
    data: trimmed,
  };
}

function normalizeReferenceImages(referenceImages?: string[], referenceImage?: string) {
  const normalized = (referenceImages || [])
    .map((image) => normalizeReferenceImage(image))
    .filter(Boolean) as NormalizedReferenceImage[];

  if (normalized.length > 0) return normalized.slice(0, 4);

  const single = normalizeReferenceImage(referenceImage);
  return single ? [single] : [];
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

  const references = normalizeReferenceImages(payload.referenceImages, payload.referenceImage);
  references.forEach((reference) => {
    const url = reference.kind === 'url'
      ? reference.url!
      : `data:${reference.mimeType || 'image/jpeg'};base64,${reference.data || ''}`;

    content.push({
      type: 'image_url',
      image_url: { url },
    });
  });

  content.push({ type: 'text', text: finalPrompt });

  const proxyModel =
    payload.modelVariant === 'standard'
      ? process.env.GEMINI_PROXY_STANDARD_MODEL || 'nano-banana'
      : process.env.GEMINI_PROXY_MODEL || 'gemini-3.1-flash-image-preview';

  const response = (await client.chat.completions.create({
    model: proxyModel,
    messages: [{ role: 'user', content }],
  })) as unknown as GeminiChatCompletion;

  const baseResult = {
    requestedAspectRatio: payload.aspectRatio || '1:1',
    requestedResolution: payload.resolution || '1K',
    provider: 'proxy' as const,
    providerMode: getProvider(),
    providerFallbackUsed: false,
    model: proxyModel,
    modelVariant: payload.modelVariant || 'pro',
    editMode: payload.editMode || 'generate',
    referenceCount: references.length,
  };

  const parts = response.choices?.[0]?.message?.parts;
  if (parts && Array.isArray(parts)) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        return {
          imageData: `data:${mimeType};base64,${part.inlineData.data}`,
          textResponse: '',
          ...baseResult,
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
        ...baseResult,
      };
    }

    const urlMatch = messageContent.match(/https?:\/\/[^\s\)]+\.(jpg|jpeg|png|webp|gif)/i);
    if (urlMatch) {
      return {
        imageData: urlMatch[0],
        textResponse: '',
        ...baseResult,
      };
    }

    const trimmed = messageContent.trim();
    if (trimmed.length > 200 && !/\s/.test(trimmed)) {
      return {
        imageData: `data:image/png;base64,${trimmed}`,
        textResponse: '',
        ...baseResult,
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

  const ai = new GoogleGenAI({ apiKey });
  const finalPrompt = buildPrompt(
    payload.prompt,
    payload.resolution || '1K',
    payload.aspectRatio || '1:1'
  );

  const references = normalizeReferenceImages(payload.referenceImages, payload.referenceImage);
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  for (const reference of references) {
    if (reference.kind === 'url' && reference.url) {
      const upstreamResponse = await fetch(reference.url);
      if (!upstreamResponse.ok) {
        throw new Error(`Failed to fetch reference image URL (${upstreamResponse.status} ${upstreamResponse.statusText}): ${reference.url}`);
      }

      const contentType = upstreamResponse.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await upstreamResponse.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      parts.push({
        inlineData: {
          mimeType: contentType,
          data: base64Data,
        },
      });
      continue;
    }

    if (reference.data) {
      parts.push({
        inlineData: {
          mimeType: reference.mimeType || 'image/jpeg',
          data: reference.data,
        },
      });
    }
  }

  parts.push({ text: finalPrompt });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    config: {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
        aspectRatio: payload.aspectRatio || '1:1',
        imageSize: payload.resolution || '1K',
      },
    },
  });

  const baseResult = {
    requestedAspectRatio: payload.aspectRatio || '1:1',
    requestedResolution: payload.resolution || '1K',
    provider: 'official' as const,
    providerMode: getProvider(),
    providerFallbackUsed: false,
    model,
    modelVariant: payload.modelVariant || 'pro',
    editMode: payload.editMode || 'generate',
    referenceCount: references.length,
  };

  const candidates = response.candidates || [];
  for (const candidate of candidates) {
    const candidateContent = candidate.content;
    const responseParts = candidateContent?.parts || [];

    for (const part of responseParts) {
      const inlineData = part.inlineData;
      if (inlineData?.data) {
        return {
          imageData: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
          textResponse: '',
          ...baseResult,
        };
      }
    }
  }

  const responseText = typeof response.text === 'string' ? response.text.trim() : '';
  if (responseText) {
    throw new Error(`Google Gemini 返回了文字而非图片: ${responseText.slice(0, 300)}`);
  }

  throw new Error('No image data in official Gemini response');
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

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
          details: `当前积分 ${creditResult.currentCredits}，生成图片需 ${creditResult.requiredCredits} 积分`,
        },
        { status: 402 }
      );
    }

    creditsConsumed = true;

    const {
      prompt,
      referenceImage,
      referenceImages,
      resolution = '1K',
      aspectRatio = '1:1',
      modelVariant = 'pro',
      editMode = 'generate',
    } = (await request.json()) as GenerateImagePayload;

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required');
    }

    const payload: GenerateImagePayload = {
      prompt,
      referenceImage,
      referenceImages,
      resolution,
      aspectRatio,
      modelVariant,
      editMode,
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
      return NextResponse.json({
        ...result,
        providerMode: 'auto',
        providerFallbackUsed: true,
        fallbackFrom: 'official',
        fallbackReason: officialError instanceof Error ? officialError.message : String(officialError),
      });
    }
  } catch (error: unknown) {
    if (creditsConsumed && chargedUserId) {
      try {
        await refundCredits({
          userId: chargedUserId,
          amount: CREDIT_COSTS.generateImage,
          type: 'manual_adjust',
          description: '图片生成失败，自动退回积分',
        });
      } catch (refundError) {
        console.error('Failed to refund credits after image generation error:', refundError);
      }
    }

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
