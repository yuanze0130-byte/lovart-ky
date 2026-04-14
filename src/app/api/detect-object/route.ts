import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import type { AnnotationObject, AnnotationPoint } from '@/lib/object-annotation';
import { detectObjectWithProvider } from '@/lib/object-detection-provider';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function createFallbackObject(click: AnnotationPoint, imageWidth: number, imageHeight: number): AnnotationObject {
  const boxWidth = Math.max(72, Math.round(imageWidth * 0.28));
  const boxHeight = Math.max(72, Math.round(imageHeight * 0.28));

  const x = clamp(click.x - boxWidth / 2, 0, Math.max(0, imageWidth - boxWidth));
  const y = clamp(click.y - boxHeight / 2, 0, Math.max(0, imageHeight - boxHeight));

  return {
    id: `detected-${Date.now()}`,
    label: '候选对象',
    score: 0.5,
    bbox: { x, y, width: boxWidth, height: boxHeight },
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const { image, imageWidth, imageHeight, click } = await request.json() as {
      image?: string;
      imageWidth?: number;
      imageHeight?: number;
      click?: AnnotationPoint;
    };

    if (!click || typeof click.x !== 'number' || typeof click.y !== 'number') {
      return NextResponse.json({ error: 'Missing click point' }, { status: 400 });
    }

    const width = typeof imageWidth === 'number' && imageWidth > 0 ? imageWidth : 512;
    const height = typeof imageHeight === 'number' && imageHeight > 0 ? imageHeight : 512;
    const fallback = createFallbackObject(click, width, height);

    if (!image || typeof image !== 'string') {
      return NextResponse.json({
        object: fallback,
        provider: 'fallback',
        details: '缺少图片数据，已使用点击位置生成候选框。',
      });
    }

    try {
      const result = await detectObjectWithProvider({
        image,
        imageWidth: width,
        imageHeight: height,
        click,
        fallback,
      });

      return NextResponse.json(result);
    } catch (modelError) {
      console.warn('Object detection failed, using fallback:', modelError);
      return NextResponse.json({
        object: fallback,
        provider: 'fallback',
        details: modelError instanceof Error ? modelError.message : '视觉识别失败，已使用点击位置生成候选框。',
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to detect object',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
