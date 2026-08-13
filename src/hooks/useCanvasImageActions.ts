import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { authedFetch } from '@/lib/authed-fetch';

interface UseCanvasImageActionsParams {
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
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

async function pollUpscaleTask(taskId: string, requestId?: string, timeoutMs = 300000, pollIntervalMs = 3500) {
  const startedAt = Date.now();

  while (true) {
    const query = new URLSearchParams({ taskId });
    if (requestId) query.set('requestId', requestId);
    const response = await authedFetch(`/api/upscale-status?${query.toString()}`);
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

type ImageActionKind = 'remove-background' | 'upscale' | 'crop';

interface ImageActionBranchInput {
  resultId: string;
  connectorId: string;
  source: CanvasElement;
  imageData: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  actionKind: ImageActionKind;
  actionLabel: string;
}

function appendImageActionBranch(prev: CanvasElement[], input: ImageActionBranchInput) {
  const sourceWidth = input.source.width || input.width || 320;

  const resultElement: CanvasElement = {
    id: input.resultId,
    type: 'image',
    x: input.source.x + sourceWidth + 96,
    y: input.source.y,
    width: input.width,
    height: input.height,
    originalWidth: input.originalWidth,
    originalHeight: input.originalHeight,
    requestedAspectRatio: input.source.requestedAspectRatio,
    requestedResolution: input.source.requestedResolution,
    prompt: input.source.prompt,
    content: input.imageData,
    previousContent: typeof input.source.content === 'string' ? input.source.content : undefined,
    linkedElements: [input.source.id, input.connectorId],
    generationMetadata: {
      ...(input.source.generationMetadata || {}),
      assetKind: input.source.generationMetadata?.assetKind || 'image',
      sourceElementId: input.source.id,
      imageActionKind: input.actionKind,
      imageActionLabel: input.actionLabel,
      branchedFromCanvasAction: true,
    },
  };

  const connectorElement: CanvasElement = {
    id: input.connectorId,
    type: 'connector',
    x: 0,
    y: 0,
    connectorFrom: input.source.id,
    connectorTo: input.resultId,
    connectorStyle: 'dashed',
    color: '#94A3B8',
    strokeWidth: 2,
  };

  return [...prev, connectorElement, resultElement];
}

export function useCanvasImageActions({ setElements, setSelectedIds }: UseCanvasImageActionsParams) {
  const handleRemoveBackground = useCallback(
    async (element: CanvasElement) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const response = await authedFetch('/api/remove-background', {
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

      const dimensions = await getImageDimensions(data.imageData);
      const displaySize = getSmartDisplaySize(dimensions);
      const resultId = uuidv4();
      const connectorId = uuidv4();

      setElements((prev) =>
        appendImageActionBranch(prev, {
          resultId,
          connectorId,
          source: element,
          imageData: data.imageData,
          width: displaySize.width,
          height: displaySize.height,
          originalWidth: displaySize.originalWidth,
          originalHeight: displaySize.originalHeight,
          actionKind: 'remove-background',
          actionLabel: '去背景',
        })
      );
      setSelectedIds([resultId]);
    },
    [setElements, setSelectedIds]
  );

  const handleUpscale = useCallback(
    async (element: CanvasElement, scale = 2) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const response = await authedFetch('/api/upscale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: element.content, scale }),
      });

      const data = await response.json();
      const recoveryTaskId = response.headers.get('X-Doodleverse-Recoverable-Task-Id');
      if (!response.ok && !recoveryTaskId) {
        throw new Error(data.details || data.error || '启动超分失败');
      }

      if (data.imageData) {
        const dimensions = await getImageDimensions(data.imageData);
        const displaySize = getSmartDisplaySize(dimensions);
        const resultId = uuidv4();
        const connectorId = uuidv4();

        setElements((prev) =>
          appendImageActionBranch(prev, {
            resultId,
            connectorId,
            source: element,
            imageData: data.imageData,
            width: displaySize.width,
            height: displaySize.height,
            originalWidth: displaySize.originalWidth,
            originalHeight: displaySize.originalHeight,
            actionKind: 'upscale',
            actionLabel: `${scale}x 超分`,
          })
        );
        setSelectedIds([resultId]);
        return;
      }

      const taskId = data.taskId || recoveryTaskId;
      if (!taskId) {
        throw new Error('超分任务未返回 taskId');
      }

      const imageData = await pollUpscaleTask(taskId, data.requestId);
      const dimensions = await getImageDimensions(imageData);
      const displaySize = getSmartDisplaySize(dimensions);
      const resultId = uuidv4();
      const connectorId = uuidv4();

      setElements((prev) =>
        appendImageActionBranch(prev, {
          resultId,
          connectorId,
          source: element,
          imageData,
          width: displaySize.width,
          height: displaySize.height,
          originalWidth: displaySize.originalWidth,
          originalHeight: displaySize.originalHeight,
          actionKind: 'upscale',
          actionLabel: `${scale}x 超分`,
        })
      );
      setSelectedIds([resultId]);
    },
    [setElements, setSelectedIds]
  );

  const handleCrop = useCallback(
    async (element: CanvasElement, options: CropOptions) => {
      if (!element.content) {
        throw new Error('当前元素没有图片内容');
      }

      const cropped = await cropImageWithCanvas(element.content, options);
      const resultId = uuidv4();
      const connectorId = uuidv4();

      setElements((prev) =>
        appendImageActionBranch(prev, {
          resultId,
          connectorId,
          source: element,
          imageData: cropped.imageData,
          width: cropped.width,
          height: cropped.height,
          originalWidth: cropped.width,
          originalHeight: cropped.height,
          actionKind: 'crop',
          actionLabel: '裁切',
        })
      );
      setSelectedIds([resultId]);
    },
    [setElements, setSelectedIds]
  );

  return {
    handleRemoveBackground,
    handleUpscale,
    handleCrop,
  };
}
