import { NextRequest, NextResponse } from 'next/server';
import { removeBackground } from '@/lib/remove-background';

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const result = await removeBackground(image);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to remove background', details: message },
      { status: 500 }
    );
  }
}
