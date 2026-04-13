import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

interface ReversePromptPayload {
  imageData?: string;
}

function normalizeReferenceImage(referenceImage?: string) {
  if (!referenceImage) return undefined;

  const trimmed = referenceImage.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^data:image\/[\w.+-]+;base64,/i.test(trimmed)) {
    return trimmed;
  }

  return `data:image/jpeg;base64,${trimmed.replace(/^data:image\/[\w.+-]+;base64,/i, '')}`;
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const { imageData } = (await request.json()) as ReversePromptPayload;
    if (!imageData || typeof imageData !== 'string') {
      return NextResponse.json({ error: 'imageData is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const baseURL = process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn/v1';
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const client = new OpenAI({ apiKey, baseURL });
    const normalized = normalizeReferenceImage(imageData);
    if (!normalized) {
      return NextResponse.json({ error: 'invalid imageData' }, { status: 400 });
    }

    const response = await client.chat.completions.create({
      model: process.env.GEMINI_PROXY_TEXT_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You analyze an image and return prompt-engineering metadata as JSON only. Output keys: concisePrompt, detailedPrompt, negativePrompt, styleTags, lightingTags, cameraTags, notes. concisePrompt and detailedPrompt must be Chinese-friendly and directly usable for image generation/editing. styleTags/lightingTags/cameraTags are arrays of short strings.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: normalized },
            },
            {
              type: 'text',
              text: '请反推这张图对应的生成提示词，尽量提炼主体、材质、服装/产品特征、光线、镜头、构图、背景氛围、风格关键词。请返回 JSON。',
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('empty model response');
    }

    const parsed = JSON.parse(content) as {
      concisePrompt?: string;
      detailedPrompt?: string;
      negativePrompt?: string;
      styleTags?: string[];
      lightingTags?: string[];
      cameraTags?: string[];
      notes?: string;
    };

    return NextResponse.json({
      concisePrompt: parsed.concisePrompt || '',
      detailedPrompt: parsed.detailedPrompt || parsed.concisePrompt || '',
      negativePrompt: parsed.negativePrompt || '',
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : [],
      lightingTags: Array.isArray(parsed.lightingTags) ? parsed.lightingTags : [],
      cameraTags: Array.isArray(parsed.cameraTags) ? parsed.cameraTags : [],
      notes: parsed.notes || '',
    });
  } catch (error: unknown) {
    console.error('Error reversing prompt:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to reverse prompt',
        details: message,
      },
      { status: 500 }
    );
  }
}
