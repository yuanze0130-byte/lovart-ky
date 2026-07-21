import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement, GenerationMetadata } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { authedFetch } from '@/lib/authed-fetch';
import { resolveConnectedInputs } from '@/lib/canvas-connections';
import { isImageModelId, type ImageModelId } from '@/lib/image-models';
import { addGenerationHistoryItem } from '@/lib/generation-history';
import { uploadReferenceImages } from '@/lib/reference-image-upload';

export type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
type OfficialImageOptions = {
  quality?: 'auto' | 'high' | 'medium' | 'low';
  background?: 'auto' | 'transparent' | 'opaque';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  moderation?: 'auto' | 'low';
};

type RelightRequestPayload = {
  viewMode: 'perspective' | 'front';
  lightType?: 'main';
  presetDirection?: 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back';
  azimuth: number;
  elevation: number;
  intensity: number;
  color: string;
};

export type Resolution = '1K' | '2K' | '4K';
export type AspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';

function isResolution(value: unknown): value is Resolution {
  return value === '1K' || value === '2K' || value === '4K';
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return value === 'auto' || value === '4:3' || value === '8:1' || value === '1:1' || value === '3:2' || value === '1:8' || value === '9:16' || value === '2:3' || value === '4:1' || value === '16:9' || value === '4:5' || value === '1:4' || value === '3:4' || value === '5:4' || value === '21:9';
}

interface UseCanvasGenerationParams {
  pan: CanvasPan;
  elements: CanvasElement[];
  selectedIds: string[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveTool: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  onThumbnailGenerated?: (thumbnail: string) => void | Promise<void>;
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
  assetKind,
  resolution,
  aspectRatio,
  officialOptions,
}: {
  prompt: string;
  finalPrompt: string;
  promptPatch?: string;
  promptPresetId?: string;
  promptPresetLabel?: string;
  promptDebug?: string;
  editMode: ImageEditMode;
  modelVariant: ImageModelId;
  referenceCount: number;
  assetKind?: 'image' | 'panorama';
  resolution: Resolution;
  aspectRatio: AspectRatio;
  officialOptions?: OfficialImageOptions;
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
    assetKind,
    resolution,
    aspectRatio,
    ...(modelVariant === 'gpt-image-2-official'
      ? {
          officialQuality: officialOptions?.quality || 'auto',
          officialBackground: officialOptions?.background || 'auto',
          officialOutputFormat: officialOptions?.outputFormat || 'png',
          officialModeration: officialOptions?.moderation || 'auto',
        }
      : {}),
  };
}

async function readResponsePayload(response: Response): Promise<Record<string, unknown>> {
  const rawText = await response.text();

  if (!rawText) return {};

  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return {
      error: rawText,
      details: rawText,
      rawText,
    };
  }
}

