import { NextRequest, NextResponse } from 'next/server';
import { verifySignedCanvasAssetUrl } from '@/lib/canvas-asset-access';

export async function GET(request: NextRequest) {
  const originalUri = request.headers.get('x-original-uri') || request.nextUrl.searchParams.get('uri') || '';
  return new NextResponse(null, { status: verifySignedCanvasAssetUrl(originalUri) ? 204 : 403 });
}
