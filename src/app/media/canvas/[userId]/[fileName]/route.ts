import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { getCanvasAssetContentType, getCanvasAssetFile } from '@/lib/canvas-asset-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string; fileName: string }> }
) {
  const { userId, fileName } = await params;
  const filePath = getCanvasAssetFile(userId, fileName);
  if (!filePath) return new NextResponse('Not found', { status: 404 });

  try {
    const fileStat = await stat(/* turbopackIgnore: true */ filePath);
    const contentType = getCanvasAssetContentType(fileName);
    const range = request.headers.get('range');
    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    };

    if (range && contentType.startsWith('video/')) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (!match) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileStat.size}` } });
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= fileStat.size) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileStat.size}` } });
      }
      const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ filePath, { start, end })) as ReadableStream;
      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
        },
      });
    }

    const stream = Readable.toWeb(createReadStream(/* turbopackIgnore: true */ filePath)) as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        ...commonHeaders,
        'Content-Length': String(fileStat.size),
      },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new NextResponse('Not found', { status: 404 });
    }
    return new NextResponse('Unable to read asset', { status: 500 });
  }
}