export async function requestImageGeneration(input: {
  prompt: string;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  referenceImages?: string[];
  modelVariant?: ImageModelId;
  editMode?: ImageEditMode;
  promptPatch?: string;
  promptPresetId?: string;
  promptPresetLabel?: string;
  promptDebug?: string;
  officialOptions?: OfficialImageOptions;
  relight?: RelightRequestPayload;
}) {
  const {
    prompt,
    resolution,
    aspectRatio,
    referenceImages = [],
    modelVariant = 'pro',
    editMode = 'generate',
    promptPatch,
    promptPresetId,
    promptPresetLabel,
    promptDebug,
    officialOptions,
    relight,
  } = input;

  const finalPrompt = prompt;
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
    officialOptions,
  });
  const uploadedReferenceImages = await uploadReferenceImages(referenceImages);

  const response = await authedFetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: finalPrompt,
      resolution,
      aspectRatio,
      referenceImages: uploadedReferenceImages,
      modelVariant,
      editMode,
      officialOptions,
      relight,
    }),
  });

  const data = await readResponsePayload(response);

  if (!response.ok) {
    throw new Error(
      typeof data.details === 'string'
        ? data.details
        : typeof data.error === 'string'
          ? data.error
          : '生成失败'
    );
  }

  const imageData = typeof data.imageData === 'string' ? data.imageData : undefined;
  const textResponse = typeof data.textResponse === 'string' ? data.textResponse : undefined;
  const requestedAspectRatio = isAspectRatio(data.requestedAspectRatio)
    ? data.requestedAspectRatio
    : aspectRatio;
  const requestedResolution = isResolution(data.requestedResolution)
    ? data.requestedResolution
    : resolution;
  const returnedModelVariant = isImageModelId(data.modelVariant)
    ? data.modelVariant
    : modelVariant;
  const returnedProvider: 'official' | 'proxy' | undefined = data.provider === 'official' || data.provider === 'proxy'
    ? data.provider
    : undefined;
  const returnedProviderMode: 'official' | 'proxy' | 'auto' | undefined = data.providerMode === 'official' || data.providerMode === 'proxy' || data.providerMode === 'auto'
    ? data.providerMode
    : undefined;
  const providerFallbackUsed: boolean | undefined = typeof data.providerFallbackUsed === 'boolean'
    ? data.providerFallbackUsed
    : undefined;
  const fallbackFrom: 'official' | 'proxy' | undefined = data.fallbackFrom === 'official' || data.fallbackFrom === 'proxy'
    ? data.fallbackFrom
    : undefined;
  const fallbackReason: string | undefined = typeof data.fallbackReason === 'string'
    ? data.fallbackReason
    : undefined;
  const returnedModel: string | undefined = typeof data.model === 'string'
    ? data.model
    : undefined;
  const returnedTaskId: string | undefined = typeof data.taskId === 'string'
    ? data.taskId
    : undefined;
  const returnedProxyTarget: 'primary' | 'fallback' | undefined = data.proxyTarget === 'primary' || data.proxyTarget === 'fallback'
    ? data.proxyTarget
    : undefined;
  const returnedTaskStatus: string | undefined = typeof data.status === 'string'
    ? data.status
    : typeof data.taskStatus === 'string'
      ? data.taskStatus
      : undefined;
  const returnedTaskPollIntervalMs: number | undefined = typeof data.intervalMs === 'number'
    ? data.intervalMs
    : typeof data.taskPollIntervalMs === 'number'
      ? data.taskPollIntervalMs
      : undefined;
  const returnedTaskPollTimeoutMs: number | undefined = typeof data.timeoutMs === 'number'
    ? data.timeoutMs
    : typeof data.taskPollTimeoutMs === 'number'
      ? data.taskPollTimeoutMs
      : undefined;
  const returnedTaskPollAttemptCount: number | undefined = typeof data.attemptCount === 'number'
    ? data.attemptCount
    : typeof data.taskPollAttemptCount === 'number'
      ? data.taskPollAttemptCount
      : undefined;
  const returnedTaskDurationMs: number | undefined = typeof data.durationMs === 'number'
    ? data.durationMs
    : typeof data.taskDurationMs === 'number'
      ? data.taskDurationMs
      : undefined;
  const returnedTaskCompletedAt: string | undefined = typeof data.completedAt === 'string'
    ? data.completedAt
    : typeof data.taskCompletedAt === 'string'
      ? data.taskCompletedAt
      : undefined;
  const returnedTaskPayload = data.taskPayload && typeof data.taskPayload === 'object'
    ? data.taskPayload
    : undefined;

  return {
    imageData,
    textResponse,
    finalPrompt,
    generationMetadata,
    requestedAspectRatio,
    requestedResolution,
    returnedModelVariant,
    returnedProvider,
    returnedProviderMode,
    providerFallbackUsed,
    fallbackFrom,
    fallbackReason,
    returnedModel,
    returnedTaskId,
    returnedProxyTarget,
    returnedTaskStatus,
    returnedTaskPollIntervalMs,
    returnedTaskPollTimeoutMs,
    returnedTaskPollAttemptCount,
    returnedTaskDurationMs,
    returnedTaskCompletedAt,
    returnedTaskPayload,
    referenceImages,
    editMode,
  };
}

