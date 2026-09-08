'use client';

import { importRemoteCanvasAsset, importRemoteCanvasVideo } from './canvas-asset-upload';
import { extractVideoFrames } from './video-frame-extraction';

async function resizeImage(source: string, signal: AbortSignal): Promise<string> {
  const url = source.startsWith('data:') || source.startsWith('blob:') ? source : await importRemoteCanvasAsset(source, 'image', signal);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; };
    const abort = () => { cleanup(); image.src = ''; reject(new DOMException('操作已取消', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); image.src = ''; reject(new Error('参考图片读取超时')); }, 20000);
    signal.addEventListener('abort', abort, { once: true });
    image.crossOrigin = 'anonymous';
    image.onerror = () => { cleanup(); reject(new Error('参考图片读取失败，请重新上传素材')); };
    image.onload = () => {
      try {
        signal.throwIfAborted();
        const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法处理参考图');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (error) { reject(error); } finally { cleanup(); }
    };
    image.src = url;
  });
}

export async function prepareCanvasAiMedia(images: string[], video: string | undefined, signal: AbortSignal) {
  if (images.length > (video ? 2 : 6)) throw new Error(video ? '连接视频时最多再连接 2 张图片' : '最多连接 6 张图片');
  const output: Array<{ dataUrl: string; label: string }> = [];
  for (const [index, source] of images.entries()) {
    output.push({ dataUrl: await resizeImage(source, signal), label: `参考图片 ${index + 1}` });
  }
  if (video) {
    const url = await importRemoteCanvasVideo(video, signal);
    const frames = await extractVideoFrames(url, 4, signal);
    for (const frame of frames) output.push({ dataUrl: await resizeImage(frame.dataUrl, signal), label: `视频关键帧 ${frame.label}（不含音频）` });
  }
  return output;
}
