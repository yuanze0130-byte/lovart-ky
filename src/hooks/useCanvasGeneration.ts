import { resolveImageReference, groupNewImageEdits } from '@/lib/image-versions';
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement, GenerationMetadata } from '@/components/lovart/CanvasArea';
import type { CanvasPan } from '@/hooks/useCanvasViewport';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { authedFetch } from '@/lib/authed-fetch';
import { resolveConnectedInputs } from '@/lib/canvas-connections';
import { getImageModelDefinition, isImageModelId, type ImageModelId } from '@/lib/image-models';
import { addGenerationHistoryItem } from '@/lib/generation-history';
import { importRemoteCanvasVideo } from '@/lib/canvas-asset-upload';
import { optimizeCanvasImageAsset } from '@/lib/canvas-media-optimization';
import { uploadReferenceImages } from '@/lib/reference-image-upload';
import type { CanvasTaskLogUpdate } from '@/lib/canvas-task-log';
import { runQueuedImageRequest, ImageQueueCancelledError, type ImageQueueOptions } from '@/lib/image-request-queue';
import { imageGenerationContract, type ExpectedGenerationPrice } from '@/lib/generation-contract';
import { imageQueueKey, type ImageSubmission } from '@/lib/image-submission';

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

export type Resolution = '1K' | '2K' | '3K' | '4K';
export type AspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';

function isResolution(value: unknown): value is Resolution {
  return value === '1K' || value === '2K' || value === '4K';
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return value === 'auto' || value === '4:3' || value === '8:1' || value === '1:1' || value === '3:2' || value === '1:8' || value === '9:16' || value === '2:3' || value === '4:1' || value === '16:9' || value === '4:5' || value === '1:4' || value === '3:4' || value === '5:4' || value === '21:9';
}

interface UseCanvasGenerationParams {
  projectId?: string | null;
  owner?: string;
  pan: CanvasPan;
  elements: CanvasElement[];
  selectedIds: string[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveTool: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  onThumbnailGenerated?: (thumbnail: string) => void | Promise<void>;
  onTaskUpdate?: (update: CanvasTaskLogUpdate) => void;
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
    ...(getImageModelDefinition(modelVariant).transport === 'official-image-task'
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

export class ImageGenerationRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly billingState?: string, readonly outcome?: string) { super(message); this.name = 'ImageGenerationRequestError'; }
}

type ImageGenerationInput = {
  submission?: ImageSubmission;
  signal?: AbortSignal;
  onQueueState?: ImageQueueOptions['onState'];
  taskSource?: 'canvas-image' | 'chat' | 'table';
  requestId?: string;
  projectId?: string;
  expectedPrice?: ExpectedGenerationPrice;
  generatorId?: string;
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
};

export function requestImageGeneration(input: ImageGenerationInput) {
  const projectId = input.projectId || (typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search).get('id') || undefined);
  if (typeof window !== 'undefined' && !projectId) return Promise.reject(new Error('请等待项目显示“已保存”后再生成图片'));
  const requestId = input.requestId || uuidv4();
  const modelId = input.modelVariant || 'pro';
  // Capture the quote before waiting; a later catalog change must require a new confirmation.
  const current = imageGenerationContract(modelId, input.resolution, input.referenceImages?.length || 0).expectedPrice;
  const expectedPrice = { ...current, ...input.expectedPrice };
  const { signal, onQueueState, ...payload } = input;
  const key = imageQueueKey(projectId, requestId, input.generatorId, input.taskSource === 'table' || Boolean(input.submission));
  return runQueuedImageRequest(() => executeImageGeneration({ ...payload, requestId, projectId, expectedPrice }), {
    key, projectId, signal, onState: onQueueState,
    fingerprint: JSON.stringify({ ...payload, requestId: undefined, expectedPrice }),
  }).catch(error => {
    if (error instanceof ImageQueueCancelledError) throw new ImageGenerationRequestError(error.message, error.code, error.billingState, error.outcome);
    throw error;
  });
}

