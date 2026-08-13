import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { saveCanvasAsset } from '@/lib/canvas-asset-server';
import { getCanvasAssetMaxBytes } from '@/lib/canvas-asset-server';
import { assertDeclaredBodySize, enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get('content-length')) {
      return NextResponse.json({ error: '上传请求必须声明文件大小' }, { status: 411 });
    }
    assertDeclaredBodySize(request, Math.max(getCanvasAssetMaxBytes('image'), getCanvasAssetMaxBytes('video')) + 1024 * 1024);
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-asset-upload', { limit: 12, windowMs: 60_000 });
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少素材文件' }, { status: 400 });
    }

    const asset = await saveCanvasAsset(user.id, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(asset, { status: 201 });
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

    const message = error instanceof Error ? error.message : '素材保存失败';
    const status = /素材文件为空|超过服务器允许|存储空间已满|仅支持/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
