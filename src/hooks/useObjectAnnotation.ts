import { useCallback, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { AnnotationObject as DetectedObject } from '@/lib/object-annotation';

export function useObjectAnnotation() {
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  const [hoveredObject, setHoveredObject] = useState<DetectedObject | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isAnnotationMode = Boolean(activeImageId);

  const enterAnnotationMode = useCallback((element: CanvasElement) => {
    if (element.type !== 'image' || !element.content) return;
    setActiveImageId(element.id);
    setSelectedObject(null);
    setHoveredObject(null);
  }, []);

  const exitAnnotationMode = useCallback(() => {
    setActiveImageId(null);
    setSelectedObject(null);
    setHoveredObject(null);
  }, []);

  const detectObject = useCallback(async (params: {
    image: CanvasElement;
    point: { x: number; y: number };
  }) => {
    setIsDetecting(true);
    try {
      const response = await authedFetch('/api/detect-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: params.image.content,
          imageWidth: params.image.width,
          imageHeight: params.image.height,
          click: params.point,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || '对象识别失败');
      }

      const detected = data.object as DetectedObject;
      setSelectedObject(detected);
      return detected;
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const editObject = useCallback(async (params: {
    image: CanvasElement;
    object: DetectedObject;
    prompt: string;
  }) => {
    setIsEditing(true);
    try {
      const response = await authedFetch('/api/edit-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: params.image.content,
          object: params.object,
          prompt: params.prompt,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || '对象编辑失败');
      }

      return data;
    } finally {
      setIsEditing(false);
    }
  }, []);

  return {
    activeImageId,
    hoveredObject,
    selectedObject,
    isAnnotationMode,
    isDetecting,
    isEditing,
    setHoveredObject,
    setSelectedObject,
    enterAnnotationMode,
    exitAnnotationMode,
    detectObject,
    editObject,
  };
}