async function executeImageGeneration(input: ImageGenerationInput) {
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
  const requestId = input.requestId || uuidv4();
  generationMetadata.recoveryRequestId = requestId;
  const projectId = input.projectId || (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('id'));
  if (typeof window !== 'undefined' && !projectId) throw new Error('请等待项目显示“已保存”后再生成图片');
  const uploadedReferenceImages = await uploadReferenceImages(referenceImages);

  const response = await authedFetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId, projectId, generatorId: input.generatorId, taskSource: input.taskSource, submission: input.submission,
      expectedPrice: input.expectedPrice,
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
    throw new ImageGenerationRequestError(
      typeof data.details === 'string'
        ? data.details
        : typeof data.error === 'string'
          ? data.error
          : '生成失败',
      typeof data.code === 'string' ? data.code : undefined,
      typeof data.billingState === 'string' ? data.billingState : undefined,
      typeof data.outcome === 'string' ? data.outcome : undefined,
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
    sourceImageId:generatorElement.initialEditMode && generatorElement.initialEditMode!=='generate'?generatorElement.referenceImageId:undefined,
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
  projectId,
  owner,
  pan,
  elements,
  selectedIds,
  setElements: writeElements,
  setSelectedIds: writeSelectedIds,
  setActiveTool,
  setIsGenerating: writeGenerating,
  onThumbnailGenerated: writeThumbnail,
  onTaskUpdate: writeTask,
}: UseCanvasGenerationParams) {
  const scopeKey = `${owner || ''}:${projectId || ''}`;
  const scopeRef = useRef({ key: scopeKey, active: true, running: 0 });
  if (scopeRef.current.key !== scopeKey) scopeRef.current = { key: scopeKey, active: true, running: 0 };
  const scope = scopeRef.current;
  useEffect(() => { scope.active = true; writeGenerating(false); return () => { scope.active = false; }; }, [scope, writeGenerating]);
  const setElements = useCallback<Dispatch<SetStateAction<CanvasElement[]>>>(update => {
    if (scopeRef.current !== scope || !scope.active) return;
    writeElements(current => scopeRef.current !== scope || !scope.active ? current : groupNewImageEdits(current,typeof update === 'function' ? update(current) : update));
  }, [scope, writeElements]);
  const setSelectedIds = useCallback<Dispatch<SetStateAction<string[]>>>(update => {
    if (scopeRef.current === scope && scope.active) writeSelectedIds(update);
  }, [scope, writeSelectedIds]);
  const setIsGenerating = useCallback<Dispatch<SetStateAction<boolean>>>(update => {
    if (scopeRef.current !== scope || !scope.active) return;
    const value = typeof update === 'function' ? update(scope.running > 0) : update;
    scope.running = Math.max(0, scope.running + (value ? 1 : -1));
    writeGenerating(scope.running > 0);
  }, [scope, writeGenerating]);
  const onTaskUpdate = useCallback((update: CanvasTaskLogUpdate) => {
    if (scopeRef.current === scope && scope.active) writeTask?.(update);
  }, [scope, writeTask]);
  const onThumbnailGenerated = useCallback(async (thumbnail: string) => {
    if (scopeRef.current === scope && scope.active) await writeThumbnail?.(thumbnail);
  }, [scope, writeThumbnail]);
  const handleGenerateVideo = useCallback(
    async (videoUrl: string, targetElementId?: string) => {
      const persistedVideoUrl = await importRemoteCanvasVideo(videoUrl);
      const targetedGenerator = targetElementId
        ? elements.find((el) => el.id === targetElementId && el.type === 'video-generator')
        : undefined;
      const generatorElement = targetedGenerator || selectedIds
        .map((id) => elements.find((el) => el.id === id))
        .find((el) => el?.type === 'video-generator');

      if (generatorElement) {
        void addGenerationHistoryItem({
 origin: {ownerId:owner,projectId:projectId || undefined},
          id: uuidv4(),
          kind: 'video',
          content: persistedVideoUrl,
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
                content: persistedVideoUrl,
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
          content: persistedVideoUrl,
        };
        setElements((prev) => [...prev, newElement]);
        setSelectedIds([newElement.id]);
        void addGenerationHistoryItem({
 origin: {ownerId:owner,projectId:projectId || undefined},
          id: resultId,
          kind: 'video',
          content: persistedVideoUrl,
          createdAt: new Date().toISOString(),
          width: 400,
          height: 300,
        });
      }
    },
    [elements, pan.x, pan.y, selectedIds, setElements, setSelectedIds, owner, projectId]
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
      submission?: ImageSubmission,
    ) => {
      if (scopeRef.current !== scope || !scope.active) return;
      setIsGenerating(true);
      const logEntryId = uuidv4();
      let logNodeId = targetElementId;
      try {
        const generatorElementId = targetElementId && elements.some((el) => el.id === targetElementId && el.type === 'image-generator')
          ? targetElementId
          : selectedIds.find((id) => elements.find((el) => el.id === id)?.type === 'image-generator');
        logNodeId = generatorElementId || targetElementId;
        const connectedInputs = generatorElementId
          ? resolveConnectedInputs(generatorElementId, elements)
          : null;
        const effectivePrompt = connectedInputs?.prompt.trim() || prompt;
        const effectiveReferences = Array.from(new Set([
          ...(connectedInputs?.references || []),
          ...referenceImages,
        ].filter(Boolean)));
        onTaskUpdate?.({
          id: logEntryId,
          nodeId: logNodeId,
          kind: 'image',
          status: 'running',
          progress: 10,
          message: '图片任务准备中',
          model: modelVariant,
          promptPreview: effectivePrompt,
          referenceCount: effectiveReferences.length,
          referenceLabels: connectedInputs?.referenceLabels,
        });
        const result = await requestImageGeneration({
          submission,
          requestId: logEntryId,
          projectId: projectId || undefined,
          onQueueState: state => onTaskUpdate({ id: logEntryId, nodeId: logNodeId, kind: 'image',
            status: state === 'queued' ? 'queued' : state === 'cancelled' ? 'cancelled' : 'running',
            progress: 0, message: state === 'queued' ? '等待生成名额' : state === 'cancelled' ? '已取消排队，未扣费' : '正在准备生成请求' }),
          generatorId: generatorElementId,
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
        onTaskUpdate?.({
          id: logEntryId,
          nodeId: logNodeId,
          taskId: returnedTaskId,
          kind: 'image',
          status: 'running',
          progress: 85,
          message: '上游已返回，正在写入画布',
          provider: returnedProvider,
          model: returnedModel || returnedModelVariant,
        });

        if (imageData) {
          const optimized = await optimizeCanvasImageAsset(imageData).catch((error) => {
            console.warn('[canvas-media] 生成图片预览优化失败，继续使用原始图片', error);
            return undefined;
          });
          const persistedImage = optimized?.content || imageData;
          const dimensions = optimized
            ? { width: optimized.originalWidth, height: optimized.originalHeight }
            : await getImageDimensions(imageData);
          const displaySize = getSmartDisplaySize(dimensions);
          if (scopeRef.current !== scope || !scope.active) return;
          void onThumbnailGenerated?.(optimized?.thumbnailUrl || optimized?.previewUrl || persistedImage);

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
            if (!generatorElement) throw new Error('生成节点已不存在，无法写入结果');

            const imageResult: GeneratedImageResult = { ...result, imageData: persistedImage };
            const resultId = String(result.generationMetadata.recoveryRequestId || uuidv4());
            const connectorId = uuidv4();
            const resultElement: CanvasElement = {
              ...createGeneratedImageResultElement({
                generatorElement,
                result: imageResult,
                displaySize,
                resultId,
                connectorId,
              }),
              previewUrl: optimized?.previewUrl,
              thumbnailUrl: optimized?.thumbnailUrl,
            };
            const connectorElement = createGeneratedImageConnector(generatorElement, resultId, connectorId);
            void addGenerationHistoryItem({
 origin: {ownerId:owner,projectId:projectId || undefined},
              id: resultId,
              kind: 'image',
              content: persistedImage,
              previewUrl: optimized?.previewUrl,
              thumbnailUrl: optimized?.thumbnailUrl,
              prompt: finalPrompt,
              model: returnedModel || returnedModelVariant,
              createdAt: new Date().toISOString(),
              width: displaySize.originalWidth,
              height: displaySize.originalHeight,
              metadata: resultElement.generationMetadata,
            });

            setElements((prev) => {
              if (prev.some(element => element.id === resultId || element.generationMetadata?.recoveryRequestId === resultId)) return prev;
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
              content: persistedImage,
              previewUrl: optimized?.previewUrl,
              thumbnailUrl: optimized?.thumbnailUrl,
            };
            setElements((prev) => [...prev, newElement]);
            setSelectedIds([newElement.id]);
            void addGenerationHistoryItem({
 origin: {ownerId:owner,projectId:projectId || undefined},
              id: newElement.id,
              kind: 'image',
              content: persistedImage,
              previewUrl: optimized?.previewUrl,
              thumbnailUrl: optimized?.thumbnailUrl,
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
        } else {
          throw new Error('上游未返回可用的图片或文本结果');
        }
        onTaskUpdate?.({
          id: logEntryId,
          nodeId: logNodeId,
          taskId: returnedTaskId,
          kind: 'image',
          status: 'succeeded',
          progress: 100,
          message: imageData ? '图片生成完成' : '文本结果已写入画布',
          provider: returnedProvider,
          model: returnedModel || returnedModelVariant,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        onTaskUpdate?.({
          id: logEntryId,
          nodeId: logNodeId,
          kind: 'image',
          status: 'failed',
          progress: 0,
          message: '图片生成失败',
          model: modelVariant,
          error: message,
        });
        console.error('Generation failed:', error);
        throw error;
      } finally {
        setIsGenerating(false);
      }
    },
    [elements, onTaskUpdate, onThumbnailGenerated, pan.x, pan.y, selectedIds, setElements, setIsGenerating, setSelectedIds, projectId, scope, owner]
  );

  const handleGenerateSelectedImages = useCallback(
    async () => {
      if (scopeRef.current !== scope || !scope.active) return;
      const generatorElements = selectedIds
        .map((id) => elements.find((el) => el.id === id))
        .filter((el): el is CanvasElement => el?.type === 'image-generator');

      if (generatorElements.length === 0) return;

      setIsGenerating(true);
      try {
        const generatedIds: string[] = [];
        const results = await Promise.allSettled(
          generatorElements.map(async (generatorElement) => {
            const logEntryId = uuidv4();
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
              ? resolveImageReference(elements,generatorElement.referenceImageId,generatorElement.referenceImageVersionId)
              : undefined;
            const fallbackReferences = referenceElement?.type === 'image' && typeof referenceElement.content === 'string' && referenceElement.content
              ? [referenceElement.content]
              : [];
            const referenceImages = Array.from(new Set([
              ...connectedInputs.references,
              ...fallbackReferences,
            ].filter(Boolean)));
            const editMode = generatorElement.initialEditMode || 'generate';
            const modelVariant = isImageModelId(generatorElement.imageModelId) ? generatorElement.imageModelId : 'pro';
            onTaskUpdate?.({
              id: logEntryId,
              nodeId: generatorElement.id,
              kind: 'image',
              status: 'running',
              progress: 10,
              message: '批量图片任务已提交',
              model: modelVariant,
              promptPreview: prompt,
              referenceCount: referenceImages.length,
              referenceLabels: connectedInputs.referenceLabels,
            });

            try {
              const result = await requestImageGeneration({
                requestId: logEntryId,
                projectId: projectId || undefined,
                onQueueState: state => onTaskUpdate({ id: logEntryId, nodeId: generatorElement.id, kind: 'image',
                  status: state === 'queued' ? 'queued' : state === 'cancelled' ? 'cancelled' : 'running', progress: 0,
                  message: state === 'queued' ? '等待生成名额' : state === 'cancelled' ? '已取消排队，未扣费' : '正在准备生成请求' }),
                generatorId: generatorElement.id,
                prompt,
                resolution,
                aspectRatio,
                referenceImages,
                modelVariant,
                editMode,
                officialOptions: {
                  quality: generatorElement.officialQuality === 'high' || generatorElement.officialQuality === 'medium' || generatorElement.officialQuality === 'low' ? generatorElement.officialQuality : 'auto',
                  background: generatorElement.officialBackground === 'transparent' || generatorElement.officialBackground === 'opaque' ? generatorElement.officialBackground : 'auto',
                  outputFormat: generatorElement.officialOutputFormat === 'jpeg' || generatorElement.officialOutputFormat === 'webp' ? generatorElement.officialOutputFormat : 'png',
                  moderation: generatorElement.officialModeration === 'low' ? 'low' : 'auto',
                },
              });

              if (!result.imageData) {
                throw new Error(result.textResponse || '未返回图片');
              }

              const imageResult: GeneratedImageResult = { ...result, imageData: result.imageData };
              const dimensions = await getImageDimensions(imageResult.imageData);
              const displaySize = getSmartDisplaySize(dimensions);
              onTaskUpdate?.({
                id: logEntryId,
                nodeId: generatorElement.id,
                taskId: result.returnedTaskId,
                kind: 'image',
                status: 'succeeded',
                progress: 100,
                message: '批量图片生成完成',
                provider: result.returnedProvider,
                model: result.returnedModel || result.returnedModelVariant,
              });

              return {
                generatorElement,
                result: imageResult,
                displaySize,
              };
            } catch (error) {
              onTaskUpdate?.({
                id: logEntryId,
                nodeId: generatorElement.id,
                kind: 'image',
                status: 'failed',
                progress: 0,
                message: '批量图片生成失败',
                model: modelVariant,
                error: error instanceof Error ? error.message : '未知错误',
              });
              throw error;
            }
          })
        );

        if (scopeRef.current !== scope || !scope.active) return;
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
            resultId: String(item.result.generationMetadata.recoveryRequestId || uuidv4()),
            connectorId: uuidv4(),
          }));
          const resultMap = new Map(branchResults.map((item) => [item.generatorElement.id, item]));
          generatedIds.push(...branchResults.map((item) => item.resultId));
          branchResults.forEach((item) => {
            void addGenerationHistoryItem({
 origin: {ownerId:owner,projectId:projectId || undefined},
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
              if (!item || prev.some(element => element.id === item.resultId || element.generationMetadata?.recoveryRequestId === item.resultId)) return el;

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
          if (scopeRef.current === scope && scope.active) alert(`批量生成完成：成功 ${successfulResults.length} 个，失败 ${failedCount} 个。请查看控制台错误。`);
          results.forEach((result) => {
            if (result.status === 'rejected') console.error('Batch image generation failed:', result.reason);
          });
        }
      } catch (error) {
        console.error('Batch image generation failed:', error);
        if (scopeRef.current === scope && scope.active) alert(`批量生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsGenerating(false);
      }
    },
    [elements, onTaskUpdate, onThumbnailGenerated, selectedIds, setElements, setIsGenerating, setSelectedIds, projectId, scope, owner]
  );

  return {
    handleGenerateVideo,
    handleConnectFlow,
    handleGenerateFromImage,
    handleGenerateImage,
    handleGenerateSelectedImages,
  };
}
