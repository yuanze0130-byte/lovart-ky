import { NextRequest, NextResponse } from 'next/server';
import {
  CanvasAssetImportError,
  importRemoteCanvasAsset,
} from '@/lib/canvas-asset-import-server';
import { enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';
import { RemoteAssetPolicyError } from '@/lib/canvas-asset-remote-policy';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import type { CanvasAssetKind } from '@/lib/canvas-asset-server';

export const runtime = 'nodejs';

const MAX_REQUEST_BODY_BYTES = 4 * 1024;

class ImportRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ImportRequestError';
    this.status = status;
  }
}

async function readImportRequest(request: NextRequest) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ImportRequestError('请求必须使用 JSON 格式');
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    throw new ImportRequestError('请求内容过大', 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ImportRequestError('缺少远程素材地址');

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      throw new ImportRequestError('请求内容过大', 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ImportRequestError('请求 JSON 无效');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ImportRequestError('请求 JSON 无效');
  }

  const { url, kind = 'video' } = body as { url?: unknown; kind?: unknown };
  if (typeof url !== 'string' || !url.trim()) {
    throw new ImportRequestError('缺少远程素材地址');
  }
  if (kind !== 'image' && kind !== 'video') {
    throw new ImportRequestError('素材类型必须是 image 或 video');
  }

  return { url: url.trim(), kind: kind as CanvasAssetKind };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-asset-import', { limit: 6, windowMs: 60_000 });
    const { url, kind } = await readImportRequest(request);
    const asset = await importRemoteCanvasAsset(user.id, url, kind, request.signal);
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    if (error instanceof ImportRequestError || error instanceof CanvasAssetImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof RemoteAssetPolicyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: '远程素材导入失败' }, { status: 500 });
  }
}
