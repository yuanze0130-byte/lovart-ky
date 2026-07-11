import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { loadImageModelPreferences } from '@/lib/image-model-preferences';
import { getNodeDefinition } from '@/lib/node-definitions';

const IMAGE_GENERATOR_SIZE = getNodeDefinition('image-generator')?.defaultSize || { width: 400, height: 400 };
const VIDEO_GENERATOR_SIZE = getNodeDefinition('video-generator')?.defaultSize || { width: 400, height: 300 };
const IMAGE_COMPARE_SIZE = getNodeDefinition('image-compare')?.defaultSize || { width: 420, height: 300 };
const INPAINT_SIZE = getNodeDefinition('inpaint')?.defaultSize || { width: 440, height: 360 };

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
  const getNextWorkflowPosition = useCallback(() => {
    const nodeCount = elements.filter((element) => element.type !== 'connector').length;
    return {
      x: 160 - pan.x + (nodeCount % 2) * 520,
      y: 140 - pan.y + Math.floor(nodeCount / 2) * 440,
    };
  }, [elements, pan.x, pan.y]);

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
      id: uuidv4(),
      type: 'image-generator',
      ...getNextWorkflowPosition(),
      ...IMAGE_GENERATOR_SIZE,
      generatorKind: 'image',
      imageModelId: preferences.defaults.modelId,
      requestedResolution: preferences.defaults.resolution,
      requestedAspectRatio: preferences.defaults.aspectRatio as CanvasElement['requestedAspectRatio'],
      imageOutputCount: preferences.defaults.outputCount,
      imageExecutionMode: preferences.defaults.executionMode,
    };
  }, [getNextWorkflowPosition]);

  const createPanoramaGeneratorElement = useCallback((): CanvasElement => ({
    id: uuidv4(),
    type: 'image-generator',
    x: 300 - pan.x + elements.length * 20,
    y: 300 - pan.y + elements.length * 20,
    width: 520,
    height: 260,
    generatorKind: 'panorama',
    requestedAspectRatio: '21:9',
    requestedResolution: '2K',
    initialPrompt: '生成一张 720° 全景图，要求超宽横向构图、连续空间感、画面元素在左右两端自然衔接，并适合后续全景预览。',
  }), [elements.length, pan.x, pan.y]);

  const createVideoGeneratorElement = useCallback((): CanvasElement => ({
    id: uuidv4(),
    type: 'video-generator',
    x: 300 - pan.x + elements.length * 20,
    y: 300 - pan.y + elements.length * 20,
    ...VIDEO_GENERATOR_SIZE,
  }), [elements.length, pan.x, pan.y]);

  const createImageCompareElement = useCallback((): CanvasElement => ({
    id: uuidv4(),
    type: 'image-compare',
    x: 300 - pan.x + elements.length * 20,
    y: 300 - pan.y + elements.length * 20,
    ...IMAGE_COMPARE_SIZE,
    imageCompareSplit: 50,
    imageCompareSwapped: false,
  }), [elements.length, pan.x, pan.y]);

  const createInpaintElement = useCallback((): CanvasElement => ({
    id: uuidv4(),
    type: 'inpaint',
    x: 300 - pan.x + elements.length * 20,
    y: 300 - pan.y + elements.length * 20,
    ...INPAINT_SIZE,
    inpaintBrushSize: 32,
    inpaintFeather: 4,
  }), [elements.length, pan.x, pan.y]);

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
    handleOpenInpaint,
    createImageGeneratorElement,
    createPanoramaGeneratorElement,
    createVideoGeneratorElement,
    createImageCompareElement,
    createInpaintElement,
  };
}
