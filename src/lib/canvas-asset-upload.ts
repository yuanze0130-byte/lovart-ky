'use client';

import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';

type AssetUploadResponse = {
  error?: string;
  kind?: 'image' | 'video';
  size?: number;
  url?: string;
};

export type RemoteCanvasAssetKind = 'image' | 'video';

function isInlineAsset(value: unknown) {
  return typeof value === 'string' && (
    /^data:(?:image|video)\/[\w.+-]+;base64,/i.test(value)
    || value.startsWith('blob:')
  );
}

export async function uploadCanvasAssetBlob(
  blob: Blob,
  fileName = 'canvas-asset',
  signal?: AbortSignal,
) {
  void fileName; // Kept for source compatibility; content hashes determine stored file names.
  const response = await authedFetch('/api/canvas-assets', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
    signal,
  });
  const result = (await response.json().catch(() => ({}))) as AssetUploadResponse;

  if (!response.ok || !result.url) {
    throw new Error(result.error || '素材保存到服务器失败');
  }

  return result.url;
}

export async function uploadInlineCanvasAsset(asset: string, signal?: AbortSignal) {
  if (!isInlineAsset(asset)) return asset;

  const blobResponse = await fetch(asset, { signal });
  if (!blobResponse.ok) throw new Error('无法读取画布素材');
  return uploadCanvasAssetBlob(await blobResponse.blob(), 'canvas-asset', signal);
}

export const uploadInlineCanvasImage = uploadInlineCanvasAsset;

function collectCanvasAssetUrls(value: unknown, urls: Set<string>) {
  if (typeof value === 'string') {
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/media/canvas/')) urls.add(value);
    } catch {
      // Ignore values that are not URLs.
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCanvasAssetUrls(entry, urls));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectCanvasAssetUrls(entry, urls));
  }
}

function replaceCanvasAssetUrls(value: unknown, signed: Record<string, string>): unknown {
  if (typeof value === 'string') return signed[value] || value;
  if (Array.isArray(value)) return value.map((entry) => replaceCanvasAssetUrls(entry, signed));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, replaceCanvasAssetUrls(entry, signed)]));
  }
  return value;
}

export async function refreshCanvasAssetUrls<T>(value: T): Promise<T> {
  const urls = new Set<string>();
  collectCanvasAssetUrls(value, urls);
  if (urls.size === 0) return value;
  const values = Array.from(urls);
  const signed: Record<string, string> = {};
  for (let offset = 0; offset < values.length; offset += 150) {
    const response = await authedFetch('/api/canvas-assets/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: values.slice(offset, offset + 150) }),
    });
    const result = await response.json().catch(() => ({})) as { signed?: Record<string, string> };
    if (!response.ok || !result.signed) throw new Error('无法刷新画布素材访问权限');
    Object.assign(signed, result.signed);
  }
  return replaceCanvasAssetUrls(value, signed) as T;
}

export function refreshCanvasElementAssetUrls(elements: CanvasElement[]) {
  return refreshCanvasAssetUrls(elements);
}

export async function importRemoteCanvasAsset(
  remoteUrl: string,
  kind: RemoteCanvasAssetKind = 'video',
  signal?: AbortSignal,
) {
  if (isInlineAsset(remoteUrl)) return uploadInlineCanvasAsset(remoteUrl, signal);
  if (remoteUrl.startsWith('/media/canvas/')) return remoteUrl;
  if (typeof window !== 'undefined') {
    try {
      const resolved = new URL(remoteUrl, window.location.origin);
      if (resolved.origin === window.location.origin && resolved.pathname.startsWith('/media/canvas/')) {
        return `${resolved.pathname}${resolved.search}`;
      }
    } catch {
      // The authenticated import endpoint returns the user-facing validation error.
    }
  }

  const response = await authedFetch('/api/canvas-assets/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: remoteUrl, kind }),
    signal,
  });
  const result = (await response.json().catch(() => ({}))) as AssetUploadResponse;

  if (!response.ok || !result.url) {
    throw new Error(result.error || '远程素材保存到服务器失败');
  }

  return result.url;
}

export function importRemoteCanvasVideo(remoteUrl: string, signal?: AbortSignal) {
  return importRemoteCanvasAsset(remoteUrl, 'video', signal);
}

async function persistValue(
  value: unknown,
  uploadCache: Map<string, Promise<string>>
): Promise<unknown> {
  if (typeof value === 'string' && isInlineAsset(value)) {
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
