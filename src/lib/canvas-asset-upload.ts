'use client';

import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';

type AssetUploadResponse = {
  error?: string;
  url?: string;
};

function isInlineAsset(value: unknown): value is string {
  return typeof value === 'string' && /^data:(?:image|video)\/[\w.+-]+;base64,/i.test(value);
}

export async function uploadInlineCanvasAsset(asset: string) {
  if (!isInlineAsset(asset)) return asset;

  const blobResponse = await fetch(asset);
  if (!blobResponse.ok) throw new Error('无法读取画布素材');

  const formData = new FormData();
  formData.set('file', await blobResponse.blob(), 'canvas-asset');

  const response = await authedFetch('/api/canvas-assets', {
    method: 'POST',
    body: formData,
  });
  const result = (await response.json().catch(() => ({}))) as AssetUploadResponse;

  if (!response.ok || !result.url) {
    throw new Error(result.error || '素材保存到服务器失败');
  }

  return result.url;
}

export const uploadInlineCanvasImage = uploadInlineCanvasAsset;

async function persistValue(
  value: unknown,
  uploadCache: Map<string, Promise<string>>
): Promise<unknown> {
  if (isInlineAsset(value)) {
    let upload = uploadCache.get(value);
    if (!upload) {
      upload = uploadInlineCanvasAsset(value);
      uploadCache.set(value, upload);
    }
    return upload;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const nextValues = [];
    for (const entry of value) {
      const nextEntry = await persistValue(entry, uploadCache);
      changed ||= nextEntry !== entry;
      nextValues.push(nextEntry);
    }
    return changed ? nextValues : value;
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const source = value as Record<string, unknown>;
    const nextValue: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(source)) {
      const nextEntry = await persistValue(entry, uploadCache);
      changed ||= nextEntry !== entry;
      nextValue[key] = nextEntry;
    }
    return changed ? nextValue : value;
  }

  return value;
}

export async function persistCanvasElementAssets(elements: CanvasElement[]) {
  const uploadCache = new Map<string, Promise<string>>();
  const persistedElements: CanvasElement[] = [];

  for (const element of elements) {
    persistedElements.push(await persistValue(element, uploadCache) as CanvasElement);
  }

  return persistedElements;
}
