'use client';

import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';

type AssetUploadResponse = {
  error?: string;
  url?: string;
};

function isInlineImage(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/[\w.+-]+;base64,/i.test(value);
}

export async function uploadInlineCanvasImage(image: string) {
  if (!isInlineImage(image)) return image;

  const blobResponse = await fetch(image);
  if (!blobResponse.ok) throw new Error('无法读取画布图片');

  const formData = new FormData();
  formData.set('file', await blobResponse.blob(), 'canvas-image');

  const response = await authedFetch('/api/canvas-assets', {
    method: 'POST',
    body: formData,
  });
  const result = (await response.json().catch(() => ({}))) as AssetUploadResponse;

  if (!response.ok || !result.url) {
    throw new Error(result.error || '图片保存到服务器失败');
  }

  return result.url;
}

async function persistValue(
  value: unknown,
  uploadCache: Map<string, Promise<string>>
): Promise<unknown> {
  if (isInlineImage(value)) {
    let upload = uploadCache.get(value);
    if (!upload) {
      upload = uploadInlineCanvasImage(value);
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
