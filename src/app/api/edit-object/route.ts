import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { serializeAnnotationPrompt, type AnnotationObject as DetectedObject } from '@/lib/object-annotation';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'edit-object', { limit: 6, windowMs: 60_000 });

    const { image, object, prompt, aspectRatio } = await readLimitedJson(request, 24 * 1024 * 1024) as {
      image?: string;
      object?: DetectedObject;
      prompt?: string;
      aspectRatio?: string;
    };

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 });
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    if (!object?.bbox) {
      return NextResponse.json({ error: 'Missing selected object' }, { status: 400 });
    }

    const origin = request.nextUrl.origin;
    const generationResponse = await fetch(`${origin}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({
        prompt: serializeAnnotationPrompt({ prompt, object }),
        referenceImage: image,
        referenceImages: [image],
        resolution: '1K',
        aspectRatio: aspectRatio || '1:1',
        modelVariant: 'pro',
        editMode: 'generate',
      }),
    });

    const data = await generationResponse.json();
    if (!generationResponse.ok) {
      throw new Error(data.details || data.error || '对象编辑生成失败');
    }

    return NextResponse.json({
      ...data,
      object,
      objectEditPrompt: prompt,
      provider: data.provider || 'image-generation',
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    return NextResponse.json(
      {
        error: 'Failed to edit object',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
