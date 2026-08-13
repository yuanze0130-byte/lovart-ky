import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  CanvasAssetStorageError,
  getCanvasAssetMaxBytes,
  saveCanvasAsset,
  saveCanvasAssetStream,
} from '@/lib/canvas-asset-server';
import { assertDeclaredBodySize, enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';

export const runtime = 'nodejs';

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function getDeclaredBytes(request: NextRequest) {
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return null;
  const declaredBytes = Number(rawLength);
  return Number.isSafeInteger(declaredBytes) && declaredBytes >= 0 ? declaredBytes : null;
}

async function saveRequestAsset(request: NextRequest, userId: string) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const maxBytes = Math.max(getCanvasAssetMaxBytes('image'), getCanvasAssetMaxBytes('video'));

  if (contentType.startsWith('multipart/form-data')) {
    if (process.env.CANVAS_ASSET_ALLOW_MULTIPART !== 'true') {
      throw new CanvasAssetStorageError('请刷新页面后重新上传素材', 415);
    }
    assertDeclaredBodySize(request, maxBytes + MULTIPART_OVERHEAD_BYTES);
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new CanvasAssetStorageError('缺少素材文件', 400);
    return saveCanvasAsset(userId, new Uint8Array(await file.arrayBuffer()));
  }

  if (!contentType.startsWith('image/') && !contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    throw new CanvasAssetStorageError('素材请求必须使用图片、视频或二进制格式', 415);
  }

  assertDeclaredBodySize(request, maxBytes);
  const declaredBytes = getDeclaredBytes(request);
  if (declaredBytes === null) throw new CanvasAssetStorageError('素材大小声明无效', 400);
  if (!request.body || request.bodyUsed) throw new CanvasAssetStorageError('缺少素材文件', 400);

  return saveCanvasAssetStream(userId, request.body, {
    declaredBytes,
    signal: request.signal,
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get('content-length')) {
      return NextResponse.json({ error: '上传请求必须声明文件大小' }, { status: 411 });
    }

    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-asset-upload', { limit: 12, windowMs: 60_000 });
    const asset = await saveRequestAsset(request, user.id);
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
    if (error instanceof CanvasAssetStorageError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }

    return NextResponse.json({ error: '素材保存失败' }, { status: 500 });
  }
}
