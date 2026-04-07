import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

interface UseCanvasImageActionsParams {
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
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

  return {
    handleRemoveBackground,
  };
}
