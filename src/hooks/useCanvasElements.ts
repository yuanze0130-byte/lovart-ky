import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { loadImageModelPreferences } from '@/lib/image-model-preferences';
import { getNodeDefaultState } from '@/lib/node-definitions';

interface UseCanvasElementsParams {
  pan: CanvasPan;
  scale: number;
  elements: CanvasElement[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveTool: Dispatch<SetStateAction<string>>;
}

type ShapeType = 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right';

export function useCanvasElements({
  pan,
  scale,
  elements,
  setElements,
  setSelectedIds,
  setActiveTool,
}: UseCanvasElementsParams) {
  const getNextWorkflowPosition = useCallback(() => {
    const nodeCount = elements.filter((element) => element.type !== 'connector').length;
    const cascadeIndex = nodeCount % 7;
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
    const screenX = Math.max(120, viewportWidth / 2 - 230) + cascadeIndex * 24;
    const screenY = Math.max(90, viewportHeight / 2 - 250) + cascadeIndex * 20;
    return {
      x: (screenX - pan.x) / scale,
      y: (screenY - pan.y) / scale,
    };
  }, [elements, pan.x, pan.y, scale]);

  const appendElement = useCallback(
    (element: CanvasElement) => {
      setElements((prev) => [...prev, element]);
      setSelectedIds([element.id]);
      setActiveTool('select');
    },
    [setActiveTool, setElements, setSelectedIds]
  );

  const handleAddImage = useCallback(
    (file: File, position?: { x: number; y: number }) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const dimensions = await getImageDimensions(content);
        const displaySize = getSmartDisplaySize(dimensions);

        appendElement({
          id: uuidv4(),
          type: 'image',
          x: position?.x ?? (100 - pan.x + elements.length * 20),
          y: position?.y ?? (100 - pan.y + elements.length * 20),
          width: displaySize.width,
          height: displaySize.height,
          originalWidth: displaySize.originalWidth,
          originalHeight: displaySize.originalHeight,
          content,
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
      width: 240,
      height: 100,
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

  const handleElementsChange = useCallback(
    (changes: Array<{ id: string; newAttrs: Partial<CanvasElement> }>) => {
      if (changes.length === 0) return;
      const changeMap = new Map(changes.map((change) => [change.id, change.newAttrs]));
      setElements((prev) => prev.map((el) => {
        const nextAttrs = changeMap.get(el.id);
        return nextAttrs ? { ...el, ...nextAttrs } : el;
      }));
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

  const handleDeleteMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setElements((prev) => prev.filter((el) => !idSet.has(el.id)));
      setSelectedIds((prev) => prev.filter((selectedId) => !idSet.has(selectedId)));
    },
    [setElements, setSelectedIds]
  );

  const createImageGeneratorElement = useCallback((): CanvasElement => {
    const preferences = loadImageModelPreferences();
    return {
      ...getNodeDefaultState('image-generator'),
      id: uuidv4(),
      type: 'image-generator',
      ...getNextWorkflowPosition(),
      imageModelId: preferences.defaults.modelId,
      requestedResolution: preferences.defaults.resolution,
      requestedAspectRatio: preferences.defaults.aspectRatio as CanvasElement['requestedAspectRatio'],
      imageOutputCount: preferences.defaults.outputCount,
      imageExecutionMode: preferences.defaults.executionMode,
    };
  }, [getNextWorkflowPosition]);

  const createPanoramaGeneratorElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('image-generator'),
    id: uuidv4(),
    type: 'image-generator',
    ...getNextWorkflowPosition(),
    width: 520,
    height: 260,
    generatorKind: 'panorama',
    requestedAspectRatio: '21:9',
    requestedResolution: '2K',
    initialPrompt: '生成一张 720° 全景图，要求超宽横向构图、连续空间感、画面元素在左右两端自然衔接，并适合后续全景预览。',
  }), [getNextWorkflowPosition]);

  const createVideoGeneratorElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('video-generator'),
    id: uuidv4(),
    type: 'video-generator',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createImageCompareElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('image-compare'),
    id: uuidv4(),
    type: 'image-compare',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createInpaintElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('inpaint'),
    id: uuidv4(),
    type: 'inpaint',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createGlobalViewElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('global-view'),
    id: uuidv4(),
    type: 'global-view',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createMotionTransferElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('motion-transfer'),
    id: uuidv4(),
    type: 'motion-transfer',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createTableEditorElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('table-editor'),
    id: uuidv4(),
    type: 'table-editor',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createVideoFramesElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('video-frames'),
    id: uuidv4(),
    type: 'video-frames',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createVideoBreakdownElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('video-breakdown'),
    id: uuidv4(),
    type: 'video-breakdown',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const createScriptWriterElement = useCallback((): CanvasElement => ({
    ...getNodeDefaultState('script-writer'),
    id: uuidv4(),
    type: 'script-writer',
    ...getNextWorkflowPosition(),
  }), [getNextWorkflowPosition]);

  const handleOpenImageGenerator = useCallback(() => {
    appendElement(createImageGeneratorElement());
  }, [appendElement, createImageGeneratorElement]);

  const handleOpenVideoGenerator = useCallback(() => {
    appendElement(createVideoGeneratorElement());
  }, [appendElement, createVideoGeneratorElement]);

  const handleOpenImageCompare = useCallback(() => {
    appendElement(createImageCompareElement());
  }, [appendElement, createImageCompareElement]);

  const handleOpenInpaint = useCallback(() => {
    appendElement(createInpaintElement());
  }, [appendElement, createInpaintElement]);

  const handleOpenGlobalView = useCallback(() => {
    appendElement(createGlobalViewElement());
  }, [appendElement, createGlobalViewElement]);

  const handleOpenMotionTransfer = useCallback(() => {
    appendElement(createMotionTransferElement());
  }, [appendElement, createMotionTransferElement]);

  const handleOpenTableEditor = useCallback(() => {
    appendElement(createTableEditorElement());
  }, [appendElement, createTableEditorElement]);

  const handleOpenVideoFrames = useCallback(() => {
    appendElement(createVideoFramesElement());
  }, [appendElement, createVideoFramesElement]);

  const handleOpenVideoBreakdown = useCallback(() => {
    appendElement(createVideoBreakdownElement());
  }, [appendElement, createVideoBreakdownElement]);

  const handleOpenScriptWriter = useCallback(() => {
    appendElement(createScriptWriterElement());
  }, [appendElement, createScriptWriterElement]);

  return {
    appendElement,
    handleAddImage,
    handleAddVideo,
    handleAddText,
    handleAddShape,
    handleElementChange,
    handleElementsChange,
    handleDelete,
    handleDeleteMany,
    handleOpenImageGenerator,
    handleOpenVideoGenerator,
    handleOpenImageCompare,
    handleOpenGlobalView,
    handleOpenMotionTransfer,
    handleOpenTableEditor,
    handleOpenVideoFrames,
    handleOpenVideoBreakdown,
    handleOpenScriptWriter,
    handleOpenInpaint,
    createImageGeneratorElement,
    createPanoramaGeneratorElement,
    createVideoGeneratorElement,
    createImageCompareElement,
    createGlobalViewElement,
    createMotionTransferElement,
    createTableEditorElement,
    createVideoFramesElement,
    createVideoBreakdownElement,
    createScriptWriterElement,
    createInpaintElement,
  };
}
