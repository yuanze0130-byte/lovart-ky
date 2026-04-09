import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

interface UseCanvasImageActionsParams {
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
}

interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function cropImageWithCanvas(imageSrc: string, options: CropOptions) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，无法裁切'));
    img.src = imageSrc;
  });

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  const cropX = Math.min(Math.max(0, Math.round(options.x)), Math.max(0, naturalWidth - 1));
  const cropY = Math.min(Math.max(0, Math.round(options.y)), Math.max(0, naturalHeight - 1));
  const cropWidth = Math.min(Math.max(1, Math.round(options.width)), Math.max(1, naturalWidth - cropX));
  const cropHeight = Math.min(Math.max(1, Math.round(options.height)), Math.max(1, naturalHeight - cropY));

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('浏览器不支持裁切画布');
  }

  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return {
    imageData: canvas.toDataURL('image/png'),
    width: cropWidth,
    height: cropHeight,
  };
}

async function pollUpscaleTask(taskId: string, timeoutMs = 300000, pollIntervalMs = 3500) {
  const startedAt = Date.now();

  while (true) {
    const response = await fetch(`/api/upscale-status?taskId=${encodeURIComponent(taskId)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || data.error || '获取超分状态失败');
    }

    if (data.status === 'SUCCESS' && data.imageData) {
      return data.imageData as string;
    }

    if (data.status === 'FAILED') {
      throw new Error(data.details || data.error || '超分任务失败');
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('超分任务等待超时');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export function useCanvasImageActions({ setElements }: UseCanvasImageActionsParams) {
  const handleRemoveBackground = useCallback(
    async (element: CanvasElement) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const response = await fetch('/api/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: element.content }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || '去背景失败');
      }

      if (!data.imageData) {
        throw new Error('去背景结果为空');
      }

      setElements((prev) =>
        prev.map((item) =>
          item.id === element.id
            ? {
                ...item,
                content: data.imageData,
              }
            : item
        )
      );
    },
    [setElements]
  );

  const handleUpscale = useCallback(
    async (element: CanvasElement, scale = 2) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const response = await fetch('/api/upscale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: element.content, scale }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || '启动超分失败');
      }

      if (data.imageData) {
        setElements((prev) =>
          prev.map((item) =>
            item.id === element.id
              ? {
                  ...item,
                  content: data.imageData,
                }
              : item
          )
        );
        return;
      }

      if (!data.taskId) {
        throw new Error('超分任务未返回 taskId');
      }

      const imageData = await pollUpscaleTask(data.taskId);

      setElements((prev) =>
        prev.map((item) =>
          item.id === element.id
            ? {
                ...item,
                content: imageData,
              }
            : item
        )
      );
    },
    [setElements]
  );

  const handleCrop = useCallback(
    async (element: CanvasElement, options: CropOptions) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const cropped = await cropImageWithCanvas(element.content, options);

      setElements((prev) =>
        prev.map((item) =>
          item.id === element.id
            ? {
                ...item,
                content: cropped.imageData,
                width: cropped.width,
                height: cropped.height,
              }
            : item
        )
      );
    },
    [setElements]
  );

  return {
    handleRemoveBackground,
    handleUpscale,
    handleCrop,
  };
}
