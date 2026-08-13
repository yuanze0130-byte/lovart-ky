'use client';

import { importRemoteCanvasAsset, uploadCanvasAssetBlob } from '@/lib/canvas-asset-upload';

export const CANVAS_IMAGE_PREVIEW_MAX_EDGE = 1280;
export const CANVAS_IMAGE_THUMBNAIL_MAX_EDGE = 360;
export const CANVAS_VIDEO_POSTER_MAX_EDGE = 640;
const IMAGE_PREVIEW_QUALITY = 0.8;
const IMAGE_THUMBNAIL_QUALITY = 0.72;
const VIDEO_POSTER_QUALITY = 0.76;
const MEDIA_LOAD_TIMEOUT_MS = 20_000;

export interface OptimizedImageAsset {
  content: string;
  previewUrl: string;
  thumbnailUrl: string;
  originalWidth: number;
  originalHeight: number;
}

export interface OptimizedVideoAsset {
  content: string;
  posterUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
}

export function getContainedMediaSize(width: number, height: number, maxEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new Error('素材尺寸无效');
  }
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function fetchAssetBlob(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error('无法读取画布素材');
  return response.blob();
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('无法压缩素材预览')),
      'image/webp',
      quality,
    );
  });
}

async function decodeImage(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片解码失败'));
      image.src = objectUrl;
    });
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function createImageVariants(blob: Blob) {
  const decoded = await decodeImage(blob);
  try {
    const render = async (maxEdge: number, quality: number) => {
      const size = getContainedMediaSize(decoded.width, decoded.height, maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法创建图片预览');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.source, 0, 0, size.width, size.height);
      return canvasToBlob(canvas, quality);
    };

    const [preview, thumbnail] = await Promise.all([
      render(CANVAS_IMAGE_PREVIEW_MAX_EDGE, IMAGE_PREVIEW_QUALITY),
      render(CANVAS_IMAGE_THUMBNAIL_MAX_EDGE, IMAGE_THUMBNAIL_QUALITY),
    ]);
    return {
      preview,
      thumbnail,
      width: decoded.width,
      height: decoded.height,
    };
  } finally {
    decoded.dispose();
  }
}

export async function optimizeCanvasImageAsset(source: string): Promise<OptimizedImageAsset> {
  const inlineSource = source.startsWith('data:');
  const blobSource = source.startsWith('blob:');
  let content = source;
  if (!inlineSource && !blobSource) {
    try {
      content = await importRemoteCanvasAsset(source, 'image');
    } catch {
      // Existing same-origin/public images can still be resized directly in the browser.
    }
  }
  const sourceBlob = await fetchAssetBlob(content);
  const variants = await createImageVariants(sourceBlob);
  const originalPromise = inlineSource || blobSource
    ? uploadCanvasAssetBlob(sourceBlob, 'canvas-original')
    : Promise.resolve(content);
  const [persistedContent, previewUrl, thumbnailUrl] = await Promise.all([
    originalPromise,
    uploadCanvasAssetBlob(variants.preview, 'canvas-preview.webp'),
    uploadCanvasAssetBlob(variants.thumbnail, 'canvas-thumbnail.webp'),
  ]);
  return {
    content: persistedContent,
    previewUrl,
    thumbnailUrl,
    originalWidth: variants.width,
    originalHeight: variants.height,
  };
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: 'loadeddata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('视频封面生成超时'));
    }, MEDIA_LOAD_TIMEOUT_MS);
    const handleSuccess = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('视频无法解码'));
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
    };
    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function createVideoPoster(source: string) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = waitForVideoEvent(video, 'loadeddata');
    video.src = source;
    video.load();
    await loaded;
    if (Number.isFinite(video.duration) && video.duration > 0.2) {
      const targetTime = Math.min(0.2, video.duration / 10);
      const seeked = waitForVideoEvent(video, 'seeked');
      video.currentTime = targetTime;
      await seeked;
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('视频尺寸无效');
    const size = getContainedMediaSize(video.videoWidth, video.videoHeight, CANVAS_VIDEO_POSTER_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建视频封面');
    context.drawImage(video, 0, 0, size.width, size.height);
    return {
      blob: await canvasToBlob(canvas, VIDEO_POSTER_QUALITY),
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

export async function optimizeCanvasVideoAsset(source: string): Promise<OptimizedVideoAsset> {
  let content = source;
  if (source.startsWith('data:') || source.startsWith('blob:')) {
    content = await uploadCanvasAssetBlob(await fetchAssetBlob(source), 'canvas-video');
  } else {
    try {
      content = await importRemoteCanvasAsset(source, 'video');
    } catch {
      // Existing remote videos may remain usable even when they cannot be imported.
      content = source;
    }
  }
  const poster = await createVideoPoster(content);
  return {
    content,
    posterUrl: await uploadCanvasAssetBlob(poster.blob, 'canvas-video-poster.webp'),
    originalWidth: poster.width,
    originalHeight: poster.height,
  };
}
