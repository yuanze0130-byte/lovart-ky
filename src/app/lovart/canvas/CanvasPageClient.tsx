"use client";

import React, { useMemo, useState, useEffect, Suspense, useRef, useCallback, startTransition } from 'react';
import { Plus, Minus, ChevronDown, Sparkles, Cloud, CloudOff, Map as MapIcon } from 'lucide-react';
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
import { useProjectAssets, type ProjectAsset, type StoryboardItem, type StoryboardAspectRatio, type StoryboardLayoutMode, type StoryboardVideoSize, type StoryboardRenderProfile, inferStoryboardAspectRatio, normalizeStoryboardItems, getStoryboardAspectMeta, inferStoryboardAspectRatioFromVideoSize, getStoryboardNodeDimensions, getStoryboardRenderProfile, getPreferredStoryboardVideoSize, getStoryboardRenderProfileLabel, formatStoryboardMeta, getStoryboardBoardMode, getStoryboardSequenceHint, getStoryboardFrameDeltaLabel, getRecommendedStoryboardLayout, summarizeProductionBoard } from '@/hooks/useProjectAssets';
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
    const agentModeFromUrl = useMemo(() => (searchParams.get('mode') as 'design' | 'branding' | 'image-editing' | 'research' | null) || 'design', [searchParams]);
    const [showChat, setShowChat] = useState(Boolean(promptFromUrl));
    const [assetsCollapsed, setAssetsCollapsed] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);
    const [isMiniMapDragging, setIsMiniMapDragging] = useState(false);
    const [miniMapHoveredId, setMiniMapHoveredId] = useState<string | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 });
    const [agentStage, setAgentStage] = useState<'idle' | 'analyzing' | 'planning' | 'building'>('idle');
    const [storyboard, setStoryboard] = useState<StoryboardItem[]>([]);
    const [storyboardLayout, setStoryboardLayout] = useState<StoryboardLayoutMode>('vertical');
    const historyRef = useRef<CanvasElement[][]>([]);
    const futureRef = useRef<CanvasElement[][]>([]);
    const clipboardRef = useRef<CanvasElement[]>([]);
    const suppressHistoryRef = useRef(false);
    const miniMapRef = useRef<HTMLDivElement | null>(null);

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
        handleElementsChange,
        handleDelete,
        handleDeleteMany,
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

    const handleAgentGenerate = useCallback(async (prompt: string, options?: { mode?: 'design' | 'branding' | 'image-editing' | 'research' }) => {
        const resolvedMode = options?.mode || 'design';
        setAgentStage('analyzing');
        const result = await handleAiChat(prompt, options);
        setAgentStage('planning');
        const plan = result.plan || {};

        if (plan.recommendedTitle && typeof plan.recommendedTitle === 'string') {
            setTitle(plan.recommendedTitle);
        }

        const baseX = 140 - pan.x;
        const baseY = 140 - pan.y;
        const nextNodes: CanvasElement[] = [];
        const layoutPresets = {
            design: { textX: baseX, textY: baseY + 120, cardWidth: 440, cardGapY: 126, generatorX: baseX + 620, generatorY: baseY + 80, boardWidth: 1160, boardHeight: 760 },
            branding: { textX: baseX, textY: baseY + 120, cardWidth: 460, cardGapY: 126, generatorX: baseX + 640, generatorY: baseY + 100, boardWidth: 1180, boardHeight: 760 },
            'image-editing': { textX: baseX, textY: baseY + 120, cardWidth: 420, cardGapY: 120, generatorX: baseX + 560, generatorY: baseY + 100, boardWidth: 1080, boardHeight: 720 },
            research: { textX: baseX, textY: baseY + 140, cardWidth: 320, cardGapY: 190, generatorX: baseX + 760, generatorY: baseY + 420, boardWidth: 1260, boardHeight: 900 },
        } as const;
        const preset = layoutPresets[resolvedMode];

        nextNodes.push({
            id: uuidv4(),
            type: 'shape',
            shapeType: 'square',
            x: baseX - 56,
            y: baseY - 72,
            width: preset.boardWidth,
            height: preset.boardHeight,
            color: resolvedMode === 'branding' ? '#FFFBEB' : resolvedMode === 'image-editing' ? '#F0FDF4' : resolvedMode === 'research' ? '#F8FAFC' : '#F8FBFF',
        });
        nextNodes.push({
            id: uuidv4(),
            type: 'text',
            x: baseX - 24,
            y: baseY - 48,
            width: 280,
            content: resolvedMode === 'branding' ? 'Brand Agent · Strategy Lane' : resolvedMode === 'image-editing' ? 'Editing Agent · Edit Lane' : resolvedMode === 'research' ? 'Research Agent · Research Lane' : 'Design Agent · Concept Lane',
            fontSize: 14,
            color: '#64748B',
        });
        nextNodes.push({
            id: uuidv4(),
            type: 'text',
            x: preset.generatorX,
            y: baseY - 48,
            width: 260,
            content: resolvedMode === 'branding' ? 'Visual Direction Lane' : resolvedMode === 'image-editing' ? 'Output Lane' : resolvedMode === 'research' ? 'Exploration Lane' : 'Generation Lane',
            fontSize: 14,
            color: '#64748B',
        });

        const sectionCards = Array.isArray(plan.sections)
            ? plan.sections.flatMap((section, index) => {
                const cardX = resolvedMode === 'research' ? preset.textX + (index % 2) * 360 : preset.textX;
                const cardY = resolvedMode === 'research' ? preset.textY + Math.floor(index / 2) * preset.cardGapY : preset.textY + index * preset.cardGapY;
                return [
                    {
                        id: uuidv4(),
                        type: 'text' as const,
                        x: cardX,
                        y: cardY - 44,
                        width: preset.cardWidth - 36,
                        content: resolvedMode === 'branding'
                            ? index === 0 ? '品牌定位' : index === 1 ? '语气与调性' : index === 2 ? '视觉系统' : '品牌延展'
                            : resolvedMode === 'image-editing'
                                ? index === 0 ? '编辑目标' : index === 1 ? '问题诊断' : index === 2 ? '修改策略' : '输出建议'
                                : resolvedMode === 'research'
                                    ? index === 0 ? '参考样本' : index === 1 ? '风格关键词' : index === 2 ? '竞品观察' : '可借鉴方向'
                                    : index === 0 ? '核心概念' : index === 1 ? '视觉语言' : index === 2 ? '版式建议' : '执行建议',
                        fontSize: 14,
                        color: '#6B7280',
                    },
                    {
                        id: uuidv4(),
                        type: 'shape' as const,
                        shapeType: 'square' as const,
                        x: cardX - 18,
                        y: cardY - 18,
                        width: preset.cardWidth,
                        height: resolvedMode === 'research' ? 150 : 96,
                        color: resolvedMode === 'branding' ? '#FEF3C7' : resolvedMode === 'image-editing' ? '#DCFCE7' : resolvedMode === 'research' ? '#E0E7FF' : '#EFF6FF',
                    },
                    {
                        id: uuidv4(),
                        type: 'text' as const,
                        x: cardX,
                        y: cardY,
                        width: preset.cardWidth - 36,
                        content: `${typeof section?.title === 'string' ? section.title : `Section ${index + 1}`}\n${typeof section?.body === 'string' ? section.body : ''}`,
                        fontSize: 16,
                    },
                ];
            })
            : [];

        if (sectionCards.length > 0) {
            nextNodes.push({
                id: uuidv4(),
                type: 'shape',
                shapeType: 'square',
                x: baseX - 28,
                y: baseY - 28,
                width: resolvedMode === 'research' ? 760 : 520,
                height: 92,
                color: resolvedMode === 'branding' ? '#FFF7ED' : resolvedMode === 'image-editing' ? '#ECFDF5' : resolvedMode === 'research' ? '#F5F3FF' : '#F8FAFC',
            });
            nextNodes.push({
                id: uuidv4(),
                type: 'text',
                x: baseX,
                y: baseY,
                width: 560,
                content: typeof plan.recommendedTitle === 'string' ? plan.recommendedTitle : prompt,
                fontSize: 34,
            });
            nextNodes.push({
                id: uuidv4(),
                type: 'text',
                x: baseX,
                y: baseY + 56,
                width: 620,
                content: typeof result.summary === 'string' ? result.summary : result.reply,
                fontSize: 18,
                color: '#6B7280',
            });
            nextNodes.push(...sectionCards);
        } else if (Array.isArray(plan.createTextNodes)) {
            nextNodes.push(...plan.createTextNodes.map((item, index) => ({
                id: uuidv4(),
                type: 'text' as const,
                x: typeof item?.x === 'number' ? item.x : baseX,
                y: typeof item?.y === 'number' ? item.y : baseY + index * 120,
                content: typeof item?.content === 'string' ? item.content : 'New text',
                fontSize: typeof item?.fontSize === 'number' ? item.fontSize : index === 0 ? 32 : 18,
            })));
        }

        let imageGeneratorId: string | null = null;
        if (plan.createImageGenerator || resolvedMode === 'design' || resolvedMode === 'image-editing') {
            const imageNode = createImageGeneratorElement();
            imageGeneratorId = imageNode.id;
            nextNodes.push({
                ...imageNode,
                x: preset.generatorX,
                y: preset.generatorY,
                initialPrompt: prompt,
                prompt,
            });
        }

        let videoGeneratorId: string | null = null;
        if (plan.createVideoGenerator || resolvedMode === 'research') {
            const videoNode = createVideoGeneratorElement();
            videoGeneratorId = videoNode.id;
            nextNodes.push({
                ...videoNode,
                x: resolvedMode === 'research' ? preset.generatorX : preset.generatorX,
                y: resolvedMode === 'research' ? preset.generatorY : preset.generatorY + 360,
                initialPrompt: prompt,
                prompt,
            });
        }

        if (resolvedMode === 'branding' && !nextNodes.some((node) => node.type === 'image-generator')) {
            const imageNode = createImageGeneratorElement();
            imageGeneratorId = imageNode.id;
            nextNodes.push({
                ...imageNode,
                x: preset.generatorX,
                y: preset.generatorY,
                initialPrompt: prompt,
                prompt,
            });
        }

        setAgentStage('building');

        const firstTextNode = nextNodes.find((node) => node.type === 'text');
        const sectionTextNodes = nextNodes.filter((node) => node.type === 'text').slice(2);
        if (firstTextNode && sectionTextNodes.length > 0) {
            nextNodes.push({
                id: uuidv4(),
                type: 'connector',
                x: 0,
                y: 0,
                connectorFrom: firstTextNode.id,
                connectorTo: sectionTextNodes[0].id,
                connectorStyle: 'dashed',
                color: '#94A3B8',
            });
        }
        if (sectionTextNodes.length > 0 && imageGeneratorId) {
            nextNodes.push({
                id: uuidv4(),
                type: 'connector',
                x: 0,
                y: 0,
                connectorFrom: sectionTextNodes[Math.min(1, sectionTextNodes.length - 1)].id,
                connectorTo: imageGeneratorId,
                connectorStyle: 'dashed',
                color: '#94A3B8',
            });
        }
        if (sectionTextNodes.length > 0 && videoGeneratorId) {
            nextNodes.push({
                id: uuidv4(),
                type: 'connector',
                x: 0,
                y: 0,
                connectorFrom: sectionTextNodes[sectionTextNodes.length - 1].id,
                connectorTo: videoGeneratorId,
                connectorStyle: 'dashed',
                color: '#94A3B8',
            });
        }

        if (nextNodes.length > 0) {
            setElements((prev) => [...prev, ...nextNodes]);
            const preferredSelection = nextNodes.find((node) => node.type !== 'shape' && node.type !== 'connector') || nextNodes[0];
            setSelectedIds([preferredSelection.id]);
        }

        setAgentStage('idle');
        return result.reply;
    }, [createImageGeneratorElement, createVideoGeneratorElement, handleAiChat, pan.x, pan.y, setElements, setSelectedIds, setTitle]);

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

        const syncViewportSize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };

        syncViewportSize();
        window.addEventListener('resize', syncViewportSize);
        return () => window.removeEventListener('resize', syncViewportSize);
    }, []);

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

    const miniMapData = useMemo(() => {
        const drawableElements = elements.filter((element) => element.type !== 'connector');
        if (drawableElements.length === 0) {
            return {
                bounds: { left: -800, top: -600, right: 800, bottom: 600 },
                viewport: {
                    left: -viewportSize.width / 2,
                    top: -viewportSize.height / 2,
                    right: viewportSize.width / 2,
                    bottom: viewportSize.height / 2,
                },
                nodes: [] as typeof drawableElements,
            };
        }

        const left = Math.min(...drawableElements.map((el) => el.x));
        const top = Math.min(...drawableElements.map((el) => el.y));
        const right = Math.max(...drawableElements.map((el) => el.x + (el.width || 120)));
        const bottom = Math.max(...drawableElements.map((el) => el.y + (el.height || 120)));
        const padding = 240;
        return {
            bounds: { left: left - padding, top: top - padding, right: right + padding, bottom: bottom + padding },
            viewport: {
                left: -pan.x / scale,
                top: -pan.y / scale,
                right: (viewportSize.width - pan.x) / scale,
                bottom: (viewportSize.height - pan.y) / scale,
            },
            nodes: drawableElements,
        };
    }, [elements, pan.x, pan.y, scale, viewportSize.height, viewportSize.width]);

    const handleUseAsVideoReference = useCallback((asset: ProjectAsset) => {
        const activeGenerator = elements.find((element) => selectedIds.length === 1 && element.id === selectedIds[0] && element.type === 'video-generator');
        if (!activeGenerator) return;
        handleElementChange(activeGenerator.id, { referenceImageId: asset.elementId });
    }, [elements, handleElementChange, selectedIds]);

    const handleMiniMapNavigate = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
        const { bounds, viewport } = miniMapData;
        const width = Math.max(1, bounds.right - bounds.left);
        const height = Math.max(1, bounds.bottom - bounds.top);
        const relativeX = Math.min(Math.max(0, clientX - rect.left), rect.width) / rect.width;
        const relativeY = Math.min(Math.max(0, clientY - rect.top), rect.height) / rect.height;

        const viewportWidth = viewport.right - viewport.left;
        const viewportHeight = viewport.bottom - viewport.top;
        const targetCenterX = bounds.left + relativeX * width;
        const targetCenterY = bounds.top + relativeY * height;
        const unclampedLeft = targetCenterX - viewportWidth / 2;
        const unclampedTop = targetCenterY - viewportHeight / 2;
        const minLeft = bounds.left;
        const maxLeft = Math.max(bounds.left, bounds.right - viewportWidth);
        const minTop = bounds.top;
        const maxTop = Math.max(bounds.top, bounds.bottom - viewportHeight);
        const targetLeft = Math.min(Math.max(unclampedLeft, minLeft), maxLeft);
        const targetTop = Math.min(Math.max(unclampedTop, minTop), maxTop);

        setPan({
            x: -targetLeft * scale,
            y: -targetTop * scale,
        });
    }, [miniMapData, scale, setPan]);

    const handleMiniMapFocusElement = useCallback((element: CanvasElement) => {
        const centerX = element.x + (element.width || 120) / 2;
        const centerY = element.y + (element.height || 90) / 2;
        setSelectedIds([element.id]);
        setPan({
            x: viewportSize.width / 2 - centerX * scale,
            y: viewportSize.height / 2 - centerY * scale,
        });
    }, [scale, setPan, viewportSize.height, viewportSize.width]);

    const handleFitCanvas = useCallback(() => {
        const { bounds } = miniMapData;
        const contentWidth = Math.max(1, bounds.right - bounds.left);
        const contentHeight = Math.max(1, bounds.bottom - bounds.top);
        const padding = 96;
        const nextScale = Math.min(
            3,
            Math.max(
                0.2,
                Math.min(
                    (viewportSize.width - padding * 2) / contentWidth,
                    (viewportSize.height - padding * 2) / contentHeight,
                ),
            ),
        );

        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        zoomTo(nextScale, { x: viewportSize.width / 2, y: viewportSize.height / 2 });
        window.setTimeout(() => {
            setPan({
                x: viewportSize.width / 2 - centerX * nextScale,
                y: viewportSize.height / 2 - centerY * nextScale,
            });
        }, 0);
    }, [miniMapData, setPan, viewportSize.height, viewportSize.width, zoomTo]);

    const getStoryboardSequenceState = useCallback((index: number, total: number): 'single' | 'first' | 'middle' | 'last' => {
        if (total <= 1) return 'single';
        if (index === 0) return 'first';
        if (index === total - 1) return 'last';
        return 'middle';
    }, []);

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

    const handleAddToStoryboard = useCallback((asset: ProjectAsset) => {
        setStoryboard((prev) => {
            if (prev.some((item) => item.assetId === asset.id)) {
                return prev;
            }
            const aspectRatio = asset.aspectRatio ?? inferStoryboardAspectRatio(asset.width, asset.height);
            const aspectMeta = getStoryboardAspectMeta(aspectRatio);

            const nextStoryboard = normalizeStoryboardItems([
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

            if (prev.length === 0) {
                setStoryboardLayout(getRecommendedStoryboardLayout(nextStoryboard));
            }

            return nextStoryboard;
        });
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
            const normalized = normalizeStoryboardItems(prev.filter((item) => item.id !== itemId));
            syncStoryboardLinkedElements(normalized, storyboardLayout);
            return normalized;
        });
    }, [storyboardLayout, syncStoryboardLinkedElements]);

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
        const boardMode = getStoryboardBoardMode(layoutMode, sequenceState);
        const sequenceHint = getStoryboardSequenceHint(layoutMode, sequenceState);
        const frameDeltaLabel = getStoryboardFrameDeltaLabel(item.sourceAspectRatio ?? resolvedAspectRatio, resolvedAspectRatio);
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
                storyboardMeta: formatStoryboardMeta(resolvedAspectRatio, item.durationSec ?? 5, item.renderProfile ?? renderProfile),
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
            storyboardMeta: formatStoryboardMeta(resolvedAspectRatio, item.durationSec ?? 5, item.renderProfile ?? renderProfile),
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
        const orientationMix = storyboard.reduce((acc, item) => {
            const orientation = getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation;
            acc[orientation] += 1;
            return acc;
        }, { portrait: 0, landscape: 0, square: 0 });
        const hasMixedFrames = [orientationMix.portrait, orientationMix.landscape, orientationMix.square].filter((count) => count > 0).length > 1;
        const maxWidth = nodeSizes.reduce((max, size) => Math.max(max, size.width), 320);
        const maxHeight = nodeSizes.reduce((max, size) => Math.max(max, size.height), 320);
        const horizontalGap = hasMixedFrames ? 128 : 112;
        const verticalGap = hasMixedFrames ? 96 : 84;
        const boardPaddingX = storyboardLayout === 'horizontal' ? (hasMixedFrames ? 84 : 64) : (hasMixedFrames ? 64 : 48);
        const boardPaddingY = storyboardLayout === 'horizontal' ? (hasMixedFrames ? 64 : 52) : (hasMixedFrames ? 52 : 40);
        const orientationLaneMap = hasMixedFrames
            ? storyboard.reduce((acc, item) => {
                const orientation = getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation;
                if (!(orientation in acc)) {
                    acc[orientation] = Object.keys(acc).length;
                }
                return acc;
            }, {} as Partial<Record<'portrait' | 'landscape' | 'square', number>>)
            : {};
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
        const boardSummary = summarizeProductionBoard(storyboard);
        const recommendedLayout = boardSummary.recommendedLayout;
        const layoutBiasX = storyboardLayout === 'horizontal' && recommendedLayout !== 'horizontal' ? 12 : 0;
        const layoutBiasY = storyboardLayout === 'vertical' && recommendedLayout !== 'vertical' ? 12 : 0;
        const boardOrientationSummary = [
            orientationMix.portrait > 0 ? `Portrait × ${orientationMix.portrait}` : null,
            orientationMix.landscape > 0 ? `Landscape × ${orientationMix.landscape}` : null,
            orientationMix.square > 0 ? `Square × ${orientationMix.square}` : null,
        ].filter(Boolean).join(' · ');
        const boardSurfaceElement: CanvasElement = {
            id: uuidv4(),
            type: 'shape',
            shapeType: 'square',
            storyboardElementRole: 'board-surface',
            x: boardBaseX - 16,
            y: boardBaseY - 20,
            width: boardMetrics.width + boardPaddingX * 2 + 32,
            height: boardMetrics.height + boardPaddingY * 2 + 40,
            color: '#f8fafc',
            borderRadius: 30,
        };

        const boardAccentElement: CanvasElement = {
            id: uuidv4(),
            type: 'text',
            storyboardElementRole: 'board-header',
            x: boardBaseX,
            y: boardBaseY - 84,
            width: Math.max(360, Math.min(boardMetrics.width + boardPaddingX * 2, 760)),
            height: 88,
            content: `${boardSummary.boardTitle}｜${storyboard.length} 个镜头｜${recommendedLayout === storyboardLayout ? '布局已对齐' : `建议切换${recommendedLayout === 'horizontal' ? '横向流程' : '纵向队列'}`}｜${hasMixedFrames ? '自适应画幅' : '统一画幅'}｜${boardOrientationSummary || '竖版 × 0'}｜${boardSummary.laneSummary}｜${boardSummary.reviewRailSummary}｜${boardSummary.coverageSummary}｜${boardSummary.renderSummary}｜${boardSummary.durationSummary}｜${boardSummary.frameSummary}｜${boardSummary.boardSubtitle}`,
            fontSize: 14,
            color: '#0f172a',
            backgroundColor: '#ffffff',
            borderRadius: 18,
            strokeWidth: 1,
            strokeStyle: 'solid',
            borderColor: recommendedLayout === storyboardLayout ? '#86efac' : '#fcd34d',
        };

        const laneCount = Math.max(1, Object.keys(orientationLaneMap).length);
        const laneElements: CanvasElement[] = hasMixedFrames
            ? (Object.entries(orientationLaneMap) as Array<["portrait" | "landscape" | "square", number | undefined]>)
                .filter(([, laneIndex]) => typeof laneIndex === 'number')
                .flatMap(([orientation, laneIndex]) => {
                    const lane = laneIndex ?? 0;
                    const horizontalLaneHeight = Math.max(140, (boardMetrics.height + boardPaddingY * 2 - 48 - (laneCount - 1) * 16) / laneCount);
                    const verticalLaneWidth = Math.max(220, (boardMetrics.width + boardPaddingX * 2 - 48 - (laneCount - 1) * 18) / laneCount);
                    const laneX = storyboardLayout === 'horizontal'
                        ? boardBaseX + 18
                        : boardBaseX + 20 + lane * (verticalLaneWidth + 18);
                    const laneY = storyboardLayout === 'horizontal'
                        ? boardBaseY + 24 + lane * (horizontalLaneHeight + 16)
                        : boardBaseY + 22;
                    const laneWidth = storyboardLayout === 'horizontal'
                        ? boardMetrics.width + boardPaddingX * 2 - 36
                        : verticalLaneWidth;
                    const laneHeight = storyboardLayout === 'horizontal'
                        ? horizontalLaneHeight
                        : boardMetrics.height + boardPaddingY * 2 - 44;
                    return [
                        {
                            id: uuidv4(),
                            type: 'shape',
                            shapeType: 'square',
                            storyboardElementRole: 'board-lane',
                            storyboardLaneOrientation: orientation,
                            x: laneX,
                            y: laneY,
                            width: laneWidth,
                            height: laneHeight,
                            color: '#ffffff',
                        },
                        {
                            id: uuidv4(),
                            type: 'text',
                            storyboardElementRole: 'board-lane-label',
                            storyboardLaneOrientation: orientation,
                            x: laneX + 12,
                            y: laneY + 10,
                            width: 180,
                            height: 24,
                            content: `${orientation.toUpperCase()} LANE`,
                            fontSize: 11,
                            color: orientation === 'landscape' ? '#7c3aed' : orientation === 'square' ? '#059669' : '#0284c7',
                        },
                    ] as CanvasElement[];
                })
            : [];

        let cursorX = baseX;
        let cursorY = baseY;
        const flows = storyboard.map((item, index) => {
            const nodeSize = nodeSizes[index];
            const itemOrientation = getStoryboardAspectMeta(item.aspectRatio ?? '9:16').orientation;
            const laneIndex = orientationLaneMap[itemOrientation] ?? 0;
            const laneTrackOffsetX = hasMixedFrames && storyboardLayout !== 'horizontal'
                ? laneIndex * Math.max(220, (boardMetrics.width + boardPaddingX * 2 - 48 - (laneCount - 1) * 18) / laneCount + 18)
                : 0;
            const laneTrackOffsetY = hasMixedFrames && storyboardLayout === 'horizontal'
                ? laneIndex * Math.max(140, (boardMetrics.height + boardPaddingY * 2 - 48 - (laneCount - 1) * 16) / laneCount + 16)
                : 0;
            const laneOffsetX = storyboardLayout === 'horizontal'
                ? (hasMixedFrames ? (itemOrientation === 'portrait' ? 24 : itemOrientation === 'square' ? 12 : 0) : 0)
                : laneTrackOffsetX + (hasMixedFrames ? 12 : 0);
            const laneOffsetY = storyboardLayout === 'horizontal'
                ? laneTrackOffsetY + (hasMixedFrames ? 18 : 0)
                : (hasMixedFrames ? (itemOrientation === 'landscape' ? 14 : itemOrientation === 'square' ? 8 : 0) : 0);
            const x = storyboardLayout === 'horizontal'
                ? cursorX + laneOffsetX + layoutBiasX
                : boardBaseX + 30 + laneOffsetX + layoutBiasX;
            const y = storyboardLayout === 'horizontal'
                ? boardBaseY + 42 + laneOffsetY + layoutBiasY
                : cursorY + laneOffsetY + layoutBiasY;

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

        setElements((prev) => [boardSurfaceElement, ...prev, ...laneElements, boardAccentElement, ...flows.flatMap((flow) => flow.elementsToAdd)]);
        setSelectedIds([boardAccentElement.id, ...flows.map((flow) => flow.selectedId)]);
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

            {agentStage !== 'idle' && (
                <div className="absolute top-16 left-1/2 z-50 -translate-x-1/2 rounded-full border border-sky-200 bg-white/92 px-4 py-2 text-sm font-medium text-sky-700 shadow-[0_14px_34px_rgba(14,165,233,0.14)] backdrop-blur-xl dark:border-sky-400/20 dark:bg-slate-950/86 dark:text-sky-200">
                    {agentStage === 'analyzing' ? 'Agent 正在分析需求…' : agentStage === 'planning' ? 'Agent 正在规划工作区…' : 'Agent 正在搭建节点…'}
                </div>
            )}

            {showChat && (
                <div className="absolute right-4 top-20 bottom-4 w-[400px] z-40 animate-in slide-in-from-right-4 duration-300">
                    <AiDesignerPanel
                        onGenerate={handleAgentGenerate}
                        isGenerating={isGenerating}
                        onClose={() => setShowChat(false)}
                        initialPrompt={promptFromUrl}
                        initialMode={agentModeFromUrl}
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
                    onElementsChange={handleElementsChange}
                    onDelete={handleDelete}
                    onDeleteMany={handleDeleteMany}
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
                        onNormalizeAllStoryboardOutputSizes={handleNormalizeAllStoryboardOutputSizes}
                        onApplyStoryboardBoardPreset={handleApplyStoryboardBoardPreset}
                        onAutoStoryboardLayout={handleAutoStoryboardLayout}
                        onUpdateAllStoryboardAspectRatios={(aspectRatio) => {
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
                        }}
                        onResetAllStoryboardAspectRatiosFromAssets={() => {
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
                        }}
                        storyboardLayout={storyboardLayout}
                        onStoryboardLayoutChange={(layout) => {
                            setStoryboardLayout(layout);
                            syncStoryboardLinkedElements(storyboard, layout);
                        }}
                        onCreateVideoFromStoryboard={handleCreateVideoFromStoryboard}
                        onCreateStoryboardFlow={handleCreateStoryboardFlow}
                    />
                </div>

                <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-3">
                    {showMiniMap && (() => {
                        const { bounds, viewport, nodes } = miniMapData;
                        const mapWidth = 208;
                        const mapHeight = 144;
                        const boundsWidth = Math.max(1, bounds.right - bounds.left);
                        const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
                        const toMapX = (value: number) => ((value - bounds.left) / boundsWidth) * mapWidth;
                        const toMapY = (value: number) => ((value - bounds.top) / boundsHeight) * mapHeight;
                        return (
                            <div className="w-[220px] rounded-[22px] border border-gray-200/90 bg-white/96 p-3 shadow-[0_20px_50px_rgba(15,23,42,0.15)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/82 dark:shadow-[0_28px_70px_rgba(0,0,0,0.5)]">
                                <div className="mb-2 flex items-center justify-between px-1">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">小地图</div>
                                        <div className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">点节点聚焦 · 拖框导航</div>
                                    </div>
                                    <button
                                        onClick={handleFitCanvas}
                                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-white/10 dark:bg-white/6 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                                        title="适配全部内容"
                                    >
                                        Fit
                                    </button>
                                </div>
                                <div
                                    ref={miniMapRef}
                                    className={`relative overflow-hidden rounded-2xl border border-gray-200/90 bg-[radial-gradient(circle_at_top,_rgba(186,230,253,0.28),_rgba(255,255,255,0.98))] shadow-inner transition-all dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.96),_rgba(2,6,23,0.98))] ${isMiniMapDragging ? 'cursor-grabbing ring-2 ring-sky-300/50 dark:ring-sky-400/30' : 'cursor-pointer hover:border-sky-200 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_8px_24px_rgba(14,165,233,0.08)] dark:hover:border-sky-400/20'}`}
                                    style={{ width: mapWidth, height: mapHeight }}
                                    onMouseDown={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setIsMiniMapDragging(true);
                                        handleMiniMapNavigate(e.clientX, e.clientY, rect);
                                    }}
                                    onMouseMove={(e) => {
                                        if (!isMiniMapDragging) return;
                                        handleMiniMapNavigate(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
                                    }}
                                    onMouseUp={() => setIsMiniMapDragging(false)}
                                    onMouseLeave={() => setIsMiniMapDragging(false)}
                                >
                                    {nodes.map((node) => {
                                        const width = Math.max(6, ((node.width || 120) / boundsWidth) * mapWidth);
                                        const height = Math.max(6, ((node.height || 90) / boundsHeight) * mapHeight);
                                        const isSelected = selectedIds.includes(node.id);
                                        const tone = node.type === 'image' || node.type === 'video'
                                            ? 'border-emerald-300/80 bg-emerald-400/22 dark:border-emerald-300/50 dark:bg-emerald-400/16'
                                            : node.type === 'image-generator' || node.type === 'video-generator'
                                                ? 'border-violet-300/80 bg-violet-400/22 dark:border-violet-300/50 dark:bg-violet-400/16'
                                                : 'border-sky-300/80 bg-sky-400/22 dark:border-sky-300/50 dark:bg-sky-400/16';
                                        return (
                                            <button
                                                key={node.id}
                                                type="button"
                                                className={`absolute rounded-[4px] border transition-all hover:z-10 hover:brightness-110 hover:shadow-sm ${tone} ${isSelected ? 'ring-1 ring-blue-500/60 dark:ring-sky-300/60' : ''} ${miniMapHoveredId === node.id ? 'scale-[1.04]' : ''}`}
                                                style={{
                                                    left: toMapX(node.x),
                                                    top: toMapY(node.y),
                                                    width,
                                                    height,
                                                }}
                                                title={node.storyboardTitle || node.prompt || node.type}
                                                onMouseEnter={() => setMiniMapHoveredId(node.id)}
                                                onMouseLeave={() => setMiniMapHoveredId((current) => (current === node.id ? null : current))}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    handleMiniMapFocusElement(node);
                                                }}
                                            />
                                        );
                                    })}
                                    <div
                                        className="absolute rounded-xl border border-blue-500/90 bg-blue-400/10 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_8px_20px_rgba(59,130,246,0.12)] transition-shadow dark:border-sky-300/90 dark:bg-sky-400/10 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.22),0_10px_24px_rgba(56,189,248,0.12)]"
                                        style={{
                                            left: toMapX(viewport.left),
                                            top: toMapY(viewport.top),
                                            width: Math.max(24, ((viewport.right - viewport.left) / boundsWidth) * mapWidth),
                                            height: Math.max(20, ((viewport.bottom - viewport.top) / boundsHeight) * mapHeight),
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setIsMiniMapDragging(true);
                                        }}
                                    >
                                        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500/80 bg-white shadow-sm dark:border-sky-300/80 dark:bg-slate-950" />
                                    </div>
                                    {miniMapHoveredId && (() => {
                                        const hoveredNode = nodes.find((node) => node.id === miniMapHoveredId);
                                        if (!hoveredNode) return null;
                                        return (
                                            <div className="absolute left-2 top-2 rounded-lg border border-gray-200/90 bg-white/96 px-2 py-1 text-[10px] text-gray-600 shadow-sm dark:border-white/10 dark:bg-slate-950/92 dark:text-slate-300">
                                                {hoveredNode.storyboardTitle || hoveredNode.prompt || hoveredNode.type}
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="mt-2 flex items-center gap-3 px-1 text-[10px] text-gray-400 dark:text-slate-500">
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />媒体</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" />生成器</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" />其他</span>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="flex items-center rounded-[20px] border border-gray-200/90 bg-white/94 p-1.5 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/78 dark:shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
                        <button
                            onClick={() => setShowMiniMap((prev) => !prev)}
                            className={`rounded-xl p-2 transition-all ${showMiniMap ? 'bg-sky-100 text-sky-700 shadow-[0_0_0_1px_rgba(14,165,233,0.14)] dark:bg-sky-400/14 dark:text-sky-200 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.16)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200'}`}
                            title="切换小地图"
                        >
                            <MapIcon size={16} />
                        </button>
                        <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-white/10" />
                        <button onClick={() => zoomOut()} className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200">
                            <Minus size={16} />
                        </button>
                        <button
                            onClick={() => zoomTo(1, { x: viewportSize.width / 2, y: viewportSize.height / 2 })}
                            className="min-w-[3.4rem] rounded-lg px-2 py-1 text-center text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-white"
                            title="回到 100%"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <button onClick={() => zoomIn()} className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200">
                            <Plus size={16} />
                        </button>
                    </div>
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
