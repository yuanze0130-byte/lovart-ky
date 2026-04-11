import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement, GenerationMetadata } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { authedFetch } from '@/lib/authed-fetch';

type BananaVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = '1:1' | '4:3' | '16:9';

interface UseCanvasGenerationParams {
  pan: CanvasPan;
  elements: CanvasElement[];
  selectedIds: string[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveTool: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

function buildGenerationMetadata({
  prompt,
  finalPrompt,
  promptPatch,
  promptPresetId,
  promptPresetLabel,
  promptDebug,
  editMode,
  modelVariant,
  referenceCount,
  resolution,
  aspectRatio,
}: {
  prompt: string;
  finalPrompt: string;
  promptPatch?: string;
  promptPresetId?: string;
  promptPresetLabel?: string;
  promptDebug?: string;
  editMode: ImageEditMode;
  modelVariant: BananaVariant;
  referenceCount: number;
  resolution: Resolution;
  aspectRatio: AspectRatio;
}): GenerationMetadata {
  return {
    sourcePrompt: prompt,
    finalPrompt,
    promptPatch,
    promptPresetId,
    promptPresetLabel,
    promptDebug,
    imageEditMode: editMode,
    modelVariant,
    referenceCount,
    resolution,
    aspectRatio,
  };
}

export function useCanvasGeneration({
  pan,
  elements,
  selectedIds,
  setElements,
  setSelectedIds,
  setActiveTool,
  setIsGenerating,
}: UseCanvasGenerationParams) {
  const handleGenerateVideo = useCallback(
    async (videoUrl: string) => {
      const generatorElement = selectedIds
        .map((id) => elements.find((el) => el.id === id))
        .find((el) => el?.type === 'video-generator');

      if (generatorElement) {
        setElements((prev) =>
          prev.map((el) => {
            if (el.id === generatorElement.id) {
              return {
                ...el,
                type: 'video',
                content: videoUrl,
                width: el.width || generatorElement.width || 400,
                height: el.height || generatorElement.height || 300,
                originalWidth: el.originalWidth || generatorElement.originalWidth || el.width || generatorElement.width || 400,
                originalHeight: el.originalHeight || generatorElement.originalHeight || el.height || generatorElement.height || 300,
                storyboardItemId: generatorElement.storyboardItemId || el.storyboardItemId,
                storyboardShotLabel: generatorElement.storyboardShotLabel || el.storyboardShotLabel,
                storyboardTitle: generatorElement.storyboardTitle || el.storyboardTitle,
                storyboardMeta: generatorElement.storyboardMeta || el.storyboardMeta,
                storyboardBrief: generatorElement.storyboardBrief || el.storyboardBrief,
                storyboardAspectRatio: generatorElement.storyboardAspectRatio || el.storyboardAspectRatio,
                storyboardVideoSize: generatorElement.storyboardVideoSize || el.storyboardVideoSize,
                storyboardOrientation: generatorElement.storyboardOrientation || el.storyboardOrientation,
                storyboardSourceAspectRatio: generatorElement.storyboardSourceAspectRatio || el.storyboardSourceAspectRatio,
                storyboardSourceVideoSize: generatorElement.storyboardSourceVideoSize || el.storyboardSourceVideoSize,
                storyboardSourceOrientation: generatorElement.storyboardSourceOrientation || el.storyboardSourceOrientation,
                storyboardRenderProfile: generatorElement.storyboardRenderProfile || el.storyboardRenderProfile,
                storyboardDurationSec: generatorElement.storyboardDurationSec || el.storyboardDurationSec,
                storyboardShotIndex: generatorElement.storyboardShotIndex || el.storyboardShotIndex,
                storyboardShotCount: generatorElement.storyboardShotCount || el.storyboardShotCount,
                storyboardSequenceState: generatorElement.storyboardSequenceState || el.storyboardSequenceState,
                storyboardSequenceHint: generatorElement.storyboardSequenceHint || el.storyboardSequenceHint,
                storyboardBoardMode: generatorElement.storyboardBoardMode || el.storyboardBoardMode,
                requestedAspectRatio: generatorElement.storyboardAspectRatio === '1:1'
                  ? '1:1'
                  : generatorElement.storyboardAspectRatio === '16:9'
                    ? '16:9'
                    : '4:3',
                prompt: generatorElement.prompt || el.prompt,
              };
            }
            return el;
          })
        );
      } else {
        const newElement: CanvasElement = {
          id: uuidv4(),
          type: 'video',
          x: 300 - pan.x,
          y: 300 - pan.y,
          width: 400,
          height: 300,
          content: videoUrl,
        };
        setElements((prev) => [...prev, newElement]);
        setSelectedIds([newElement.id]);
      }
    },
    [elements, pan.x, pan.y, selectedIds, setElements, setSelectedIds]
  );

  const handleConnectFlow = useCallback(
    (sourceElement: CanvasElement) => {
      if (!sourceElement.content) return;

      const spacing = 120;
      const groupId = uuidv4();
      const connectorId = uuidv4();
      const generatorId = uuidv4();

      const generatorElement: CanvasElement = {
        id: generatorId,
        type: 'image-generator',
        x: sourceElement.x + (sourceElement.width || 400) + spacing,
        y: sourceElement.y,
        width: sourceElement.width || 400,
        height: sourceElement.height || 400,
        referenceImageId: sourceElement.id,
        groupId,
        linkedElements: [sourceElement.id, connectorId],
      };

      const connectorElement: CanvasElement = {
        id: connectorId,
        type: 'connector',
        x: 0,
        y: 0,
        connectorFrom: sourceElement.id,
        connectorTo: generatorId,
        connectorStyle: 'dashed',
        color: '#6B7280',
        strokeWidth: 2,
        groupId,
      };

      setElements((prev) => {
        const updatedPrev = prev.map((el) => {
          if (el.id === sourceElement.id) {
            return {
              ...el,
              groupId,
              linkedElements: [connectorId, generatorId],
            };
          }
          return el;
        });
        return [...updatedPrev, connectorElement, generatorElement];
      });

      setSelectedIds([generatorId]);
      setActiveTool('select');
    },
    [setActiveTool, setElements, setSelectedIds]
  );

  const handleGenerateFromImage = useCallback(
    (sourceImage: CanvasElement) => {
      handleConnectFlow(sourceImage);
    },
    [handleConnectFlow]
  );

  const handleGenerateImage = useCallback(
    async (
      prompt: string,
      resolution: Resolution,
      aspectRatio: AspectRatio,
      referenceImages: string[] = [],
      modelVariant: BananaVariant = 'pro',
      editMode: ImageEditMode = 'generate',
      promptPatch?: string,
      promptPresetId?: string,
      promptPresetLabel?: string,
      promptDebug?: string
    ) => {
      setIsGenerating(true);
      try {
        const finalPrompt = promptPatch ? `${prompt}\n\n[编辑意图]\n${promptPatch}` : prompt;
        const generationMetadata = buildGenerationMetadata({
          prompt,
          finalPrompt,
          promptPatch,
          promptPresetId,
          promptPresetLabel,
          promptDebug,
          editMode,
          modelVariant,
          referenceCount: referenceImages.length,
          resolution,
          aspectRatio,
        });
        const primaryReference = referenceImages[0];

        const response = await authedFetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: finalPrompt,
            resolution,
            aspectRatio,
            referenceImage: primaryReference,
            referenceImages,
            modelVariant,
            editMode,
            mimeType: primaryReference ? 'image/jpeg' : undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || '生成失败');
        }

        const generatorElementId = selectedIds.find(
          (id) => elements.find((el) => el.id === id)?.type === 'image-generator'
        );

        if (data.imageData) {
          const dimensions = await getImageDimensions(data.imageData);
          const displaySize = getSmartDisplaySize(dimensions);

          console.log('[generate-image] result', {
            requestedAspectRatio: data.requestedAspectRatio || aspectRatio,
            requestedResolution: data.requestedResolution || resolution,
            actualWidth: dimensions.width,
            actualHeight: dimensions.height,
            actualAspectRatio: `${dimensions.width}:${dimensions.height}`,
            modelVariant: data.modelVariant || modelVariant,
            editMode,
            referenceCount: referenceImages.length,
          });

          if (generatorElementId) {
            setElements((prev) =>
              prev.map((el) => {
                if (el.id === generatorElementId) {
                  return {
                    ...el,
                    type: 'image',
                    content: data.imageData,
                    width: displaySize.width,
                    height: displaySize.height,
                    originalWidth: displaySize.originalWidth,
                    originalHeight: displaySize.originalHeight,
                    prompt: finalPrompt,
                    generationMetadata: {
                      ...generationMetadata,
                      resolution: data.requestedResolution || resolution,
                      aspectRatio: data.requestedAspectRatio || aspectRatio,
                    },
                    requestedAspectRatio: data.requestedAspectRatio || aspectRatio,
                    requestedResolution: data.requestedResolution || resolution,
                  };
                }
                return el;
              })
            );
          } else {
            const newElement: CanvasElement = {
              id: uuidv4(),
              type: 'image',
              x: 300 - pan.x,
              y: 300 - pan.y,
              width: displaySize.width,
              height: displaySize.height,
              originalWidth: displaySize.originalWidth,
              originalHeight: displaySize.originalHeight,
              requestedAspectRatio: data.requestedAspectRatio || aspectRatio,
              requestedResolution: data.requestedResolution || resolution,
              prompt: finalPrompt,
              generationMetadata: {
                ...generationMetadata,
                resolution: data.requestedResolution || resolution,
                aspectRatio: data.requestedAspectRatio || aspectRatio,
              },
              content: data.imageData,
            };
            setElements((prev) => [...prev, newElement]);
            setSelectedIds([newElement.id]);
          }
        } else if (data.textResponse) {
          const newElement: CanvasElement = {
            id: uuidv4(),
            type: 'text',
            x: 300 - pan.x,
            y: 300 - pan.y,
            content: data.textResponse,
          };
          setElements((prev) => [...prev, newElement]);
          setSelectedIds([newElement.id]);
        }
      } catch (error) {
        console.error('Generation failed:', error);
        alert(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsGenerating(false);
      }
    },
    [elements, pan.x, pan.y, selectedIds, setElements, setIsGenerating, setSelectedIds]
  );

  const handleAiChat = useCallback(
    async (prompt: string): Promise<string> => {
      setIsGenerating(true);
      try {
        const response = await fetch('/api/generate-design', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || '生成失败');
        }

        return data.suggestion || '未收到回复';
      } catch (error) {
        console.error('Chat generation failed:', error);
        throw error;
      } finally {
        setIsGenerating(false);
      }
    },
    [setIsGenerating]
  );

  return {
    handleGenerateVideo,
    handleConnectFlow,
    handleGenerateFromImage,
    handleGenerateImage,
    handleAiChat,
  };
}
