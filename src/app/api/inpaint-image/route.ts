import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'inpaint-image', { limit: 6, windowMs: 60_000 });
    const { image, mask, prompt, modelVariant = 'nano-banana-pro' } = await readLimitedJson(request, 28 * 1024 * 1024) as {
      image?: string;
      mask?: string;
      prompt?: string;
      modelVariant?: string;
    };

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing source image' }, { status: 400 });
    }
    if (!mask || typeof mask !== 'string') {
      return NextResponse.json({ error: 'Missing mask image' }, { status: 400 });
    }
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const generationResponse = await fetch(`${request.nextUrl.origin}/api/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({
        prompt: [
          prompt.trim(),
          'The first reference is the source image. The second reference is a black-and-white mask.',
          'Only replace the white masked region. Preserve all black regions, subject identity, framing, lighting continuity, and surrounding pixels.',
          'Blend the edited region seamlessly into the original image without visible borders.',
        ].join('\n'),
        referenceImage: image,
        referenceImages: [image, mask],
        resolution: '1K',
        aspectRatio: 'auto',
        modelVariant,
        editMode: 'generate',
      }),
    });

    const data = await generationResponse.json();
    if (!generationResponse.ok) {
      return NextResponse.json(data, { status: generationResponse.status });
    }
    return NextResponse.json({ ...data, inpaintPrompt: prompt });
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
    return NextResponse.json({
      error: 'Inpaint failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
