import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';

interface UseCanvasElementsParams {
  pan: CanvasPan;
  elements: CanvasElement[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveTool: Dispatch<SetStateAction<string>>;
}

type ShapeType = 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right';

export function useCanvasElements({
  pan,
  elements,
  setElements,
  setSelectedIds,
  setActiveTool,
}: UseCanvasElementsParams) {
  const appendElement = useCallback(
    (element: CanvasElement) => {
      setElements((prev) => [...prev, element]);
      setSelectedIds([element.id]);
      setActiveTool('select');
    },
    [setActiveTool, setElements, setSelectedIds]
  );

  const handleAddImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        appendElement({
          id: uuidv4(),
          type: 'image',
          x: 100 - pan.x + elements.length * 20,
          y: 100 - pan.y + elements.length * 20,
          width: 300,
          height: 200,
          content: e.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    },
    [appendElement, elements.length, pan.x, pan.y]
  );

  const handleAddVideo = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        appendElement({
          id: uuidv4(),
          type: 'video',
          x: 100 - pan.x + elements.length * 20,
          y: 100 - pan.y + elements.length * 20,
          width: 400,
          height: 300,
          content: e.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    },
    [appendElement, elements.length, pan.x, pan.y]
  );

  const handleAddText = useCallback(() => {
    appendElement({
      id: uuidv4(),
      type: 'text',
      x: 200 - pan.x + elements.length * 20,
      y: 200 - pan.y + elements.length * 20,
      content: 'Double click to edit',
    });
  }, [appendElement, elements.length, pan.x, pan.y]);

  const handleAddShape = useCallback(
    (type: ShapeType) => {
      appendElement({
        id: uuidv4(),
        type: 'shape',
        shapeType: type,
        x: 300 - pan.x + elements.length * 20,
        y: 300 - pan.y + elements.length * 20,
        width: 150,
        height: 150,
        color: '#9CA3AF',
      });
    },
    [appendElement, elements.length, pan.x, pan.y]
  );

  const handleElementChange = useCallback(
    (id: string, newAttrs: Partial<CanvasElement>) => {
      setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...newAttrs } : el)));
    },
    [setElements]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setElements((prev) => prev.filter((el) => el.id !== id));
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    },
    [setElements, setSelectedIds]
  );

  const handleOpenImageGenerator = useCallback(() => {
    appendElement({
      id: uuidv4(),
      type: 'image-generator',
      x: 300 - pan.x + elements.length * 20,
      y: 300 - pan.y + elements.length * 20,
      width: 400,
      height: 400,
    });
  }, [appendElement, elements.length, pan.x, pan.y]);

  const handleOpenVideoGenerator = useCallback(() => {
    appendElement({
      id: uuidv4(),
      type: 'video-generator',
      x: 300 - pan.x + elements.length * 20,
      y: 300 - pan.y + elements.length * 20,
      width: 400,
      height: 300,
    });
  }, [appendElement, elements.length, pan.x, pan.y]);

  return {
    appendElement,
    handleAddImage,
    handleAddVideo,
    handleAddText,
    handleAddShape,
    handleElementChange,
    handleDelete,
    handleOpenImageGenerator,
    handleOpenVideoGenerator,
  };
}
