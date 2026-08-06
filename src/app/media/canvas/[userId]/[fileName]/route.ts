import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { getCanvasAssetContentType, getCanvasAssetFile } from '@/lib/canvas-asset-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; fileName: string }> }
) {
  const { userId, fileName } = await params;
  const filePath = getCanvasAssetFile(userId, fileName);
  if (!filePath) return new NextResponse('Not found', { status: 404 });

  try {
    const bytes = await readFile(/*turbopackIgnore: true*/ filePath);
    return new NextResponse(bytes, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': getCanvasAssetContentType(fileName),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new NextResponse('Not found', { status: 404 });
    }
    return new NextResponse('Unable to read image', { status: 500 });
  }
}