type ImageGenerationResult = Awaited<ReturnType<typeof requestImageGeneration>>;
type GeneratedImageResult = ImageGenerationResult & { imageData: string };
type GeneratedImageDisplaySize = ReturnType<typeof getSmartDisplaySize>;

function buildGeneratedImageMetadata(
  generatorElement: CanvasElement,
  result: GeneratedImageResult
): GenerationMetadata {
  return {
    ...result.generationMetadata,
    assetKind: generatorElement.generatorKind === 'panorama' ? 'panorama' : 'image',
    resolution: result.requestedResolution,
    aspectRatio: result.requestedAspectRatio,
    modelVariant: result.returnedModelVariant,
    provider: result.returnedProvider,
    providerMode: result.returnedProviderMode,
    providerFallbackUsed: result.providerFallbackUsed,
    fallbackFrom: result.fallbackFrom,
    fallbackReason: result.fallbackReason,
    model: result.returnedModel,
    taskId: result.returnedTaskId,
    proxyTarget: result.returnedProxyTarget,
    taskStatus: result.returnedTaskStatus,
    taskPollIntervalMs: result.returnedTaskPollIntervalMs,
    taskPollTimeoutMs: result.returnedTaskPollTimeoutMs,
    taskPollAttemptCount: result.returnedTaskPollAttemptCount,
    taskDurationMs: result.returnedTaskDurationMs,
    taskCompletedAt: result.returnedTaskCompletedAt,
    taskPayload: result.returnedTaskPayload as GenerationMetadata['taskPayload'],
    generatorElementId: generatorElement.id,
    generatorRunCount: getNextGenerationRunCount(generatorElement),
    generatedFromNode: true,
  };
}

function appendLinkedId(existing: CanvasElement['linkedElements'], ...ids: string[]) {
  return Array.from(new Set([
    ...(Array.isArray(existing) ? existing.filter((id): id is string => typeof id === 'string') : []),
    ...ids,
  ]));
}

function getNextGenerationRunCount(generatorElement: CanvasElement) {
  const currentCount = generatorElement.generationMetadata?.generationRunCount;
  return (typeof currentCount === 'number' ? currentCount : 0) + 1;
}

function updateGeneratorAfterImageRun(
  generatorElement: CanvasElement,
  result: GeneratedImageResult,
  resultId: string,
  connectorId: string
): CanvasElement {
  return {
    ...generatorElement,
    prompt: result.finalPrompt,
    initialPrompt: result.generationMetadata.sourcePrompt || result.finalPrompt,
    requestedAspectRatio: result.requestedAspectRatio,
    requestedResolution: result.requestedResolution,
    linkedElements: appendLinkedId(generatorElement.linkedElements, connectorId, resultId),
    generationMetadata: {
      ...(generatorElement.generationMetadata || {}),
      generationRunCount: getNextGenerationRunCount(generatorElement),
      lastResultElementId: resultId,
      lastConnectorElementId: connectorId,
      lastGeneratedAt: result.returnedTaskCompletedAt || new Date().toISOString(),
      lastGeneratedPrompt: result.finalPrompt,
      lastGeneratedModelVariant: result.returnedModelVariant,
      lastGeneratedProvider: result.returnedProvider,
      lastGeneratedTaskId: result.returnedTaskId,
    },
  };
}

function createGeneratedImageResultElement({
  generatorElement,
  result,
  displaySize,
  resultId,
  connectorId,
}: {
  generatorElement: CanvasElement;
  result: GeneratedImageResult;
  displaySize: GeneratedImageDisplaySize;
  resultId: string;
  connectorId: string;
}): CanvasElement {
  const sourceWidth = generatorElement.width || displaySize.width || 320;

  return {
    id: resultId,
    type: 'image',
    x: generatorElement.x + sourceWidth + 96,
    y: generatorElement.y,
    width: displaySize.width,
    height: displaySize.height,
    originalWidth: displaySize.originalWidth,
    originalHeight: displaySize.originalHeight,
    requestedAspectRatio: result.requestedAspectRatio,
    requestedResolution: result.requestedResolution,
    referenceImageId: generatorElement.referenceImageId,
    prompt: result.finalPrompt,
    generationMetadata: buildGeneratedImageMetadata(generatorElement, result),
    content: result.imageData,
    linkedElements: [generatorElement.id, connectorId],
  };
}

