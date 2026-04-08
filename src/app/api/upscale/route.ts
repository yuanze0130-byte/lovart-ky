import { NextRequest, NextResponse } from 'next/server';
import { upscaleImage } from '@/lib/upscale';

export async function POST(request: NextRequest) {
  try {
    const { image, scale } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const upscaleScale = typeof scale === 'number' ? scale : Number(scale || 4);
    if (!Number.isFinite(upscaleScale) || upscaleScale <= 0) {
      return NextResponse.json({ error: 'Scale must be a positive number' }, { status: 400 });
    }

    const result = await upscaleImage(image, upscaleScale);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to upscale image', details: message },
      { status: 500 }
    );
  }
}
