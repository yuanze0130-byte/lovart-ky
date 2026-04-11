"use client";

import React, { useMemo, useState, useEffect, Suspense, useRef, useCallback, startTransition } from 'react';
import { Plus, Minus, ChevronDown, Sparkles, Cloud, CloudOff } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'next/navigation';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { CanvasArea, CanvasElement } from '@/components/lovart/CanvasArea';
import { ImageGeneratorPanel } from '@/components/lovart/ImageGeneratorPanel';
import { VideoGeneratorPanel } from '@/components/lovart/VideoGeneratorPanel';
import { AiDesignerPanel } from '@/components/lovart/AiDesignerPanel';
import { AssetsPanel } from '@/components/lovart/AssetsPanel';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useCanvasViewport } from '@/hooks/useCanvasViewport';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useCanvasElements } from '@/hooks/useCanvasElements';
import { useProjectAssets, type ProjectAsset, type StoryboardItem, type StoryboardAspectRatio, type StoryboardLayoutMode, type StoryboardVideoSize, type StoryboardRenderProfile, inferStoryboardAspectRatio, normalizeStoryboardItems, getStoryboardAspectMeta, inferStoryboardAspectRatioFromVideoSize, getStoryboardNodeDimensions, getStoryboardRenderProfile, getPreferredStoryboardVideoSize, getStoryboardRenderProfileLabel } from '@/hooks/useProjectAssets';
import { useCanvasGeneration } from '@/hooks/useCanvasGeneration';
import { useCanvasImageActions } from '@/hooks/useCanvasImageActions';
import { v4 as uuidv4 } from 'uuid';

function LovartCanvasContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('id');

    const { scale, pan, setPan, zoomIn, zoomOut, zoomTo } = useCanvasViewport();
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeTool, setActiveTool] = useState('select');
    const [title, setTitle] = useState('Untitled');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const promptFromUrl = useMemo(() => searchParams.get('prompt') || undefined, [searchParams]);
    const [showChat, setShowChat] = useState(Boolean(promptFromUrl));
    const [assetsCollapsed, setAssetsCollapsed] = useState(false);
    const [storyboard, setStoryboard] = useState<StoryboardItem[]>([]);
    const [storyboardLayout, setStoryboardLayout] = useState<StoryboardLayoutMode>('vertical');
    const historyRef = useRef<CanvasElement[][]>([]);
    const futureRef = useRef<CanvasElement[][]>([]);
    const clipboardRef = useRef<CanvasElement[]>([]);
    const suppressHistoryRef = useRef(false);

    const {
        saveStatus,
        isLoading,
        saveProject,
    } = useProjectPersistence({
        user,
        initialProjectId: projectId,
        elements,
        title,
        onProjectLoaded: ({ title: loadedTitle, elements: loadedElements }) => {
            setTitle(loadedTitle);
            setElements(loadedElements);
        },
    });

    const {
        appendElement,
        handleAddImage,
        handleAddVideo,
        handleAddText,
        handleAddShape,
        handleElementChange,
        handleDelete,
        handleOpenImageGenerator,
        handleOpenVideoGenerator,
        createImageGeneratorElement,
        createVideoGeneratorElement,
    } = useCanvasElements({
        pan,
        elements,
        setElements,
        setSelectedIds,
        setActiveTool,
    });

    const {
        handleGenerateVideo,
        handleConnectFlow,
        handleGenerateFromImage,
        handleGenerateImage,
        handleAiChat,
    } = useCanvasGeneration({
        pan,
        elements,
        selectedIds,
        setElements,
        setSelectedIds,
        setActiveTool,
        setIsGenerating,
    });

    const { handleRemoveBackground, handleUpscale, handleCrop } = useCanvasImageActions({
        setElements,
    });

    const handleOpenImageEditMode = useCallback((element: CanvasElement, mode: 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle', prompt?: string) => {
        if (!element.content) return;

        const generatorElement = createImageGeneratorElement();
        const nextGenerator: CanvasElement = {
            ...generatorElement,
            x: element.x + (element.width || 400) + 120,
            y: element.y,
            width: element.width || generatorElement.width,
            height: element.height || generatorElement.height,
            referenceImageId: element.id,
            initialEditMode: mode,
            initialPrompt: prompt || element.prompt || '',
        };

        setElements((prev) => [...prev, nextGenerator]);
        setSelectedIds([nextGenerator.id]);
        setActiveTool('select');
    }, [createImageGeneratorElement, setElements, setSelectedIds]);

    const projectAssets = useProjectAssets(elements);
    const storyboardStorageKey = useMemo(() => `lovart:storyboard:${projectId || 'draft'}`, [projectId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(storyboardStorageKey);
            if (!raw) {
                startTransition(() => {
                    setStoryboard([]);
                    setStoryboardLayout('vertical');
                });
                return;
            }
            const parsed = JSON.parse(raw) as StoryboardItem[] | { items?: StoryboardItem[]; layout?: StoryboardLayoutMode };
            if (Array.isArray(parsed)) {
                startTransition(() => {
                    setStoryboard(normalizeStoryboardItems(parsed));
                    setStoryboardLayout('vertical');
                });
                return;
            }
            startTransition(() => {
                setStoryboard(normalizeStoryboardItems(parsed.items || []));
                setStoryboardLayout(parsed.layout || 'vertical');
            });
        } catch {
            startTransition(() => {
                setStoryboard([]);
                setStoryboardLayout('vertical');
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

    useEffect(() => {
        if (isLoading || suppressHistoryRef.current) return;
        historyRef.current.push(JSON.parse(JSON.stringify(elements)));
        if (historyRef.current.length > 100) {
            historyRef.current.shift();
        }
        futureRef.current = [];
    }, [elements, isLoading]);

    const restoreElements = useCallback((nextElements: CanvasElement[]) => {
        suppressHistoryRef.current = true;
        setElements(nextElements);
        window.setTimeout(() => {
            suppressHistoryRef.current = false;
        }, 0);
    }, []);

    const handleInsertAsset = useCallback((asset: ProjectAsset) => {
        const resolvedAspectRatio = asset.aspectRatio ?? inferStoryboardAspectRatio(asset.width, asset.height);
        const aspectMeta = getStoryboardAspectMeta(resolvedAspectRatio);
        const width = asset.width || aspectMeta.canvasWidth;
        const height = asset.height || aspectMeta.canvasHeight;
        const x = (window.innerWidth / 2 - pan.x) / scale - width / 2;
        const y = (window.innerHeight / 2 - 56 - pan.y) / scale - height / 2;
        const resolvedOutputSize = asset.outputSize ?? aspectMeta.videoSize;
        const resolvedOrientation = asset.orientation ?? aspectMeta.orientation;

        appendElement({
            id: uuidv4(),
            type: asset.type,
            x,
            y,
            width,
            height,
            originalWidth: asset.width || width,
            originalHeight: asset.height || height,
            content: asset.url,
            prompt: asset.prompt,
            storyboardTitle: asset.title,
            storyboardBrief: asset.prompt,
            storyboardAspectRatio: resolvedAspectRatio,
            storyboardVideoSize: resolvedOutputSize,
            storyboardOrientation: resolvedOrientation,
            storyboardSourceAspectRatio: resolvedAspectRatio,
            storyboardSourceVideoSize: resolvedOutputSize,
            storyboardSourceOrientation: resolvedOrientation,
        });
    }, [appendElement, pan.x, pan.y, scale]);

    const handleLocateAsset = useCallback((asset: ProjectAsset) => {
        const source = elements.find((element) => element.id === asset.elementId);
        if (!source) return;

        setSelectedIds([source.id]);
        setPan({
            x: window.innerWidth / 2 - ((source.x + (source.width || 300) / 2) * scale),
            y: window.innerHeight / 2 - 56 - ((source.y + (source.height || 200) / 2) * scale),
        });
    }, [elements, scale, setPan]);

    const handleUseAsImageReference = useCallback((asset: ProjectAsset) => {
        const activeGenerator = elements.find((element) => selectedIds.length === 1 && element.id === selectedIds[0] && element.type === 'image-generator');
        if (!activeGenerator) return;
        handleElementChange(activeGenerator.id, { referenceImageId: asset.elementId });
    }, [elements, handleElementChange, selectedIds]);

    const handleUseAsVideoReference = useCallback((asset: ProjectAsset) => {
        const activeGenerator = elements.find((element) => selectedIds.length === 1 && element.id === selectedIds[0] && element.type === 'video-generator');
        if (!activeGenerator) return;
        handleElementChange(activeGenerator.id, { referenceImageId: asset.elementId });
    }, [elements, handleElementChange, selectedIds]);

    const handleAddToStoryboard = useCallback((asset: ProjectAsset) => {
        setStoryboard((prev) => {
            if (prev.some((item) => item.assetId === asset.id)) {
                return prev;
            }
            const aspectRatio = asset.aspectRatio ?? inferStoryboardAspectRatio(asset.width, asset.height);
            const aspectMeta = getStoryboardAspectMeta(aspectRatio);

            return normalizeStoryboardItems([
                ...prev,
                {
                    id: uuidv4(),
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
        });
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
            return normalizeStoryboardItems(next);
        });
    }, []);

    const handleRemoveStoryboardItem = useCallback((itemId: string) => {
        setStoryboard((prev) => normalizeStoryboardItems(prev.filter((item) => item.id !== itemId)));
    }, []);

    const handleRenameStoryboardItem = useCallback((itemId: string, title: string) => {
        setStoryboard((prev) => prev.map((item) => item.id === itemId ? { ...item, title } : item));
    }, []);

    const handleUpdateStoryboardBrief = useCallback((itemId: string, brief: string) => {
        setStoryboard((prev) => prev.map((item) => item.id === itemId ? { ...item, sourcePrompt: brief } : item));
    }, []);

    const handleUpdateStoryboardDuration = useCallback((itemId: string, durationSec: number) => {
        const normalizedDuration = Number.isFinite(durationSec) ? Math.min(30, Math.max(1, durationSec)) : 5;
        setStoryboard((prev) => prev.map((item) => item.id === itemId ? { ...item, durationSec: normalizedDuration } : item));
    }, []);

    const handleUpdateAllStoryboardDurations = useCallback((durationSec: number) => {
        const normalizedDuration = Number.isFinite(durationSec) ? Math.min(30, Math.max(1, durationSec)) : 5;
        setStoryboard((prev) => prev.map((item) => ({ ...item, durationSec: normalizedDuration })));
    }, []);

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
            storyboardMeta: `${options.aspectRatio} · ${aspectMeta.label} · ${element.storyboardDurationSec ?? 5}s · ${getStoryboardRenderProfileLabel(nextRenderProfile)}`,
            content: element.type === 'video-generator' ? options.outputSize : element.content,
        };
    }, []);

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
        const nextItemState = new Map<string, { outputSize: StoryboardVideoSize; aspectRatio: StoryboardAspectRatio; orientation: ReturnType<typeof getStoryboardAspectMeta>['orientation']; renderProfile: StoryboardRenderProfile }>();

        setStoryboard((prev) => prev.map((item) => {
            const aspectRatio = item.aspectRatio ?? '9:16';
            const aspectMeta = getStoryboardAspectMeta(aspectRatio);
            const outputSize = getPreferredStoryboardVideoSize(aspectRatio, renderProfile);
            const nextState = {
                outputSize,
                aspectRatio,
                orientation: aspectMeta.orientation,
                renderProfile: getStoryboardRenderProfile(outputSize),
            };
            nextItemState.set(item.id, nextState);
            return {
                ...item,
                aspectRatio,
                orientation: aspectMeta.orientation,
                outputSize,
                renderProfile: nextState.renderProfile,
            };
        }));

        setElements((prev) => prev.map((element) => {
            if (!element.storyboardItemId) return element;
            const nextState = nextItemState.get(element.storyboardItemId);
            if (!nextState) return element;
            return syncStoryboardNodeFrame(element, nextState);
        }));
    }, [setElements, syncStoryboardNodeFrame]);

    const getStoryboardFrameDeltaLabel = useCallback((item: StoryboardItem) => {
        const currentAspect = item.aspectRatio ?? '9:16';
        const sourceAspect = item.sourceAspectRatio ?? currentAspect;
        const currentSize = item.outputSize ?? getStoryboardAspectMeta(currentAspect).videoSize;
        const sourceSize = item.sourceOutputSize ?? currentSize;

        if (currentAspect === sourceAspect && currentSize === sourceSize) {
            return 'Follow source';
        }

        return `${sourceAspect} → ${currentAspect}`;
    }, []);

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

    function buildStoryboardVideoFlow(item: StoryboardItem, options?: { x?: number; y?: number; forceStandalone?: boolean; shotIndex?: number; sequenceState?: 'single' | 'first' | 'middle' | 'last'; layoutMode?: StoryboardLayoutMode }) {
        const source = elements.find((element) => element.id === item.elementId);
        const resolvedAspectRatio = item.aspectRatio ?? '9:16';
        const fallbackMeta = getStoryboardAspectMeta(resolvedAspectRatio);
        const resolvedOutputSize = item.outputSize ?? fallbackMeta.videoSize;
        const { width, height, videoSize, orientation, label, shortLabel, displaySize, renderProfile } = getStoryboardNodeSize(resolvedAspectRatio, resolvedOutputSize);
        const resolvedOrientation = item.orientation ?? fallbackMeta.orientation;
        const spacing = 120;

        const fallbackX = options?.x ?? ((window.innerWidth / 2 - pan.x) / scale - width / 2);
        const fallbackY = options?.y ?? ((window.innerHeight / 2 - 56 - pan.y) / scale - height / 2);

        const shotIndex = (options?.shotIndex ?? item.order) + 1;
        const shotCount = storyboard.length;
        const shotLabel = `Shot ${String(shotIndex).padStart(2, '0')}`;
        const durationLabel = `${item.durationSec ?? 5}s`;
        const sequenceState = options?.sequenceState ?? 'single';
        const layoutMode = options?.layoutMode ?? storyboardLayout;
        const boardMode = layoutMode === 'horizontal' ? (sequenceState === 'single' ? 'Single Board' : 'Storyboard Flow') : 'Shot Queue';
        const sequenceHint = sequenceState === 'single'
            ? 'Single'
            : sequenceState === 'first'
                ? (layoutMode === 'horizontal' ? 'Start →' : 'Head ↓')
                : sequenceState === 'last'
                    ? 'End'
                    : (layoutMode === 'horizontal' ? 'Next →' : 'Queue ↓');
        const frameDeltaLabel = getStoryboardFrameDeltaLabel(item);
        const draftPrompt = [
            shotLabel,
            item.title,
            `${resolvedAspectRatio} · ${label} · ${durationLabel}`,
            item.sourcePrompt,
            `输出画幅请保持 ${resolvedAspectRatio}（${resolvedOrientation} / ${resolvedOutputSize}）。`,
            `分镜画幅映射：${frameDeltaLabel}。`,
            item.type === 'image' ? '请基于这张分镜参考图生成一个具有镜头运动与主体动作的视频镜头。' : '请基于这个分镜片段继续生成风格一致、运动自然的视频镜头。',
        ].filter(Boolean).join('｜');

        if (!source || options?.forceStandalone) {
            const standaloneId = uuidv4();
            const standaloneElement: CanvasElement = {
                ...createVideoGeneratorElement(),
                id: standaloneId,
                x: fallbackX,
                y: fallbackY,
                width,
                height,
                prompt: draftPrompt,
                content: resolvedOutputSize,
                originalWidth: width,
                originalHeight: height,
                storyboardItemId: item.id,
                storyboardShotLabel: shotLabel,
                storyboardTitle: item.title,
                storyboardMeta: `${resolvedAspectRatio} · ${label} · ${durationLabel}`,
                storyboardBrief: item.sourcePrompt,
                storyboardAspectRatio: resolvedAspectRatio,
                storyboardVideoSize: resolvedOutputSize,
                storyboardOrientation: resolvedOrientation,
                storyboardSourceAspectRatio: item.sourceAspectRatio ?? resolvedAspectRatio,
                storyboardSourceVideoSize: item.sourceOutputSize ?? resolvedOutputSize,
                storyboardSourceOrientation: item.sourceOrientation ?? resolvedOrientation,
                storyboardRenderProfile: item.renderProfile ?? renderProfile,
                storyboardDurationSec: item.durationSec ?? 5,
                storyboardShotIndex: shotIndex,
                storyboardShotCount: shotCount,
                storyboardSequenceState: sequenceState,
                storyboardSequenceHint: sequenceHint,
                storyboardBoardMode: boardMode,
            };
            return {
                sourceId: undefined,
                generatorId: standaloneId,
                elementsToAdd: [standaloneElement],
                selectedId: standaloneId,
                updateSource: false,
            };
        }

        const groupId = uuidv4();
        const connectorId = uuidv4();
        const generatorId = uuidv4();

        const generatorElement: CanvasElement = {
            ...createVideoGeneratorElement(),
            id: generatorId,
            x: options?.x ?? (source.x + (source.width || width) + spacing),
            y: options?.y ?? source.y,
            width,
            height,
            originalWidth: width,
            originalHeight: height,
            referenceImageId: source.type === 'image' ? source.id : undefined,
            prompt: draftPrompt,
            content: resolvedOutputSize,
            groupId,
            linkedElements: [source.id, connectorId],
            storyboardItemId: item.id,
            storyboardShotLabel: shotLabel,
            storyboardTitle: item.title,
            storyboardMeta: `${resolvedAspectRatio} · ${label} · ${durationLabel}`,
            storyboardBrief: item.sourcePrompt,
            storyboardAspectRatio: resolvedAspectRatio,
            storyboardVideoSize: resolvedOutputSize,
            storyboardOrientation: resolvedOrientation,
            storyboardSourceAspectRatio: item.sourceAspectRatio ?? resolvedAspectRatio,
            storyboardSourceVideoSize: item.sourceOutputSize ?? resolvedOutputSize,
            storyboardSourceOrientation: item.sourceOrientation ?? resolvedOrientation,
            storyboardRenderProfile: item.renderProfile ?? renderProfile,
            storyboardDurationSec: item.durationSec ?? 5,
            storyboardShotIndex: shotIndex,
            storyboardShotCount: shotCount,
            storyboardSequenceState: sequenceState,
            storyboardSequenceHint: sequenceHint,
            storyboardBoardMode: boardMode,
        };

        const connectorElement: CanvasElement = {
            id: connectorId,
            type: 'connector',
            x: 0,
            y: 0,
            connectorFrom: source.id,
            connectorTo: generatorId,
            connectorStyle: 'dashed',
            color: '#6B7280',
            strokeWidth: 2,
            groupId,
        };

        return {
            sourceId: source.id,
            generatorId,
            elementsToAdd: [connectorElement, generatorElement],
            selectedId: generatorId,
            updateSource: true,
            groupId,
            connectorId,
            meta: {
                aspectRatio: item.aspectRatio ?? '9:16',
                orientation,
                label,
                shortLabel,
                videoSize,
                displaySize,
                durationLabel,
            },
        };
    }

    const handleCreateVideoFromStoryboard = useCallback((item: StoryboardItem) => {
        const flow = buildStoryboardVideoFlow(item, { shotIndex: item.order, sequenceState: 'single', layoutMode: storyboardLayout });

        setElements((prev) => {
            if (!flow.updateSource || !flow.sourceId || !flow.connectorId || !flow.groupId) {
                return [...prev, ...flow.elementsToAdd];
            }

            const updatedPrev = prev.map((el) => {
                if (el.id === flow.sourceId) {
                    return {
                        ...el,
                        groupId: flow.groupId,
                        linkedElements: [...(el.linkedElements || []), flow.connectorId, flow.generatorId],
                    };
                }
                return el;
            });
            return [...updatedPrev, ...flow.elementsToAdd];
        });

        setSelectedIds([flow.selectedId]);
        setActiveTool('select');
    }, [buildStoryboardVideoFlow, setActiveTool, setElements, setSelectedIds, storyboardLayout]);

    const handleCreateStoryboardFlow = useCallback(() => {
        if (storyboard.length === 0) return;

        const nodeSizes = storyboard.map((item) => getStoryboardNodeSize(item.aspectRatio, item.outputSize));
        const maxWidth = nodeSizes.reduce((max, size) => Math.max(max, size.width), 320);
        const maxHeight = nodeSizes.reduce((max, size) => Math.max(max, size.height), 320);
        const horizontalGap = 112;
        const verticalGap = 84;
        const boardPaddingX = storyboardLayout === 'horizontal' ? 64 : 48;
        const boardPaddingY = storyboardLayout === 'horizontal' ? 52 : 40;
        const boardMetrics = storyboardLayout === 'horizontal'
            ? {
                width: nodeSizes.reduce((sum, size, index) => {
                    const gap = index === 0 ? 0 : (nodeSizes[index - 1].width >= 380 || size.width >= 380 ? horizontalGap + 16 : size.width <= 280 ? horizontalGap - 10 : horizontalGap);
                    return sum + size.width + gap;
                }, 0),
                height: maxHeight,
            }
            : {
                width: maxWidth,
                height: nodeSizes.reduce((sum, size) => sum + size.height, 0) + Math.max(0, storyboard.length - 1) * verticalGap,
            };

        const boardBaseX = (window.innerWidth / 2 - pan.x) / scale - (boardMetrics.width + boardPaddingX * 2) / 2;
        const boardBaseY = (window.innerHeight / 2 - 56 - pan.y) / scale - (boardMetrics.height + boardPaddingY * 2) / 2;
        const baseX = boardBaseX + boardPaddingX;
        const baseY = boardBaseY + boardPaddingY;

        let cursorX = baseX;
        let cursorY = baseY;
        const flows = storyboard.map((item, index) => {
            const nodeSize = nodeSizes[index];
            const x = storyboardLayout === 'horizontal'
                ? cursorX
                : baseX + (maxWidth - nodeSize.width) / 2;
            const y = storyboardLayout === 'horizontal'
                ? baseY + (maxHeight - nodeSize.height)
                : cursorY;

            if (storyboardLayout === 'horizontal') {
                const adaptiveGap = nodeSize.width >= 380 ? horizontalGap + 16 : nodeSize.width <= 280 ? horizontalGap - 10 : horizontalGap;
                cursorX += nodeSize.width + adaptiveGap;
            } else {
                cursorY += nodeSize.height + verticalGap;
            }

            return buildStoryboardVideoFlow(item, {
                x,
                y,
                forceStandalone: true,
                shotIndex: index,
                sequenceState: storyboard.length === 1 ? 'single' : index === 0 ? 'first' : index === storyboard.length - 1 ? 'last' : 'middle',
                layoutMode: storyboardLayout,
            });
        });

        setElements((prev) => [...prev, ...flows.flatMap((flow) => flow.elementsToAdd)]);
        setSelectedIds(flows.map((flow) => flow.selectedId));
        setActiveTool('select');
    }, [buildStoryboardVideoFlow, getStoryboardNodeSize, pan.x, pan.y, scale, setActiveTool, setElements, setSelectedIds, storyboard, storyboardLayout]);

    const handleVideoGeneratorConfigChange = useCallback((elementId: string, updates: Partial<CanvasElement>) => {
        handleElementChange(elementId, updates);
    }, [handleElementChange]);

    const handleLocateStoryboardItem = useCallback((item: StoryboardItem) => {
        const asset = projectAssets.find((entry) => entry.id === item.assetId);
        if (asset) {
            handleLocateAsset(asset);
            return;
        }

        const source = elements.find((element) => element.id === item.elementId);
        if (!source) return;
        setSelectedIds([source.id]);
        setPan({
            x: window.innerWidth / 2 - ((source.x + (source.width || 300) / 2) * scale),
            y: window.innerHeight / 2 - 56 - ((source.y + (source.height || 200) / 2) * scale),
        });
    }, [elements, handleLocateAsset, projectAssets, scale, setPan]);

    const duplicateElements = useCallback((source: CanvasElement[]) => {
        const idMap = new Map<string, string>();
        source.forEach((element) => {
            idMap.set(element.id, uuidv4());
        });

        return source.map((element) => ({
            ...element,
            id: idMap.get(element.id)!,
            x: element.x + 24,
            y: element.y + 24,
            referenceImageId: element.referenceImageId ? idMap.get(element.referenceImageId) || element.referenceImageId : element.referenceImageId,
            connectorFrom: element.connectorFrom ? idMap.get(element.connectorFrom) || element.connectorFrom : element.connectorFrom,
            connectorTo: element.connectorTo ? idMap.get(element.connectorTo) || element.connectorTo : element.connectorTo,
            linkedElements: element.linkedElements?.map((id) => idMap.get(id) || id),
            groupId: element.groupId ? uuidv4() : element.groupId,
        }));
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const modKey = isMac ? e.metaKey : e.ctrlKey;
            const activeTag = document.activeElement?.tagName;
            const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

            if (modKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveProject();
                return;
            }

            if (modKey && e.shiftKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveProject();
                return;
            }

            if (isTyping) return;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                e.preventDefault();
                setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
                setSelectedIds([]);
                return;
            }

            if (modKey && e.key.toLowerCase() === 'c' && selectedIds.length > 0) {
                e.preventDefault();
                clipboardRef.current = elements.filter(el => selectedIds.includes(el.id));
                return;
            }

            if (modKey && e.key.toLowerCase() === 'v' && clipboardRef.current.length > 0) {
                e.preventDefault();
                const duplicated = duplicateElements(clipboardRef.current);
                setElements(prev => [...prev, ...duplicated]);
                setSelectedIds(duplicated.map(el => el.id));
                return;
            }

            if (modKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (historyRef.current.length > 1) {
                    const current = historyRef.current.pop();
                    if (current) futureRef.current.unshift(current);
                    const previous = historyRef.current[historyRef.current.length - 1];
                    if (previous) {
                        restoreElements(JSON.parse(JSON.stringify(previous)));
                        setSelectedIds([]);
                    }
                }
                return;
            }

            if (modKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                const next = futureRef.current.shift();
                if (next) {
                    historyRef.current.push(JSON.parse(JSON.stringify(next)));
                    restoreElements(JSON.parse(JSON.stringify(next)));
                    setSelectedIds([]);
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [duplicateElements, elements, restoreElements, saveProject, selectedIds]);

    if (isLoading) {
        return (
            <div className="h-screen w-full bg-[radial-gradient(circle_at_top,_#13233f_0%,_#0b1220_34%,_#070b14_100%)] flex items-center justify-center">
                <div className="text-center rounded-3xl border border-white/10 bg-slate-950/50 px-8 py-7 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                    <div className="w-16 h-16 border-4 border-slate-700 border-t-sky-400 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="font-medium text-slate-100">加载画布中...</p>
                    <p className="text-sm mt-2 text-slate-400">正在从云端获取数据</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full relative overflow-hidden bg-white dark:bg-black">
            <header className="absolute top-0 left-0 z-50 flex h-14 w-full items-center justify-between px-4 pointer-events-none border-b border-transparent bg-transparent dark:border-white/8 dark:bg-black/28 dark:shadow-[0_12px_40px_rgba(0,0,0,0.22)] dark:backdrop-blur-xl">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <Link href="/" className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/8">
                        <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold dark:bg-gradient-to-br dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500">D</div>
                        <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                    </Link>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-40 rounded px-2 py-1 text-sm font-medium text-gray-700 bg-transparent border-none outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/8 dark:focus:bg-white/8"
                        placeholder="Untitled"
                        disabled={isLoading}
                    />
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {saveStatus === 'saving' && (
                            <>
                                <Cloud size={14} className="animate-pulse" />
                                <span>保存中...</span>
                            </>
                        )}
                        {saveStatus === 'saved' && user && (
                            <>
                                <Cloud size={14} className="text-emerald-400" />
                                <span className="text-emerald-300">已保存</span>
                            </>
                        )}
                        {saveStatus === 'offline' && (
                            <>
                                <CloudOff size={14} className="text-red-500" />
                                <span className="text-red-600">离线</span>
                            </>
                        )}
                        {!user && <span className="text-amber-600">未登录</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
                    <ThemeToggle />
                    <button
                        onClick={() => setShowChat(!showChat)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${showChat ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                    >
                        <Sparkles size={18} className="text-black" />
                    </button>
                </div>
            </header>

            {showChat && (
                <div className="absolute right-4 top-20 bottom-4 w-[400px] z-40 animate-in slide-in-from-right-4 duration-300">
                    <AiDesignerPanel
                        onGenerate={handleAiChat}
                        isGenerating={isGenerating}
                        onClose={() => setShowChat(false)}
                        initialPrompt={promptFromUrl}
                    />
                </div>
            )}

            <div className="absolute inset-0">
                <CanvasArea
                    scale={scale}
                    pan={pan}
                    onPanChange={setPan}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onZoomTo={zoomTo}
                    elements={elements}
                    selectedIds={selectedIds}
                    onSelect={setSelectedIds}
                    onElementChange={handleElementChange}
                    onDelete={handleDelete}
                    onAddElement={appendElement}
                    onCreateNodeAt={(x, y) => {
                        appendElement({
                            ...createImageGeneratorElement(),
                            x,
                            y,
                        });
                    }}
                    activeTool={activeTool}
                    onDragStart={() => setIsDraggingElement(true)}
                    onDragEnd={() => setIsDraggingElement(false)}
                    onGenerateFromImage={handleGenerateFromImage}
                    onOpenImageEditMode={handleOpenImageEditMode}
                    onConnectFlow={handleConnectFlow}
                    onRemoveBackground={handleRemoveBackground}
                    onUpscale={handleUpscale}
                    onCrop={handleCrop}
                />
                <FloatingToolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    onAddImage={handleAddImage}
                    onAddVideo={handleAddVideo}
                    onAddText={handleAddText}
                    onAddShape={handleAddShape}
                    onOpenImageGenerator={handleOpenImageGenerator}
                    onOpenVideoGenerator={handleOpenVideoGenerator}
                />

                {selectedIds.length === 1 && !isDraggingElement && (() => {
                    const selectedEl = elements.find(el => el.id === selectedIds[0]);
                    if (selectedEl?.type === 'image-generator') {
                        const left = (selectedEl.x * scale) + pan.x;
                        const top = ((selectedEl.y + (selectedEl.height || 400)) * scale) + pan.y + 20;

                        return (
                            <ImageGeneratorPanel
                                elementId={selectedIds[0]}
                                initialMode={selectedEl.initialEditMode}
                                initialPrompt={selectedEl.initialPrompt}
                                onGenerate={handleGenerateImage}
                                isGenerating={isGenerating}
                                canvasElements={elements}
                                style={{
                                    left: `${left}px`,
                                    top: `${top}px`,
                                }}
                            />
                        );
                    }
                    return null;
                })()}

                {selectedIds.length === 1 && !isDraggingElement && (() => {
                    const selectedEl = elements.find(el => el.id === selectedIds[0]);
                    if (selectedEl?.type === 'video-generator') {
                        const left = (selectedEl.x * scale) + pan.x;
                        const top = ((selectedEl.y + (selectedEl.height || 300)) * scale) + pan.y + 20;

                        return (
                            <VideoGeneratorPanel
                                elementId={selectedIds[0]}
                                onGenerate={handleGenerateVideo}
                                onConfigChange={handleVideoGeneratorConfigChange}
                                canvasElements={elements}
                                style={{
                                    left: `${left}px`,
                                    top: `${top}px`,
                                }}
                            />
                        );
                    }
                    return null;
                })()}

                <div className={`absolute top-20 bottom-4 z-30 transition-all duration-300 ${showChat ? 'right-[420px]' : 'right-4'}`}>
                    <AssetsPanel
                        assets={projectAssets}
                        storyboard={storyboard}
                        collapsed={assetsCollapsed}
                        onToggleCollapse={() => setAssetsCollapsed((prev) => !prev)}
                        onInsertAsset={handleInsertAsset}
                        onLocateAsset={handleLocateAsset}
                        onUseAsImageReference={handleUseAsImageReference}
                        onUseAsVideoReference={handleUseAsVideoReference}
                        onAddToStoryboard={handleAddToStoryboard}
                        onLocateStoryboardItem={handleLocateStoryboardItem}
                        onMoveStoryboardItem={handleMoveStoryboardItem}
                        onRemoveStoryboardItem={handleRemoveStoryboardItem}
                        onRenameStoryboardItem={handleRenameStoryboardItem}
                        onUpdateStoryboardBrief={handleUpdateStoryboardBrief}
                        onUpdateStoryboardDuration={handleUpdateStoryboardDuration}
                        onUpdateStoryboardAspectRatio={handleUpdateStoryboardAspectRatio}
                        onUpdateStoryboardOutputSize={handleUpdateStoryboardOutputSize}
                        onResetStoryboardAspectRatioFromAsset={handleResetStoryboardAspectRatioFromAsset}
                        onUpdateAllStoryboardDurations={handleUpdateAllStoryboardDurations}
                        onUpdateAllStoryboardRenderProfiles={handleUpdateAllStoryboardRenderProfiles}
                        onUpdateAllStoryboardAspectRatios={(aspectRatio) => {
                            const aspectMeta = getStoryboardAspectMeta(aspectRatio);
                            setStoryboard((prev) => prev.map((item) => {
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
                            }));
                            setElements((prev) => prev.map((element) => {
                                if (!element.storyboardItemId) return element;
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
                        }}
                        onResetAllStoryboardAspectRatiosFromAssets={() => {
                            const resetMap = new Map<string, { aspectRatio: StoryboardAspectRatio; orientation: ReturnType<typeof getStoryboardAspectMeta>['orientation']; outputSize: StoryboardVideoSize; renderProfile: ReturnType<typeof getStoryboardRenderProfile> }>();
                            setStoryboard((prev) => prev.map((item) => {
                                const aspectRatio = resolveStoryboardAspectRatioFromAsset(item);
                                const aspectMeta = getStoryboardAspectMeta(aspectRatio);
                                const preferredRenderProfile = item.renderProfile ?? getStoryboardRenderProfile(item.outputSize ?? aspectMeta.videoSize);
                                const preferredOutputSize = getPreferredStoryboardVideoSize(aspectRatio, preferredRenderProfile);
                                resetMap.set(item.id, {
                                    aspectRatio,
                                    orientation: aspectMeta.orientation,
                                    outputSize: preferredOutputSize,
                                    renderProfile: getStoryboardRenderProfile(preferredOutputSize),
                                });
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
                                if (!element.storyboardItemId) return element;
                                const resetState = resetMap.get(element.storyboardItemId);
                                if (!resetState) return element;
                                return {
                                    ...syncStoryboardNodeFrame(element, resetState),
                                    storyboardSourceAspectRatio: resetState.aspectRatio,
                                    storyboardSourceOrientation: resetState.orientation,
                                    storyboardSourceVideoSize: resetState.outputSize,
                                };
                            }));
                        }}
                        storyboardLayout={storyboardLayout}
                        onStoryboardLayoutChange={setStoryboardLayout}
                        onCreateVideoFromStoryboard={handleCreateVideoFromStoryboard}
                        onCreateStoryboardFlow={handleCreateStoryboardFlow}
                    />
                </div>

                <div className="absolute bottom-4 left-4 z-50 flex items-center rounded-2xl border border-gray-200 bg-white/92 p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-black/72 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
                    <button onClick={() => zoomOut()} className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200">
                        <Minus size={16} />
                    </button>
                    <span className="min-w-[3.4rem] px-2 text-center text-xs font-medium text-gray-700 dark:text-gray-200">
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={() => zoomIn()} className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200">
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function LovartCanvas() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#13233f_0%,_#0b1220_34%,_#070b14_100%)] flex items-center justify-center">
                <div className="text-center rounded-3xl border border-white/10 bg-slate-950/50 px-7 py-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-sky-400"></div>
                    <p className="text-slate-200">Loading canvas...</p>
                </div>
            </div>
        }>
            <LovartCanvasContent />
        </Suspense>
    );
}
