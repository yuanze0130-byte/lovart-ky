export interface ExtractedVideoFrame {
  dataUrl: string;
  seconds: number;
  label: string;
  width: number;
  height: number;
}

function abortError() {
  return new DOMException('操作已取消', 'AbortError');
}

function waitForEvent(
  target: EventTarget,
  eventName: string,
  errorName: string,
  signal?: AbortSignal,
  timeoutMs = 20_000,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onComplete);
      target.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onComplete = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(errorName)); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${errorName}：等待超时`));
    }, timeoutMs);
    if (signal?.aborted) {
      cleanup();
      reject(abortError());
      return;
    }
    target.addEventListener(eventName, onComplete, { once: true });
    target.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, seconds: number, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  if (Math.abs(video.currentTime - seconds) < 0.02 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const ready = waitForEvent(video, 'seeked', '视频定位失败', signal);
  video.currentTime = seconds;
  await ready;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(video, 'loadeddata', '视频帧解码失败', signal);
  }
}

export async function extractVideoFrames(source: string, frameCount: number, signal?: AbortSignal): Promise<ExtractedVideoFrame[]> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持视频抽帧');
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  try {
    video.src = source;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEvent(video, 'loadedmetadata', '视频加载失败', signal);
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('无法读取视频时长');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForEvent(video, 'loadeddata', '视频首帧解码失败', signal);
    }

    const count = Math.max(1, Math.min(12, Math.round(frameCount)));
    const canvas = document.createElement('canvas');
    const naturalWidth = video.videoWidth || 1280;
    const naturalHeight = video.videoHeight || 720;
    const scale = Math.min(1, 960 / naturalWidth, 540 / naturalHeight);
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建抽帧画布');

    const frames: ExtractedVideoFrame[] = [];
    for (let index = 0; index < count; index += 1) {
      const seconds = count === 1 ? video.duration / 2 : (video.duration * index) / Math.max(1, count - 1);
      const safeSeconds = Math.min(Math.max(0, video.duration - 0.05), seconds);
      await seekVideo(video, safeSeconds, signal);
      if (signal?.aborted) throw abortError();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      } catch {
        throw new Error('该视频不允许跨域抽帧，请先将视频保存到画布资产');
      }
      frames.push({
        dataUrl,
        seconds: safeSeconds,
        label: `${safeSeconds.toFixed(1)}s`,
        width: canvas.width,
        height: canvas.height,
      });
    }

    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