function createGeneratedImageConnector(
  generatorElement: CanvasElement,
  resultId: string,
  connectorId: string
): CanvasElement {
  return {
    id: connectorId,
    type: 'connector',
    x: 0,
    y: 0,
    connectorFrom: generatorElement.id,
    connectorTo: resultId,
    connectorSourcePort: 'image-out',
    connectorTargetPort: 'image-in',
    connectorDataKind: 'image',
    connectorKind: 'result',
    connectorOrder: 0,
    connectorStyle: 'dashed',
    color: '#8B5CF6',
    strokeWidth: 2,
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
  onThumbnailGenerated,
}: UseCanvasGenerationParams) {
  const handleGenerateVideo = useCallback(
    async (videoUrl: string, targetElementId?: string) => {
      const targetedGenerator = targetElementId
        ? elements.find((el) => el.id === targetElementId && el.type === 'video-generator')
        : undefined;
      const generatorElement = targetedGenerator || selectedIds
        .map((id) => elements.find((el) => el.id === id))
        .find((el) => el?.type === 'video-generator');

      if (generatorElement) {
        void addGenerationHistoryItem({
          id: uuidv4(),
          kind: 'video',
          content: videoUrl,
          prompt: generatorElement.prompt,
          model: generatorElement.videoModelMode,
          createdAt: new Date().toISOString(),
          width: generatorElement.originalWidth || generatorElement.width,
          height: generatorElement.originalHeight || generatorElement.height,
          metadata: generatorElement.generationMetadata,
        });
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
                videoModelMode: generatorElement.videoModelMode || el.videoModelMode,
                requestedAspectRatio: generatorElement.storyboardAspectRatio === '1:1'
                  ? '1:1'
                  : generatorElement.storyboardAspectRatio === '16:9' || generatorElement.storyboardAspectRatio === '21:9' || generatorElement.storyboardAspectRatio === '3:2'
                    ? '16:9'
                    : '4:3',
                prompt: generatorElement.prompt || el.prompt,
              };
            }
            return el;
          })
        );
      } else if (!targetElementId) {
        const resultId = uuidv4();
        const newElement: CanvasElement = {
          id: resultId,
          type: 'video',
          x: 300 - pan.x,
          y: 300 - pan.y,
          width: 400,
          height: 300,
          content: videoUrl,
        };
        setElements((prev) => [...prev, newElement]);
        setSelectedIds([newElement.id]);
        void addGenerationHistoryItem({
          id: resultId,
          kind: 'video',
          content: videoUrl,
          createdAt: new Date().toISOString(),
          width: 400,
          height: 300,
        });
      }
    },
    [elements, pan.x, pan.y, selectedIds, setElements, setSelectedIds]
  );

  const handleConnectFlow = useCallback(
    (sourceElement: CanvasElement) => {
      if (!sourceElement.content) return;

      const spacing = 120;
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
        linkedElements: [sourceElement.id, connectorId],
      };

      const connectorElement: CanvasElement = {
        id: connectorId,
        type: 'connector',
        x: 0,
        y: 0,
        connectorFrom: sourceElement.id,
        connectorTo: generatorId,
        connectorSourcePort: 'image-out',
        connectorTargetPort: 'reference-in',
        connectorDataKind: 'image',
        connectorKind: 'reference',
        connectorOrder: 0,
        connectorStyle: 'dashed',
        color: '#6B7280',
        strokeWidth: 2,
      };

      setElements((prev) => {
        const updatedPrev = prev.map((el) => {
          if (el.id === sourceElement.id) {
            return {
              ...el,
              linkedElements: Array.from(new Set([...(el.linkedElements || []), connectorId, generatorId])),
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
      modelVariant: ImageModelId = 'nano-banana-pro',
      editMode: ImageEditMode = 'generate',
      promptPatch?: string,
      promptPresetId?: string,
      promptPresetLabel?: string,
      promptDebug?: string,
      officialOptions?: OfficialImageOptions,
      targetElementId?: string,
    ) => {
      setIsGenerating(true);
      try {
        const generatorElementId = targetElementId && elements.some((el) => el.id === targetElementId && el.type === 'image-generator')
          ? targetElementId
          : selectedIds.find((id) => elements.find((el) => el.id === id)?.type === 'image-generator');
        const connectedInputs = generatorElementId
          ? resolveConnectedInputs(generatorElementId, elements)
          : null;
        const effectivePrompt = connectedInputs?.prompt.trim() || prompt;
        const effectiveReferences = Array.from(new Set([
          ...(connectedInputs?.references || []),
          ...referenceImages,
        ].filter(Boolean)));
        const result = await requestImageGeneration({
          prompt: effectivePrompt,
          resolution,
          aspectRatio,
          referenceImages: effectiveReferences,
          modelVariant,
          editMode,
          promptPatch,
          promptPresetId,
          promptPresetLabel,
          promptDebug,
          officialOptions,
        });

        const {
          imageData,
          textResponse,
          finalPrompt,
          generationMetadata,
          requestedAspectRatio,
          requestedResolution,
          returnedModelVariant,
          returnedProvider,
          returnedProviderMode,
          providerFallbackUsed,
          fallbackFrom,
          fallbackReason,
          returnedModel,
          returnedTaskId,
          returnedProxyTarget,
          returnedTaskStatus,
          returnedTaskPollIntervalMs,
          returnedTaskPollTimeoutMs,
          returnedTaskPollAttemptCount,
          returnedTaskDurationMs,
          returnedTaskCompletedAt,
          returnedTaskPayload,
        } = result;

        if (imageData) {
          const dimensions = await getImageDimensions(imageData);
          const displaySize = getSmartDisplaySize(dimensions);
          void onThumbnailGenerated?.(imageData);

          console.log('[generate-image] result', {
            requestedAspectRatio,
            requestedResolution,
            actualWidth: dimensions.width,
            actualHeight: dimensions.height,
            actualAspectRatio: `${dimensions.width}:${dimensions.height}`,
            provider: returnedProvider,
            providerMode: returnedProviderMode,
            providerFallbackUsed,
            model: returnedModel,
            modelVariant: returnedModelVariant,
            editMode,
            referenceCount: effectiveReferences.length,
          });

          if (generatorElementId) {
            const generatorElement = elements.find((el) => el.id === generatorElementId);
            if (!generatorElement) return;

            const imageResult: GeneratedImageResult = { ...result, imageData };
            const resultId = uuidv4();
            const connectorId = uuidv4();
            const resultElement = createGeneratedImageResultElement({
              generatorElement,
              result: imageResult,
              displaySize,
              resultId,
              connectorId,
            });
            const connectorElement = createGeneratedImageConnector(generatorElement, resultId, connectorId);
            void addGenerationHistoryItem({
              id: resultId,
              kind: 'image',
              content: imageData,
              prompt: finalPrompt,
              model: returnedModel || returnedModelVariant,
              createdAt: new Date().toISOString(),
              width: displaySize.originalWidth,
              height: displaySize.originalHeight,
              metadata: resultElement.generationMetadata,
            });

            setElements((prev) => {
              const outputIndex = prev.filter((element) => element.type === 'connector'
                && element.connectorFrom === generatorElementId
                && element.connectorKind === 'result').length;
              const outputColumn = Math.floor(outputIndex / 3);
              const outputRow = outputIndex % 3;
              const positionedResultElement: CanvasElement = {
                ...resultElement,
                x: generatorElement.x + (generatorElement.width || 320) + 96 + outputColumn * (displaySize.width + 40),
                y: generatorElement.y + outputRow * (displaySize.height + 32),
              };
              const orderedConnectorElement: CanvasElement = {
                ...connectorElement,
                connectorOrder: outputIndex,
              };
              let updatedGenerator = false;
              const nextElements = prev.map((el) => {
                if (el.id === generatorElementId) {
                  updatedGenerator = true;
                  return updateGeneratorAfterImageRun(el, imageResult, resultId, connectorId);
                }
                return el;
              });

              return updatedGenerator
                ? [...nextElements, orderedConnectorElement, positionedResultElement]
                : prev;
            });
            setSelectedIds([resultId]);
          } else if (!targetElementId) {
            const newElement: CanvasElement = {
              id: uuidv4(),
              type: 'image',
              x: 300 - pan.x,
              y: 300 - pan.y,
              width: displaySize.width,
              height: displaySize.height,
              originalWidth: displaySize.originalWidth,
              originalHeight: displaySize.originalHeight,
              requestedAspectRatio,
              requestedResolution,
              prompt: finalPrompt,
              generationMetadata: {
                ...generationMetadata,
                resolution: requestedResolution,
                aspectRatio: requestedAspectRatio,
                modelVariant: returnedModelVariant,
                provider: returnedProvider,
                providerMode: returnedProviderMode,
                providerFallbackUsed,
                fallbackFrom,
                fallbackReason,
                model: returnedModel,
                taskId: returnedTaskId,
                proxyTarget: returnedProxyTarget,
                taskStatus: returnedTaskStatus,
                taskPollIntervalMs: returnedTaskPollIntervalMs,
                taskPollTimeoutMs: returnedTaskPollTimeoutMs,
                taskPollAttemptCount: returnedTaskPollAttemptCount,
                taskDurationMs: returnedTaskDurationMs,
                taskCompletedAt: returnedTaskCompletedAt,
                taskPayload: returnedTaskPayload as GenerationMetadata['taskPayload'],
              },
              content: imageData,
            };
            setElements((prev) => [...prev, newElement]);
            setSelectedIds([newElement.id]);
            void addGenerationHistoryItem({
              id: newElement.id,
              kind: 'image',
              content: imageData,
              prompt: finalPrompt,
              model: returnedModel || returnedModelVariant,
              createdAt: new Date().toISOString(),
              width: displaySize.originalWidth,
              height: displaySize.originalHeight,
              metadata: newElement.generationMetadata,
            });
          }
        } else if (textResponse) {
          const newElement: CanvasElement = {
            id: uuidv4(),
            type: 'text',
            x: 300 - pan.x,
            y: 300 - pan.y,
            content: textResponse,
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
    [elements, onThumbnailGenerated, pan.x, pan.y, selectedIds, setElements, setIsGenerating, setSelectedIds]
  );

  const handleGenerateSelectedImages = useCallback(
    async () => {
      const generatorElements = selectedIds
        .map((id) => elements.find((el) => el.id === id))
        .filter((el): el is CanvasElement => el?.type === 'image-generator');

      if (generatorElements.length === 0) return;

      setIsGenerating(true);
      try {
        const generatedIds: string[] = [];
        const results = await Promise.allSettled(
          generatorElements.map(async (generatorElement) => {
            const connectedInputs = resolveConnectedInputs(generatorElement.id, elements);
            const fallbackPrompt = typeof generatorElement.initialPrompt === 'string' && generatorElement.initialPrompt.trim()
              ? generatorElement.initialPrompt.trim()
              : typeof generatorElement.prompt === 'string' && generatorElement.prompt.trim()
                ? generatorElement.prompt.trim()
                : generatorElement.generatorKind === 'panorama'
                  ? '生成一张 720° 全景图，要求超宽横向构图、连续空间感、左右两端自然衔接。'
                  : '生成一张高质量图片。';
            const prompt = connectedInputs.prompt.trim() || fallbackPrompt;
            const resolution = isResolution(generatorElement.requestedResolution) ? generatorElement.requestedResolution : generatorElement.generatorKind === 'panorama' ? '2K' : '1K';
            const aspectRatio = isAspectRatio(generatorElement.requestedAspectRatio) ? generatorElement.requestedAspectRatio : generatorElement.generatorKind === 'panorama' ? '21:9' : 'auto';
            const referenceElement = generatorElement.referenceImageId
              ? elements.find((item) => item.id === generatorElement.referenceImageId)
              : undefined;
            const fallbackReferences = referenceElement?.type === 'image' && typeof referenceElement.content === 'string' && referenceElement.content
              ? [referenceElement.content]
              : [];
            const referenceImages = Array.from(new Set([
              ...connectedInputs.references,
              ...fallbackReferences,
            ].filter(Boolean)));
            const editMode = generatorElement.initialEditMode || 'generate';

            const result = await requestImageGeneration({
              prompt,
              resolution,
              aspectRatio,
              referenceImages,
              modelVariant: 'pro',
              editMode,
            });

            if (!result.imageData) {
              throw new Error(result.textResponse || '未返回图片');
            }

            const imageResult: GeneratedImageResult = { ...result, imageData: result.imageData };
            const dimensions = await getImageDimensions(imageResult.imageData);
            const displaySize = getSmartDisplaySize(dimensions);

            return {
              generatorElement,
              result: imageResult,
              displaySize,
            };
          })
        );

        const successfulResults = results
          .filter((result): result is PromiseFulfilledResult<{
            generatorElement: CanvasElement;
            result: GeneratedImageResult;
            displaySize: ReturnType<typeof getSmartDisplaySize>;
          }> => result.status === 'fulfilled')
          .map((result) => result.value);

        if (successfulResults.length > 0) {
          const branchResults = successfulResults.map((item) => ({
            ...item,
            resultId: uuidv4(),
            connectorId: uuidv4(),
          }));
          const resultMap = new Map(branchResults.map((item) => [item.generatorElement.id, item]));
          generatedIds.push(...branchResults.map((item) => item.resultId));
          branchResults.forEach((item) => {
            void addGenerationHistoryItem({
              id: item.resultId,
              kind: 'image',
              content: item.result.imageData,
              prompt: item.result.finalPrompt,
              model: item.result.returnedModel || item.result.returnedModelVariant,
              createdAt: new Date().toISOString(),
              width: item.displaySize.originalWidth,
              height: item.displaySize.originalHeight,
              metadata: item.result.generationMetadata,
            });
          });

          setElements((prev) => {
            const elementsToAdd: CanvasElement[] = [];
            const nextElements = prev.map((el) => {
              const item = resultMap.get(el.id);
              if (!item) return el;

              const resultElement = createGeneratedImageResultElement({
                generatorElement: el,
                result: item.result,
                displaySize: item.displaySize,
                resultId: item.resultId,
                connectorId: item.connectorId,
              });
              const connectorElement = createGeneratedImageConnector(el, item.resultId, item.connectorId);

              elementsToAdd.push(connectorElement, resultElement);
              void onThumbnailGenerated?.(item.result.imageData);

              return updateGeneratorAfterImageRun(el, item.result, item.resultId, item.connectorId);
            });

            return [...nextElements, ...elementsToAdd];
          });
          setSelectedIds(generatedIds);
        }

        const failedCount = results.filter((result) => result.status === 'rejected').length;
        if (failedCount > 0) {
          alert(`批量生成完成：成功 ${successfulResults.length} 个，失败 ${failedCount} 个。请查看控制台错误。`);
          results.forEach((result) => {
            if (result.status === 'rejected') console.error('Batch image generation failed:', result.reason);
          });
        }
      } catch (error) {
        console.error('Batch image generation failed:', error);
        alert(`批量生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsGenerating(false);
      }
    },
    [elements, onThumbnailGenerated, selectedIds, setElements, setIsGenerating, setSelectedIds]
  );

  return {
    handleGenerateVideo,
    handleConnectFlow,
    handleGenerateFromImage,
    handleGenerateImage,
    handleGenerateSelectedImages,
  };
}
