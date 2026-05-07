import { startTransition, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import {
  type ProjectAsset,
  type StoryboardAspectRatio,
  type StoryboardItem,
  type StoryboardLayoutMode,
  type StoryboardRenderProfile,
  type StoryboardVideoSize,
  formatStoryboardMeta,
  getPreferredStoryboardVideoSize,
  getRecommendedStoryboardLayout,
  getStoryboardAspectMeta,
  getStoryboardBoardMode,
  getStoryboardNodeDimensions,
  getStoryboardRenderProfile,
  getStoryboardSequenceHint,
  inferStoryboardAspectRatio,
  inferStoryboardAspectRatioFromVideoSize,
  normalizeStoryboardItems,
} from '@/hooks/useProjectAssets';

interface UseStoryboardManagerParams {
  projectId: string | null;
  elements: CanvasElement[];
  setElements: Dispatch<SetStateAction<CanvasElement[]>>;
  setSelectedIds?: Dispatch<SetStateAction<string[]>>;
  projectAssets: ProjectAsset[];
}

export function useStoryboardManager({
  projectId,
  elements,
  setElements,
  setSelectedIds,
  projectAssets,
}: UseStoryboardManagerParams) {
  const [storyboard, setStoryboard] = useState<StoryboardItem[]>([]);
  const [selectedStoryboardItemId, setSelectedStoryboardItemId] = useState<string | null>(null);
  const [storyboardLayout, setStoryboardLayout] = useState<StoryboardLayoutMode>('vertical');

  const storyboardStorageKey = useMemo(() => `lovart:storyboard:${projectId || 'draft'}`, [projectId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storyboardStorageKey);
      if (!raw) {
        startTransition(() => {
          setStoryboard([]);
          setStoryboardLayout('vertical');
          setSelectedStoryboardItemId(null);
        });
        return;
      }
      const parsed = JSON.parse(raw) as StoryboardItem[] | { items?: StoryboardItem[]; layout?: StoryboardLayoutMode };
      const normalizedStoryboard = normalizeStoryboardItems(Array.isArray(parsed) ? parsed : parsed.items || []);
      const nextLayout = Array.isArray(parsed) ? 'vertical' : parsed.layout || 'vertical';

      startTransition(() => {
        setStoryboard(normalizedStoryboard);
        setStoryboardLayout(nextLayout);
        setSelectedStoryboardItemId((currentSelectedId) => (
          currentSelectedId && normalizedStoryboard.some((item) => item.id === currentSelectedId)
            ? currentSelectedId
            : normalizedStoryboard[0]?.id ?? null
        ));
      });
    } catch {
      startTransition(() => {
        setStoryboard([]);
        setStoryboardLayout('vertical');
        setSelectedStoryboardItemId(null);
      });
    }
  }, [storyboardStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storyboardStorageKey, JSON.stringify({
      items: normalizeStoryboardItems(storyboard),
      layout: storyboardLayout,
    }));
  }, [storyboard, storyboardLayout, storyboardStorageKey]);

  const getStoryboardSequenceState = useCallback((index: number, total: number): 'single' | 'first' | 'middle' | 'last' => {
    if (total <= 1) return 'single';
    if (index === 0) return 'first';
    if (index === total - 1) return 'last';
    return 'middle';
  }, []);

  const pruneStoryboardForElements = useCallback((nextElements: CanvasElement[], removedIds: Set<string>) => {
    const removedStoryboardItemIds = new Set(
      storyboard
        .filter((item) => removedIds.has(item.elementId))
        .map((item) => item.id)
    );

    const cleanedElements = removedStoryboardItemIds.size > 0
      ? nextElements.filter((element) => !element.storyboardItemId || !removedStoryboardItemIds.has(element.storyboardItemId))
      : nextElements;

    const remainingElementIds = new Set(cleanedElements.map((element) => element.id));
    const fullyCleanedElements = cleanedElements
      .filter((element) => {
        if (element.type !== 'connector') return true;
        if (!element.connectorFrom || !element.connectorTo) return false;
        return remainingElementIds.has(element.connectorFrom) && remainingElementIds.has(element.connectorTo);
      })
      .map((element) => {
        const nextElement = { ...element };

        if (nextElement.referenceImageId && !remainingElementIds.has(nextElement.referenceImageId)) {
          delete nextElement.referenceImageId;
        }

        if (nextElement.linkedElements?.length) {
          const nextLinkedElements = nextElement.linkedElements.filter((linkedId) => remainingElementIds.has(linkedId));
          if (nextLinkedElements.length > 0) {
            nextElement.linkedElements = nextLinkedElements;
          } else {
            delete nextElement.linkedElements;
          }
        }

        return nextElement;
      });

    const finalRemainingElementIds = new Set(fullyCleanedElements.map((element) => element.id));

    setStoryboard((prev) => {
      const nextStoryboard = normalizeStoryboardItems(prev.filter((item) => !removedStoryboardItemIds.has(item.id) && finalRemainingElementIds.has(item.elementId)));

      setSelectedStoryboardItemId((currentSelectedId) => {
        if (currentSelectedId && nextStoryboard.some((item) => item.id === currentSelectedId)) {
          return currentSelectedId;
        }
        return nextStoryboard[0]?.id ?? null;
      });

      return nextStoryboard;
    });

    return fullyCleanedElements;
  }, [setStoryboard, storyboard]);

  const handleDeleteElement = useCallback((id: string) => {
    const removedIds = new Set([id]);
    setElements((prev) => {
      const nextElements = prev.filter((element) => element.id !== id);
      const cleanedElements = pruneStoryboardForElements(nextElements, removedIds);
      const remainingIds = new Set(cleanedElements.map((element) => element.id));
      setSelectedIds?.((prevSelectedIds) => prevSelectedIds.filter((selectedId) => remainingIds.has(selectedId)));
      return cleanedElements;
    });
  }, [pruneStoryboardForElements, setElements, setSelectedIds]);

  const handleDeleteElements = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setElements((prev) => {
      const nextElements = prev.filter((element) => !idSet.has(element.id));
      const cleanedElements = pruneStoryboardForElements(nextElements, idSet);
      const remainingIds = new Set(cleanedElements.map((element) => element.id));
      setSelectedIds?.((prevSelectedIds) => prevSelectedIds.filter((selectedId) => remainingIds.has(selectedId)));
      return cleanedElements;
    });
  }, [pruneStoryboardForElements, setElements, setSelectedIds]);

  const buildStoryboardLinkedElementPatch = useCallback((item: StoryboardItem, index: number, total: number, layout: StoryboardLayoutMode) => {
    const resolvedAspectRatio = item.aspectRatio ?? '9:16';
    const aspectMeta = getStoryboardAspectMeta(resolvedAspectRatio);
    const resolvedOutputSize = item.outputSize ?? aspectMeta.videoSize;
    const resolvedOrientation = item.orientation ?? aspectMeta.orientation;
    const resolvedRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(resolvedOutputSize);
    const sequenceState = getStoryboardSequenceState(index, total);
    const shotLabel = `Shot ${String(index + 1).padStart(2, '0')}`;

    return {
      storyboardShotLabel: shotLabel,
      storyboardTitle: item.title,
      storyboardMeta: formatStoryboardMeta(resolvedAspectRatio, item.durationSec ?? 5, resolvedRenderProfile),
      storyboardBrief: item.sourcePrompt,
      storyboardAspectRatio: resolvedAspectRatio,
      storyboardVideoSize: resolvedOutputSize,
      storyboardOrientation: resolvedOrientation,
      storyboardSourceAspectRatio: item.sourceAspectRatio ?? resolvedAspectRatio,
      storyboardSourceVideoSize: item.sourceOutputSize ?? resolvedOutputSize,
      storyboardSourceOrientation: item.sourceOrientation ?? resolvedOrientation,
      storyboardRenderProfile: resolvedRenderProfile,
      storyboardDurationSec: item.durationSec ?? 5,
      storyboardShotIndex: index + 1,
      storyboardShotCount: total,
      storyboardSequenceState: sequenceState,
      storyboardSequenceHint: getStoryboardSequenceHint(layout, sequenceState),
      storyboardBoardMode: getStoryboardBoardMode(layout, sequenceState),
    } satisfies Partial<CanvasElement>;
  }, [getStoryboardSequenceState]);

  const syncStoryboardNodeFrame = useCallback((element: CanvasElement, options: {
    aspectRatio: StoryboardAspectRatio;
    outputSize: StoryboardVideoSize;
    orientation?: ReturnType<typeof getStoryboardAspectMeta>['orientation'];
    renderProfile?: StoryboardRenderProfile;
  }): CanvasElement => {
    const aspectMeta = getStoryboardAspectMeta(options.aspectRatio);
    const nodeDimensions = getStoryboardNodeDimensions(options.outputSize, options.aspectRatio);
    const nextOrientation = options.orientation ?? aspectMeta.orientation;
    const nextRenderProfile = options.renderProfile ?? getStoryboardRenderProfile(options.outputSize);

    return {
      ...element,
      width: nodeDimensions.width,
      height: nodeDimensions.height,
      originalWidth: nodeDimensions.width,
      originalHeight: nodeDimensions.height,
      storyboardAspectRatio: options.aspectRatio,
      storyboardOrientation: nextOrientation,
      storyboardVideoSize: options.outputSize,
      storyboardRenderProfile: nextRenderProfile,
      storyboardMeta: formatStoryboardMeta(options.aspectRatio, element.storyboardDurationSec ?? 5, nextRenderProfile),
      content: element.type === 'video-generator' ? options.outputSize : element.content,
    };
  }, []);

  const syncStoryboardLinkedElements = useCallback((nextStoryboard: StoryboardItem[], layout: StoryboardLayoutMode, options?: { syncNodeFrame?: boolean }) => {
    const total = nextStoryboard.length;
    const patchMap = new Map(nextStoryboard.map((item, index) => [
      item.id,
      buildStoryboardLinkedElementPatch(item, index, total, layout),
    ]));

    setElements((prev) => prev.map((element) => {
      if (!element.storyboardItemId) return element;
      const patch = patchMap.get(element.storyboardItemId);
      if (!patch) return element;

      const nextElement = {
        ...element,
        ...patch,
      };

      if (options?.syncNodeFrame) {
        return syncStoryboardNodeFrame(nextElement, {
          aspectRatio: patch.storyboardAspectRatio ?? '9:16',
          orientation: patch.storyboardOrientation,
          outputSize: patch.storyboardVideoSize ?? getStoryboardAspectMeta(patch.storyboardAspectRatio ?? '9:16').videoSize,
          renderProfile: patch.storyboardRenderProfile,
        });
      }

      return nextElement;
    }));
  }, [buildStoryboardLinkedElementPatch, setElements, syncStoryboardNodeFrame]);

  const handleAddToStoryboard = useCallback((asset: ProjectAsset) => {
    let selectedItemId: string | null = null;

    setStoryboard((prev) => {
      if (prev.some((item) => item.assetId === asset.id)) {
        return prev;
      }
      const aspectRatio = asset.aspectRatio ?? inferStoryboardAspectRatio(asset.width, asset.height);
      const aspectMeta = getStoryboardAspectMeta(aspectRatio);
      selectedItemId = uuidv4();

      const nextStoryboard = normalizeStoryboardItems([
        ...prev,
        {
          id: selectedItemId,
          assetId: asset.id,
          elementId: asset.elementId,
          title: asset.title,
          type: asset.type,
          thumbnailUrl: asset.url,
          order: prev.length,
          sourcePrompt: asset.prompt,
          durationSec: 5,
          aspectRatio,
          orientation: asset.orientation ?? aspectMeta.orientation,
          outputSize: asset.outputSize ?? aspectMeta.videoSize,
          renderProfile: getStoryboardRenderProfile(asset.outputSize ?? aspectMeta.videoSize),
          sourceAspectRatio: asset.aspectRatio ?? aspectRatio,
          sourceOrientation: asset.orientation ?? aspectMeta.orientation,
          sourceOutputSize: asset.outputSize ?? aspectMeta.videoSize,
          createdAt: new Date().toISOString(),
        },
      ]);

      if (prev.length === 0) {
        setStoryboardLayout(getRecommendedStoryboardLayout(nextStoryboard));
      }

      return nextStoryboard;
    });

    if (selectedItemId) {
      setSelectedStoryboardItemId(selectedItemId);
    }
  }, []);

  const handleMoveStoryboardItem = useCallback((itemId: string, direction: 'up' | 'down') => {
    setStoryboard((prev) => {
      const index = prev.findIndex((item) => item.id === itemId);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      const normalized = normalizeStoryboardItems(next);
      syncStoryboardLinkedElements(normalized, storyboardLayout);
      return normalized;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleRemoveStoryboardItem = useCallback((itemId: string) => {
    setStoryboard((prev) => {
      const removedItem = prev.find((item) => item.id === itemId);
      const normalized = normalizeStoryboardItems(prev.filter((item) => item.id !== itemId));
      syncStoryboardLinkedElements(normalized, storyboardLayout);

      if (removedItem) {
        setElements((currentElements) => currentElements.filter((element) => element.storyboardItemId !== itemId));
      }

      setSelectedStoryboardItemId((currentSelectedId) => {
        if (currentSelectedId !== itemId) return currentSelectedId;
        return normalized[0]?.id ?? null;
      });

      return normalized;
    });
  }, [setElements, storyboardLayout, syncStoryboardLinkedElements]);

  const handleRenameStoryboardItem = useCallback((itemId: string, title: string) => {
    setStoryboard((prev) => {
      const next = prev.map((item) => item.id === itemId ? { ...item, title } : item);
      syncStoryboardLinkedElements(next, storyboardLayout);
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleUpdateStoryboardBrief = useCallback((itemId: string, brief: string) => {
    setStoryboard((prev) => {
      const next = prev.map((item) => item.id === itemId ? { ...item, sourcePrompt: brief } : item);
      syncStoryboardLinkedElements(next, storyboardLayout);
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleUpdateStoryboardDuration = useCallback((itemId: string, durationSec: number) => {
    const normalizedDuration = Number.isFinite(durationSec) ? Math.min(30, Math.max(1, durationSec)) : 5;
    setStoryboard((prev) => {
      const next = prev.map((item) => item.id === itemId ? { ...item, durationSec: normalizedDuration } : item);
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleUpdateAllStoryboardDurations = useCallback((durationSec: number) => {
    const normalizedDuration = Number.isFinite(durationSec) ? Math.min(30, Math.max(1, durationSec)) : 5;
    setStoryboard((prev) => {
      const next = prev.map((item) => ({ ...item, durationSec: normalizedDuration }));
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleUpdateStoryboardAspectRatio = useCallback((itemId: string, aspectRatio: StoryboardAspectRatio) => {
    const aspectMeta = getStoryboardAspectMeta(aspectRatio);
    setStoryboard((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const currentAspect = item.aspectRatio ?? '9:16';
      const currentOutputSize = item.outputSize ?? getStoryboardAspectMeta(currentAspect).videoSize;
      const currentRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(currentOutputSize);
      const inferredFromCurrentSize = inferStoryboardAspectRatioFromVideoSize(currentOutputSize);
      const shouldCarryOutputSize = inferredFromCurrentSize === aspectRatio;
      const nextOutputSize = shouldCarryOutputSize
        ? currentOutputSize
        : getPreferredStoryboardVideoSize(aspectRatio, currentRenderProfile);

      return {
        ...item,
        aspectRatio,
        orientation: aspectMeta.orientation,
        outputSize: nextOutputSize,
        renderProfile: getStoryboardRenderProfile(nextOutputSize),
      };
    }));

    setElements((prev) => prev.map((element) => {
      if (element.storyboardItemId !== itemId) return element;
      const currentOutputSize = element.storyboardVideoSize ?? element.content;
      const currentRenderProfile = element.storyboardRenderProfile ?? (typeof currentOutputSize === 'string' ? getStoryboardRenderProfile(currentOutputSize as StoryboardVideoSize) : 'standard');
      const inferredFromCurrentSize = inferStoryboardAspectRatioFromVideoSize(typeof currentOutputSize === 'string' ? currentOutputSize : undefined);
      const nextOutputSize = inferredFromCurrentSize === aspectRatio
        ? (typeof currentOutputSize === 'string' ? currentOutputSize as StoryboardVideoSize : getPreferredStoryboardVideoSize(aspectRatio, currentRenderProfile))
        : getPreferredStoryboardVideoSize(aspectRatio, currentRenderProfile);

      return syncStoryboardNodeFrame(element, {
        aspectRatio,
        orientation: aspectMeta.orientation,
        outputSize: nextOutputSize,
        renderProfile: getStoryboardRenderProfile(nextOutputSize),
      });
    }));
  }, [setElements, syncStoryboardNodeFrame]);

  const handleUpdateStoryboardOutputSize = useCallback((itemId: string, outputSize: StoryboardVideoSize) => {
    const aspectRatio = inferStoryboardAspectRatioFromVideoSize(outputSize) ?? '9:16';
    const aspectMeta = getStoryboardAspectMeta(aspectRatio);
    setStoryboard((prev) => prev.map((item) => item.id === itemId ? {
      ...item,
      aspectRatio,
      orientation: aspectMeta.orientation,
      outputSize,
      renderProfile: getStoryboardRenderProfile(outputSize),
    } : item));

    setElements((prev) => prev.map((element) => {
      if (element.storyboardItemId !== itemId) return element;
      return syncStoryboardNodeFrame(element, {
        aspectRatio,
        orientation: aspectMeta.orientation,
        outputSize,
        renderProfile: getStoryboardRenderProfile(outputSize),
      });
    }));
  }, [setElements, syncStoryboardNodeFrame]);

  const handleUpdateAllStoryboardRenderProfiles = useCallback((renderProfile: StoryboardRenderProfile) => {
    setStoryboard((prev) => {
      const next = prev.map((item) => {
        const aspectRatio = item.aspectRatio ?? '9:16';
        const aspectMeta = getStoryboardAspectMeta(aspectRatio);
        const outputSize = getPreferredStoryboardVideoSize(aspectRatio, renderProfile);
        return {
          ...item,
          aspectRatio,
          orientation: aspectMeta.orientation,
          outputSize,
          renderProfile: getStoryboardRenderProfile(outputSize),
        };
      });
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleNormalizeAllStoryboardOutputSizes = useCallback(() => {
    setStoryboard((prev) => {
      const next = prev.map((item) => {
        const aspectRatio = item.aspectRatio ?? '9:16';
        const aspectMeta = getStoryboardAspectMeta(aspectRatio);
        const currentOutputSize = item.outputSize ?? aspectMeta.videoSize;
        const preferredRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(currentOutputSize);
        const preferredOutputSize = getPreferredStoryboardVideoSize(aspectRatio, preferredRenderProfile);
        return {
          ...item,
          aspectRatio,
          orientation: aspectMeta.orientation,
          outputSize: preferredOutputSize,
          renderProfile: getStoryboardRenderProfile(preferredOutputSize),
        };
      });
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleApplyStoryboardBoardPreset = useCallback((preset: 'portrait-reels' | 'landscape-cinematic' | 'poster-stack' | 'square-social') => {
    const presetMap: Record<'portrait-reels' | 'landscape-cinematic' | 'poster-stack' | 'square-social', { aspectRatio: StoryboardAspectRatio; renderProfile: StoryboardRenderProfile; durationSec: number; layout: StoryboardLayoutMode }> = {
      'portrait-reels': { aspectRatio: '9:16', renderProfile: 'high', durationSec: 5, layout: 'vertical' },
      'landscape-cinematic': { aspectRatio: '16:9', renderProfile: 'high', durationSec: 8, layout: 'horizontal' },
      'poster-stack': { aspectRatio: '4:5', renderProfile: 'standard', durationSec: 6, layout: 'vertical' },
      'square-social': { aspectRatio: '1:1', renderProfile: 'standard', durationSec: 5, layout: 'vertical' },
    };

    const selectedPreset = presetMap[preset];
    const resolvedLayout = selectedPreset.layout;
    const aspectMeta = getStoryboardAspectMeta(selectedPreset.aspectRatio);

    setStoryboardLayout(resolvedLayout);
    setStoryboard((prev) => {
      const next = prev.map((item) => {
        const nextOutputSize = getPreferredStoryboardVideoSize(selectedPreset.aspectRatio, selectedPreset.renderProfile);
        return {
          ...item,
          aspectRatio: selectedPreset.aspectRatio,
          orientation: aspectMeta.orientation,
          outputSize: nextOutputSize,
          renderProfile: getStoryboardRenderProfile(nextOutputSize),
          durationSec: selectedPreset.durationSec,
        };
      });
      syncStoryboardLinkedElements(next, resolvedLayout, { syncNodeFrame: true });
      return next;
    });
  }, [syncStoryboardLinkedElements]);

  const handleAutoStoryboardLayout = useCallback(() => {
    const nextLayout = getRecommendedStoryboardLayout(storyboard);
    setStoryboardLayout(nextLayout);
    syncStoryboardLinkedElements(storyboard, nextLayout);
  }, [storyboard, syncStoryboardLinkedElements]);

  const resolveStoryboardAspectRatioFromAsset = useCallback((item: StoryboardItem) => {
    const asset = projectAssets.find((entry) => entry.id === item.assetId);
    if (asset?.aspectRatio) return asset.aspectRatio;
    if (asset?.outputSize) {
      const inferredFromAssetSize = inferStoryboardAspectRatioFromVideoSize(asset.outputSize);
      if (inferredFromAssetSize) return inferredFromAssetSize;
    }

    const source = elements.find((element) => element.id === item.elementId);
    if (source?.storyboardAspectRatio) return source.storyboardAspectRatio;
    if (source?.storyboardVideoSize) {
      const inferredFromNodeSize = inferStoryboardAspectRatioFromVideoSize(source.storyboardVideoSize);
      if (inferredFromNodeSize) return inferredFromNodeSize;
    }

    return inferStoryboardAspectRatio(source?.width, source?.height);
  }, [elements, projectAssets]);

  const handleResetStoryboardAspectRatioFromAsset = useCallback((itemId: string) => {
    let resolvedAspectRatioForNode: StoryboardAspectRatio = '9:16';
    let resolvedOutputSizeForNode: StoryboardVideoSize = getStoryboardAspectMeta('9:16').videoSize;
    let resolvedOrientationForNode = getStoryboardAspectMeta('9:16').orientation;

    setStoryboard((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const aspectRatio = resolveStoryboardAspectRatioFromAsset(item);
      const aspectMeta = getStoryboardAspectMeta(aspectRatio);
      resolvedAspectRatioForNode = aspectRatio;
      resolvedOutputSizeForNode = aspectMeta.videoSize;
      resolvedOrientationForNode = aspectMeta.orientation;
      const preferredRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? aspectMeta.videoSize);
      const preferredOutputSize = getPreferredStoryboardVideoSize(aspectRatio, preferredRenderProfile);
      resolvedOutputSizeForNode = preferredOutputSize;
      return {
        ...item,
        aspectRatio,
        orientation: aspectMeta.orientation,
        outputSize: preferredOutputSize,
        renderProfile: getStoryboardRenderProfile(preferredOutputSize),
        sourceAspectRatio: aspectRatio,
        sourceOrientation: aspectMeta.orientation,
        sourceOutputSize: preferredOutputSize,
      };
    }));

    setElements((prev) => prev.map((element) => {
      if (element.storyboardItemId !== itemId) return element;
      return {
        ...syncStoryboardNodeFrame(element, {
          aspectRatio: resolvedAspectRatioForNode,
          orientation: resolvedOrientationForNode,
          outputSize: resolvedOutputSizeForNode,
          renderProfile: getStoryboardRenderProfile(resolvedOutputSizeForNode),
        }),
        storyboardSourceAspectRatio: resolvedAspectRatioForNode,
        storyboardSourceOrientation: resolvedOrientationForNode,
        storyboardSourceVideoSize: resolvedOutputSizeForNode,
      };
    }));
  }, [resolveStoryboardAspectRatioFromAsset, setElements, syncStoryboardNodeFrame]);

  const handleUpdateAllStoryboardAspectRatios = useCallback((aspectRatio: StoryboardAspectRatio) => {
    const aspectMeta = getStoryboardAspectMeta(aspectRatio);
    setStoryboard((prev) => {
      const next = prev.map((item) => {
        const currentAspect = item.aspectRatio ?? '9:16';
        const currentOutputSize = item.outputSize ?? getStoryboardAspectMeta(currentAspect).videoSize;
        const currentRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(currentOutputSize);
        const inferredFromCurrentSize = inferStoryboardAspectRatioFromVideoSize(currentOutputSize);
        const nextOutputSize = inferredFromCurrentSize === aspectRatio
          ? currentOutputSize
          : getPreferredStoryboardVideoSize(aspectRatio, currentRenderProfile);
        return {
          ...item,
          aspectRatio,
          orientation: aspectMeta.orientation,
          outputSize: nextOutputSize,
          renderProfile: getStoryboardRenderProfile(nextOutputSize),
        };
      });
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [storyboardLayout, syncStoryboardLinkedElements]);

  const handleResetAllStoryboardAspectRatiosFromAssets = useCallback(() => {
    setStoryboard((prev) => {
      const next = prev.map((item) => {
        const aspectRatio = resolveStoryboardAspectRatioFromAsset(item);
        const aspectMeta = getStoryboardAspectMeta(aspectRatio);
        const preferredRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? aspectMeta.videoSize);
        const preferredOutputSize = getPreferredStoryboardVideoSize(aspectRatio, preferredRenderProfile);
        return {
          ...item,
          aspectRatio,
          orientation: aspectMeta.orientation,
          outputSize: preferredOutputSize,
          renderProfile: getStoryboardRenderProfile(preferredOutputSize),
          sourceAspectRatio: aspectRatio,
          sourceOrientation: aspectMeta.orientation,
          sourceOutputSize: preferredOutputSize,
        };
      });
      syncStoryboardLinkedElements(next, storyboardLayout, { syncNodeFrame: true });
      return next;
    });
  }, [resolveStoryboardAspectRatioFromAsset, storyboardLayout, syncStoryboardLinkedElements]);

  const handleStoryboardLayoutChange = useCallback((layout: StoryboardLayoutMode) => {
    setStoryboardLayout(layout);
    syncStoryboardLinkedElements(storyboard, layout);
  }, [storyboard, syncStoryboardLinkedElements]);

  const getStoryboardNodeSize = useCallback((aspectRatio: StoryboardAspectRatio = '9:16', outputSize?: StoryboardItem['outputSize']) => {
    const meta = getStoryboardAspectMeta(aspectRatio);
    const resolvedVideoSize = outputSize ?? meta.videoSize;
    const resolvedSize = getStoryboardNodeDimensions(resolvedVideoSize, aspectRatio);

    return {
      width: resolvedSize.width,
      height: resolvedSize.height,
      videoSize: resolvedVideoSize,
      orientation: meta.orientation,
      label: meta.label,
      shortLabel: meta.shortLabel,
      displaySize: `${resolvedSize.width} × ${resolvedSize.height}`,
      renderProfile: getStoryboardRenderProfile(resolvedVideoSize),
    };
  }, []);

  return {
    storyboard,
    setStoryboard,
    selectedStoryboardItemId,
    setSelectedStoryboardItemId,
    storyboardLayout,
    setStoryboardLayout,
    pruneStoryboardForElements,
    handleDeleteElement,
    handleDeleteElements,
    handleAddToStoryboard,
    handleMoveStoryboardItem,
    handleRemoveStoryboardItem,
    handleRenameStoryboardItem,
    handleUpdateStoryboardBrief,
    handleUpdateStoryboardDuration,
    handleUpdateAllStoryboardDurations,
    handleUpdateStoryboardAspectRatio,
    handleUpdateStoryboardOutputSize,
    handleUpdateAllStoryboardRenderProfiles,
    handleNormalizeAllStoryboardOutputSizes,
    handleApplyStoryboardBoardPreset,
    handleAutoStoryboardLayout,
    handleResetStoryboardAspectRatioFromAsset,
    handleUpdateAllStoryboardAspectRatios,
    handleResetAllStoryboardAspectRatiosFromAssets,
    handleStoryboardLayoutChange,
    resolveStoryboardAspectRatioFromAsset,
    syncStoryboardNodeFrame,
    syncStoryboardLinkedElements,
    buildStoryboardLinkedElementPatch,
    getStoryboardNodeSize,
  };
}
