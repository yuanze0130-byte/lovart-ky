import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { saveCanvasAsset } from '@/lib/canvas-asset-server';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
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

    const message = error instanceof Error ? error.message : '素材保存失败';
    const status = /素材文件为空|超过服务器允许|仅支持/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
