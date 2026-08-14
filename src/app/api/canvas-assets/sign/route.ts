import { NextRequest, NextResponse } from 'next/server';
import { createSignedCanvasAssetUrl, parseCanvasAssetPath } from '@/lib/canvas-asset-access';
import { readLimitedJson } from '@/lib/ai-tool-request-guards';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await readLimitedJson(request, 64 * 1024) as Record<string, unknown>;
    const urls = Array.isArray(body.urls) ? body.urls.slice(0, 200) : [];
    const signed: Record<string, string> = {};

    for (const value of urls) {
      if (typeof value !== 'string') continue;
      const asset = parseCanvasAssetPath(value);
      if (!asset || asset.userId !== user.id) continue;
      signed[value] = createSignedCanvasAssetUrl(asset.userId, asset.fileName);
    }

    return NextResponse.json({ signed });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Unable to sign canvas assets' }, { status: 400 });
  }
}
