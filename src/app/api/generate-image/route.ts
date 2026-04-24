import OpenAI from 'openai';
import { GoogleGenAI, Modality } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { consumeCredits, getImageCreditCost, refundCredits } from '@/lib/credits';

type GeminiProvider = 'proxy' | 'official' | 'auto';
type ModelVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
type SupportedAspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
type SupportedResolution = '1K' | '2K' | '4K';

interface GeminiInlineDataPart {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  inline_data?: {
    data?: string;
    mime_type?: string;
  };
}

interface GeminiOfficialResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlineDataPart[];
    };
  }>;
  text?: string;
}

interface GeminiMessage {
  content?: string | null;
  parts?: GeminiInlineDataPart[];
}

interface GeminiChatCompletion {
  choices?: Array<{
    message?: GeminiMessage & {
      content?: string | Array<{
        type?: string;
        text?: string;
        image_url?: { url?: string };
        url?: string;
        b64_json?: string;
        image_base64?: string;
      }> | null;
    };
  }>;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  images?: Array<{
    url?: string;
    b64_json?: string;
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
  const aspectRatioInstruction = aspectRatio === 'auto'
    ? 'Choose the most suitable aspect ratio automatically based on the prompt and composition.'
    : `Generate the image in ${aspectRatio} aspect ratio.`;
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

function getProxyModel(payload: GenerateImagePayload) {
  const resolution = payload.resolution || '1K';

  if (payload.modelVariant === 'standard') {
    if (resolution === '2K') {
      return process.env.GEMINI_PROXY_STANDARD_MODEL_2K || process.env.GEMINI_PROXY_STANDARD_MODEL_HD || 'nano-banana-hd';
    }

    if (resolution === '4K') {
      return process.env.GEMINI_PROXY_STANDARD_MODEL_4K || 'gemini-3.1-flash-image-preview-4k';
    }

    return process.env.GEMINI_PROXY_STANDARD_MODEL || 'nano-banana';
  }

  if (resolution === '2K') {
    return process.env.GEMINI_PROXY_PRO_MODEL_2K || 'nano-banana-pro-2k';
  }

  if (resolution === '4K') {
    return process.env.GEMINI_PROXY_PRO_MODEL_4K || 'nano-banana-pro-4k';
  }

  return process.env.GEMINI_PROXY_PRO_MODEL || process.env.GEMINI_PROXY_MODEL || 'nano-banana-pro';
}

function getProxyTargets() {
  const primaryBaseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';
  const primaryApiKey = process.env.GEMINI_API_KEY;
  const fallbackBaseURL = process.env.GEMINI_FALLBACK_BASE_URL;
  const fallbackApiKey = process.env.GEMINI_FALLBACK_API_KEY;

  const targets = [
    primaryApiKey ? { label: 'primary' as const, baseURL: primaryBaseURL, apiKey: primaryApiKey } : null,
    fallbackApiKey && fallbackBaseURL ? { label: 'fallback' as const, baseURL: fallbackBaseURL, apiKey: fallbackApiKey } : null,
  ].filter(Boolean) as Array<{ label: 'primary' | 'fallback'; baseURL: string; apiKey: string }>;

  return targets;
}

function extractImageFromGeminiResponse(response: GeminiOfficialResponse, baseResult: Record<string, unknown>) {
  const candidates = response?.candidates || [];
  for (const candidate of candidates) {
    const responseParts = candidate?.content?.parts || [];

    for (const part of responseParts) {
      const inlineData = part?.inlineData;
      const inlineDataSnakeCase = part?.inline_data;
      const imageData = inlineData?.data || inlineDataSnakeCase?.data;
      if (imageData) {
        const mimeType = inlineData?.mimeType || inlineDataSnakeCase?.mime_type || 'image/png';
        return {
          imageData: `data:${mimeType};base64,${imageData}`,
          textResponse: '',
          ...baseResult,
        };
      }
    }
  }

  const responseText = typeof response?.text === 'string' ? response.text.trim() : '';
  if (responseText) {
    throw new Error(`Gemini 返回了文字而非图片: ${responseText.slice(0, 300)}`);
  }

  throw new Error('No image data in Gemini response');
}

function extractImageFromProxyResponse(response: GeminiChatCompletion, baseResult: Record<string, unknown>) {
  try {
    console.log('[generate-image] proxy response summary:', {
      proxyTarget: baseResult.proxyTarget,
      providerMode: baseResult.providerMode,
      model: baseResult.model,
      topLevelKeys: Object.keys((response || {}) as Record<string, unknown>),
      hasChoices: Array.isArray(response?.choices),
      hasData: Array.isArray(response?.data),
      hasImages: Array.isArray(response?.images),
      messageContentType: Array.isArray(response?.choices?.[0]?.message?.content)
        ? 'array'
        : typeof response?.choices?.[0]?.message?.content,
      hasParts: Array.isArray(response?.choices?.[0]?.message?.parts),
    });
    console.log(
      '[generate-image] proxy raw response preview:',
      JSON.stringify(response, null, 2).slice(0, 5000)
    );
  } catch {
    // ignore logging issues
  }
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

  const directB64 = response.data?.[0]?.b64_json || response.images?.[0]?.b64_json;
  if (directB64) {
    return {
      imageData: `data:image/png;base64,${directB64}`,
      textResponse: '',
      ...baseResult,
    };
  }

  const directUrl = response.data?.[0]?.url || response.images?.[0]?.url;
  if (directUrl) {
    return {
      imageData: directUrl,
      textResponse: '',
      ...baseResult,
    };
  }

  const messageContent = response.choices?.[0]?.message?.content;

  if (Array.isArray(messageContent)) {
    for (const item of messageContent) {
      const imageUrl = item?.image_url?.url || item?.url;
      const b64 = item?.b64_json || item?.image_base64;
      if (imageUrl) {
        return {
          imageData: imageUrl,
          textResponse: '',
          ...baseResult,
        };
      }
      if (b64) {
        return {
          imageData: `data:image/png;base64,${b64}`,
          textResponse: '',
          ...baseResult,
        };
      }
    }
    throw new Error(`模型返回了结构化内容但未找到图片数据: ${JSON.stringify(messageContent).slice(0, 500)}`);
  }

  if (typeof messageContent === 'string' && messageContent) {
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

async function maybeTranslatePromptWithProxy(prompt: string) {
  const hasChinese = /[\u4e00-\u9fff]/.test(prompt);
  const targets = getProxyTargets();

  if (!hasChinese || targets.length === 0) {
    return prompt;
  }

  try {
    const client = new OpenAI({ apiKey: targets[0].apiKey, baseURL: targets[0].baseURL });
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
  const targets = getProxyTargets();

  if (targets.length === 0) {
    throw new Error('GEMINI_API_KEY not configured');
  }

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

  const proxyModel = getProxyModel(payload);

  let lastError: unknown = null;

  for (const target of targets) {
    try {
      console.log('[generate-image] trying proxy target:', {
        target: target.label,
        baseURL: target.baseURL,
        model: proxyModel,
        modelVariant: payload.modelVariant || 'pro',
        resolution: payload.resolution || '1K',
        aspectRatio: payload.aspectRatio || '1:1',
        referenceCount: references.length,
      });

      const client = new OpenAI({ apiKey: target.apiKey, baseURL: target.baseURL });
      const response = (await client.chat.completions.create({
        model: proxyModel,
        messages: [{ role: 'user', content }],
      })) as unknown as GeminiChatCompletion;

      const baseResult = {
        requestedAspectRatio: payload.aspectRatio || '1:1',
        requestedResolution: payload.resolution || '1K',
        provider: 'proxy' as const,
        providerMode: getProvider(),
        providerFallbackUsed: target.label === 'fallback',
        fallbackFrom: target.label === 'fallback' ? 'primary' : undefined,
        model: proxyModel,
        modelVariant: payload.modelVariant || 'pro',
        editMode: payload.editMode || 'generate',
        referenceCount: references.length,
        proxyTarget: target.label,
      };

      return extractImageFromProxyResponse(response, baseResult);
    } catch (error) {
      lastError = error;
      console.warn('[generate-image] proxy target failed:', {
        target: target.label,
        baseURL: target.baseURL,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All proxy targets failed');
}

function buildGeminiGenerateUrl(baseUrl: string, model: string, apiVersion: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const modelPath = model.startsWith('models/') ? model : `models/${model}`;
  const versionPath = apiVersion ? `/${apiVersion.replace(/^\/+|\/+$/g, '')}` : '';

  if (normalizedBase.includes(':generateContent')) {
    return normalizedBase;
  }

  return `${normalizedBase}${versionPath}/${modelPath}:generateContent`;
}

async function generateViaGeminiRest(
  payload: GenerateImagePayload,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  baseResult: Record<string, unknown>
) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const model = process.env.GOOGLE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
  const geminiBaseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const geminiApiVersion = process.env.GOOGLE_GEMINI_API_VERSION ?? 'v1beta';

  if (!apiKey || !geminiBaseUrl) {
    throw new Error('GOOGLE_GEMINI_API_KEY or GOOGLE_GEMINI_BASE_URL not configured');
  }

  const url = new URL(buildGeminiGenerateUrl(geminiBaseUrl, model, geminiApiVersion));
  if (!url.searchParams.has('key')) {
    url.searchParams.set('key', apiKey);
  }

  console.log('[generate-image] trying gemini REST target:', {
    url: url.toString().replace(apiKey, '[redacted]'),
    model,
    modelVariant: payload.modelVariant || 'pro',
    resolution: payload.resolution || '1K',
    aspectRatio: payload.aspectRatio || '1:1',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: payload.aspectRatio || '1:1',
          imageSize: payload.resolution || '1K',
        },
      },
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Gemini REST failed (${response.status}): ${responseText.slice(0, 500)}`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Gemini REST returned non-JSON (${contentType || 'unknown'}): ${responseText.slice(0, 200)}`);
  }

  return extractImageFromGeminiResponse(JSON.parse(responseText), {
    ...baseResult,
    provider: 'official-rest',
    officialBaseUrl: geminiBaseUrl,
  });
}

async function generateViaOfficial(payload: GenerateImagePayload) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const model = process.env.GOOGLE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';
  const geminiBaseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const geminiApiVersion = process.env.GOOGLE_GEMINI_API_VERSION;

  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({
    apiKey,
    ...(geminiBaseUrl ? { httpOptions: { baseUrl: geminiBaseUrl, ...(geminiApiVersion !== undefined ? { apiVersion: geminiApiVersion } : {}) } } : {}),
  });
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

  console.log('[generate-image] trying gemini-compatible target:', {
    baseURL: geminiBaseUrl || 'google-default',
    model,
    modelVariant: payload.modelVariant || 'pro',
    resolution: payload.resolution || '1K',
    aspectRatio: payload.aspectRatio || '1:1',
    referenceCount: references.length,
  });

  const baseResult = {
    requestedAspectRatio: payload.aspectRatio || '1:1',
    requestedResolution: payload.resolution || '1K',
    provider: 'official' as const,
    providerMode: getProvider(),
    providerFallbackUsed: false,
    officialBaseUrl: geminiBaseUrl || 'google-default',
    model,
    modelVariant: payload.modelVariant || 'pro',
    editMode: payload.editMode || 'generate',
    referenceCount: references.length,
  };

  if (geminiBaseUrl) {
    return generateViaGeminiRest(payload, parts, baseResult);
  }

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

  return extractImageFromGeminiResponse(response, baseResult);
}

export async function POST(request: NextRequest) {
  let chargedUserId: string | null = null;
  let creditsConsumed = false;
  let chargedAmount = 0;

  try {
    const user = await requireUser(request);
    chargedUserId = user.id;

    const body = (await request.json()) as GenerateImagePayload;
    const {
      prompt,
      referenceImage,
      referenceImages,
      resolution = '1K',
      aspectRatio = '1:1',
      modelVariant = 'pro',
      editMode = 'generate',
    } = body;

    chargedAmount = getImageCreditCost(modelVariant, resolution);
    const creditResult = await consumeCredits({
      userId: user.id,
      amount: chargedAmount,
      type: 'generate_image',
      description: `生成图片 (${modelVariant}/${resolution})`,
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
          amount: chargedAmount,
          type: 'manual_adjust',
          description: '图片生成失败，自动退回积分',
        });
      } catch (refundError) {
        console.error('Failed to refund credits after image generation error:', refundError);
      }
    }

    console.error('[generate-image] final error:', error);
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
