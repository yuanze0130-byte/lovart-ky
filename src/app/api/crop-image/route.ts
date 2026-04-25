import { NextRequest, NextResponse } from 'next/server';

interface CropRequestBody {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CropRequestBody>;
    const { image, x, y, width, height } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const values = [x, y, width, height];
    if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return NextResponse.json({ error: 'Crop values must be valid numbers' }, { status: 400 });
    }

    if ((width ?? 0) <= 0 || (height ?? 0) <= 0) {
      return NextResponse.json({ error: 'Crop width and height must be greater than 0' }, { status: 400 });
    }

    return NextResponse.json({
      imageData: image,
      crop: { x, y, width, height },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to crop image', details: message },
      { status: 500 }
    );
  }
}
