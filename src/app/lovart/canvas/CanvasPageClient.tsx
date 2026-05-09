"use client";

import React, { useMemo, useState, Suspense, useRef, useCallback } from 'react';
import { Plus, Minus, ChevronDown, Sparkles, Cloud, CloudOff, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'next/navigation';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { CanvasArea, CanvasElement, type GenerationMetadata } from '@/components/lovart/CanvasArea';
import { ImageGeneratorPanel } from '@/components/lovart/ImageGeneratorPanel';
import { VideoGeneratorPanel, startVideoGeneration, getVideoGenerationStatus, type VideoModelMode } from '@/components/lovart/VideoGeneratorPanel';
import { AiDesignerPanel } from '@/components/lovart/AiDesignerPanel';
import { AssetsPanel } from '@/components/lovart/AssetsPanel';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useCanvasViewport } from '@/hooks/useCanvasViewport';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useCanvasElements } from '@/hooks/useCanvasElements';
import { useProjectAssets, type ProjectAsset, type StoryboardItem, type StoryboardAspectRatio, type StoryboardLayoutMode, type StoryboardVideoSize, inferStoryboardAspectRatio, normalizeStoryboardItems, getStoryboardAspectMeta, inferStoryboardAspectRatioFromVideoSize, getStoryboardRenderProfile, formatStoryboardMeta, getStoryboardBoardMode, getStoryboardSequenceHint, getStoryboardFrameDeltaLabel, summarizeProductionBoard } from '@/hooks/useProjectAssets';
import { useCanvasGeneration, requestImageGeneration, type Resolution, type AspectRatio } from '@/hooks/useCanvasGeneration';
import { getImageDimensions, getSmartDisplaySize } from '@/lib/imageSizing';
import { useCanvasImageActions } from '@/hooks/useCanvasImageActions';
import { useObjectAnnotation } from '@/hooks/useObjectAnnotation';
import { useAgentRunner } from '@/hooks/useAgentRunner';
import { useAgentContext } from '@/hooks/useAgentContext';
import { useViewportSize } from '@/hooks/useViewportSize';
import { useCanvasHistory } from '@/hooks/useCanvasHistory';
import { useStoryboardManager } from '@/hooks/useStoryboardManager';
import type { DraftCanvasElement, AgentMode, AgentPanelResponse, AgentActionResult } from '@/lib/agent/actions';
import { v4 as uuidv4 } from 'uuid';

function LovartCanvasContent() {
    const buildAgentActionMeta = useCallback((result: AgentActionResult): Array<{ label: string; value: string }> => {
        switch (result.kind) {
            case 'storyboard_created':
                return [
                    { label: '动作', value: '创建分镜' },
                    { label: '数量', value: `${result.count} 镜` },
                ];
            case 'storyboard_board_requested':
                return [
                    { label: '动作', value: '生成制作板' },
                    { label: '数量', value: `${result.count} 项` },
                ];
            case 'images_generated':
                return [
                    { label: '动作', value: '批量生图' },
                    { label: '数量', value: `${result.count} 张` },
                ];
            case 'storyboard_image_generation_requested':
                return [
                    { label: '动作', value: '分镜出图' },
                    { label: '镜头', value: `第 ${result.storyboardOrder} 镜` },
                    { label: '比例', value: result.aspectRatio },
                    { label: '清晰度', value: result.resolution },
                ];
            case 'storyboard_video_generation_requested':
                return [
                    { label: '动作', value: '分镜视频' },
                    { label: '镜头', value: `第 ${result.storyboardOrder} 镜` },
                    { label: '尺寸', value: result.size },
                    { label: '时长', value: `${result.durationSeconds}s` },
                ];
            case 'video_started':
                return [
                    { label: '动作', value: '视频任务' },
                    { label: 'Task', value: result.taskId },
                    ...(result.status ? [{ label: '状态', value: result.status }] : []),
                ];
            case 'canvas_update_planned':
                return [
                    { label: '动作', value: '加入画布' },
                    { label: '目标', value: result.target },
                    { label: '元素', value: `${result.elementDrafts.length} 个` },
                ];
            case 'image_edited':
                return [
                    { label: '动作', value: '编辑图片' },
                    { label: '资源', value: result.assetId.slice(0, 8) },
                ];
            default:
                return [];
        }
    }, []);
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
    const agentModeFromUrl = useMemo(() => (searchParams.get('mode') as AgentMode | null) || 'design', [searchParams]);
    const [showChat, setShowChat] = useState(Boolean(promptFromUrl));
    const [assetsCollapsed, setAssetsCollapsed] = useState(false);
    const [showMiniMap, setShowMiniMap] = useState(false);
    const [isMiniMapDragging, setIsMiniMapDragging] = useState(false);
    const [miniMapHoveredId, setMiniMapHoveredId] = useState<string | null>(null);
    const viewportSize = useViewportSize();
    const [agentStage, setAgentStage] = useState<'idle' | 'analyzing' | 'planning' | 'building' | 'done'>('idle');
    const [canvasBackground, setCanvasBackground] = useState('#F4F4F5');
    const [annotationSubject, setAnnotationSubject] = useState('');
    const [objectEditPrompt, setObjectEditPrompt] = useState('');
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

    const {
        activeImageId: annotationImageId,
        selectedObject: annotationObject,
        isDetecting: isDetectingObject,
        isEditing: isEditingObject,
        enterAnnotationMode,
        exitAnnotationMode,
        detectObject,
        editObject,
        setSelectedObject,
    } = useObjectAnnotation();

    const applyAgentPlanToCanvas = useCallback((input: {
        prompt: string;
        mode: AgentMode;
        reply: string;
        summary?: string;
        plan?: Record<string, unknown>;
    }) => {
        const resolvedMode = input.mode;
        const plan = input.plan || {};

        if (plan.recommendedTitle && typeof plan.recommendedTitle === 'string') {
            setTitle(plan.recommendedTitle);
        }

        const existingPlacedElements = elements.filter((element) => element.type !== 'connector');
        const offsetY = existingPlacedElements.length > 0
            ? Math.max(...existingPlacedElements.map((element) => element.y + (element.height || 120))) + 120
            : 140 - pan.y;
        const baseX = 140 - pan.x;
        const baseY = offsetY;
        const workspaceGroupId = uuidv4();
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
                content: typeof plan.recommendedTitle === 'string' ? plan.recommendedTitle : input.prompt,
                fontSize: 34,
            });
            nextNodes.push({
                id: uuidv4(),
                type: 'text',
                x: baseX,
                y: baseY + 56,
                width: 620,
                content: resolvedMode === 'branding'
                    ? `品牌工作区 · 从定位、调性到视觉方向\n${typeof input.summary === 'string' ? input.summary : input.reply}`
                    : resolvedMode === 'image-editing'
                        ? `图像编辑工作区 · 从问题诊断到修改执行\n${typeof input.summary === 'string' ? input.summary : input.reply}`
                        : resolvedMode === 'research'
                            ? `研究工作区 · 从参考采样到创意线索\n${typeof input.summary === 'string' ? input.summary : input.reply}`
                            : `设计工作区 · 从概念到生成执行\n${typeof input.summary === 'string' ? input.summary : input.reply}`,
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
                initialPrompt: input.prompt,
                prompt: input.prompt,
            });
        }

        let videoGeneratorId: string | null = null;
        if (plan.createVideoGenerator || resolvedMode === 'research') {
            const videoNode = createVideoGeneratorElement();
            videoGeneratorId = videoNode.id;
            nextNodes.push({
                ...videoNode,
                x: preset.generatorX,
                y: resolvedMode === 'research' ? preset.generatorY : preset.generatorY + 360,
                initialPrompt: input.prompt,
                prompt: input.prompt,
            });
        }

        if (resolvedMode === 'branding' && !nextNodes.some((node) => node.type === 'image-generator')) {
            const imageNode = createImageGeneratorElement();
            imageGeneratorId = imageNode.id;
            nextNodes.push({
                ...imageNode,
                x: preset.generatorX,
                y: preset.generatorY,
                initialPrompt: input.prompt,
                prompt: input.prompt,
            });
        }

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
            const groupedNodes = nextNodes.map((node) => node.type === 'connector' ? node : { ...node, groupId: workspaceGroupId });
            setElements((prev) => [...prev, ...groupedNodes]);
            const preferredSelection = groupedNodes.find((node) => node.type !== 'shape' && node.type !== 'connector') || groupedNodes[0];
            setSelectedIds([preferredSelection.id]);

            const placedNodes = groupedNodes.filter((node) => node.type !== 'connector');
            const left = Math.min(...placedNodes.map((node) => node.x));
            const top = Math.min(...placedNodes.map((node) => node.y));
            const right = Math.max(...placedNodes.map((node) => node.x + (node.width || 180)));
            const bottom = Math.max(...placedNodes.map((node) => node.y + (node.height || 100)));
            const centerX = (left + right) / 2;
            const centerY = (top + bottom) / 2;
            setPan({
                x: viewportSize.width / 2 - centerX * scale,
                y: viewportSize.height / 2 - centerY * scale,
            });
        }
    }, [createImageGeneratorElement, createVideoGeneratorElement, elements, pan.x, pan.y, scale, setElements, setPan, setSelectedIds, setTitle, viewportSize.height, viewportSize.width]);

    const handleDetectObjectAt = useCallback((element: CanvasElement, point: { x: number; y: number }) => {
        void detectObject({ image: element, point })
            .then((detected) => {
                if (detected?.label) {
                    setAnnotationSubject(detected.label);
                }
            })
            .catch((error) => {
                setAnnotationSubject('');
                const message = error instanceof Error ? error.message : '对象识别失败';
                alert(message === 'NOT_AUTHENTICATED' ? '当前未登录或登录状态已过期，请先登录后再使用标记编辑。' : message);
            });
    }, [detectObject]);

    const handleAnnotateRegion = useCallback((element: CanvasElement, region: { x: number; y: number; width: number; height: number }) => {
        enterAnnotationMode(element);
        setSelectedObject({
            id: `manual-${Date.now()}`,
            label: annotationSubject.trim() || '已标记区域',
            score: 1,
            bbox: region,
        });
    }, [annotationSubject, enterAnnotationMode, setSelectedObject]);

    const handleApplyObjectEdit = useCallback(async () => {
        if (!annotationImageId || !annotationObject || !objectEditPrompt.trim()) return;
        const imageElement = elements.find((element) => element.id === annotationImageId);
        if (!imageElement) return;

        try {
            const result = await editObject({
                image: imageElement,
                object: {
                    ...annotationObject,
                    label: annotationSubject.trim() || annotationObject.label || '?????',
                },
                prompt: objectEditPrompt.trim(),
            });

            if (typeof result.imageData === 'string') {
                setElements((prev) => prev.map((element) => element.id === imageElement.id ? {
                    ...element,
                    previousContent: element.content,
                    content: result.imageData,
                    annotationLabel: annotationObject.label,
                    annotationScore: annotationObject.score,
                    annotationPolygon: annotationObject.polygon,
                    annotationMaskUrl: annotationObject.maskUrl,
                } : element));
            }

            setObjectEditPrompt('');
            alert('???????');
        } catch (error) {
            const message = error instanceof Error ? error.message : '对象编辑失败';
            alert(message === 'NOT_AUTHENTICATED' ? '当前未登录或登录状态已过期，请先登录后再使用标记编辑。' : message);
        }
    }, [annotationImageId, annotationObject, annotationSubject, editObject, elements, objectEditPrompt, setElements]);

    const handleRevertObjectEdit = useCallback(() => {
        if (!annotationImageId) return;
        setElements((prev) => prev.map((element) => {
            if (element.id !== annotationImageId || !element.previousContent) return element;
            return {
                ...element,
                content: element.previousContent,
                previousContent: undefined,
            };
        }));
    }, [annotationImageId, setElements]);

    const handleDropImages = useCallback((files: File[], point: { x: number; y: number }) => {
        files.forEach((file, index) => {
            handleAddImage(file, {
                x: point.x + index * 28,
                y: point.y + index * 28,
            });
        });
    }, [handleAddImage]);

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
    const {
        storyboard,
        setStoryboard,
        selectedStoryboardItemId,
        setSelectedStoryboardItemId,
        storyboardLayout,
        setStoryboardLayout,
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
        buildStoryboardLinkedElementPatch,
        getStoryboardNodeSize,
    } = useStoryboardManager({
        projectId,
        elements,
        setElements,
        setSelectedIds,
        projectAssets,
    });
    const agentContext = useAgentContext({
        page: 'canvas',
        projectId,
        selectedIds,
        elements,
        assetIds: projectAssets.map((asset) => asset.id),
        selectedObject: annotationObject,
        selectedStoryboardItemId,
        storyboardCount: storyboard.length,
        storyboardItems: storyboard.map((item) => ({
            id: item.id,
            order: item.order,
            title: item.title,
            sourcePrompt: item.sourcePrompt,
            aspectRatio: item.aspectRatio,
            outputSize: item.outputSize,
            thumbnailUrl: item.thumbnailUrl,
        })),
    });
    const { runAgent, isRunning: isAgentRunning } = useAgentRunner();


    const handleInsertAsset = useCallback((asset: ProjectAsset) => {
        const resolvedAspectRatio = asset.aspectRatio ?? inferStoryboardAspectRatio(asset.width, asset.height);
        const aspectMeta = getStoryboardAspectMeta(resolvedAspectRatio);
        const width = asset.width || aspectMeta.canvasWidth;
        const height = asset.height || aspectMeta.canvasHeight;
        const x = (window.innerWidth / 2 - pan.x) / scale - width / 2;
        const y = (window.innerHeight / 2 - 56 - pan.y) / scale - height / 2;

        appendElement(buildCanvasElementBase({
            id: uuidv4(),
            type: asset.type,
            x,
            y,
            width,
            height,
            content: asset.url,
            prompt: asset.prompt,
        }));
    }, [appendElement, buildCanvasElementBase, pan.x, pan.y, scale]);

    const centerPanForElement = useCallback((element: { x: number; y: number; width?: number; height?: number }, options?: { chromeOffset?: number; viewportWidth?: number; viewportHeight?: number }) => ({
        x: (options?.viewportWidth ?? window.innerWidth) / 2 - ((element.x + (element.width || 300) / 2) * scale),
        y: (options?.viewportHeight ?? window.innerHeight) / 2 - (options?.chromeOffset ?? 56) - ((element.y + (element.height || 200) / 2) * scale),
    }), [scale]);

    const handleLocateAsset = useCallback((asset: ProjectAsset) => {
        const source = elements.find((element) => element.id === asset.elementId);
        if (!source) return;

        setSelectedIds([source.id]);
        setPan(centerPanForElement(source));
    }, [centerPanForElement, elements, setPan]);

    const handleLocateStoryboardItem = useCallback((item: StoryboardItem) => {
        setSelectedStoryboardItemId(item.id);
        const asset = projectAssets.find((entry) => entry.id === item.assetId);
        if (asset) {
            handleLocateAsset(asset);
            return;
        }

        const source = elements.find((element) => element.id === item.elementId);
        if (!source) return;
        setSelectedIds([source.id]);
        setPan(centerPanForElement(source));
    }, [centerPanForElement, elements, handleLocateAsset, projectAssets, setPan, setSelectedStoryboardItemId]);

    function buildCanvasElementBase(input: {
        id: string;
        type: CanvasElement['type'];
        x: number;
        y: number;
        width?: number;
        height?: number;
        content?: string;
        prompt?: string;
    }): CanvasElement {
        return {
            id: input.id,
            type: input.type,
            x: input.x,
            y: input.y,
            width: input.width,
            height: input.height,
            originalWidth: input.width,
            originalHeight: input.height,
            content: input.content,
            prompt: input.prompt,
        };
    }

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


    // eslint-disable-next-line react-hooks/exhaustive-deps -- This builder intentionally reads current canvas/storyboard state; refactoring this fragile file is higher risk than the lint warning.
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

    const handleUseAsImageReference = useCallback((asset: ProjectAsset) => {
        const activeGenerator = elements.find((element) => selectedIds.length === 1 && element.id === selectedIds[0] && element.type === 'image-generator');
        if (!activeGenerator) return;
        handleElementChange(activeGenerator.id, { referenceImageId: asset.elementId });
    }, [elements, handleElementChange, selectedIds]);

    useCanvasHistory({
        elements,
        storyboard,
        storyboardLayout,
        selectedStoryboardItemId,
        isLoading,
        selectedIds,
        setElements,
        setStoryboard,
        setStoryboardLayout,
        setSelectedIds,
        setSelectedStoryboardItemId,
        deleteElements: handleDeleteElements,
        saveProject,
    });

    const applyAgentCanvasDrafts = useCallback((drafts: DraftCanvasElement[]) => {
        setElements((prev) => [
            ...prev,
            ...drafts.map((draft): CanvasElement => buildCanvasElementBase({
                id: draft.id,
                type: draft.type,
                x: draft.x,
                y: draft.y,
                width: draft.width,
                height: draft.height,
                content: draft.content,
                prompt: draft.prompt,
            })),
        ]);
    }, [buildCanvasElementBase, setElements]);

    const buildAgentImageDrafts = useCallback((images: Array<{ imageData: string; prompt: string }>): DraftCanvasElement[] => {
        const timestamp = Date.now();
        return images.map((image, index) => ({
            id: `agent-image-draft-${index}-${timestamp}`,
            type: 'image',
            x: 120 + index * 284,
            y: 120,
            width: 260,
            height: 260,
            content: image.imageData,
            prompt: image.prompt,
            title: `Agent Image ${index + 1}`,
        }));
    }, []);

    const buildEditedImageDraft = useCallback((imageData: string, prompt: string): DraftCanvasElement => ({
        id: `agent-edited-draft-${Date.now()}`,
        type: 'image',
        x: 120,
        y: 120,
        width: 260,
        height: 260,
        content: imageData,
        prompt,
        title: 'Edited Image',
    }), []);

    const buildStoryboardSequenceState = useCallback((storyboardOrder: number) => {
        if (storyboard.length <= 1) return 'single' as const;
        if (storyboardOrder === 1) return 'first' as const;
        if (storyboardOrder === storyboard.length) return 'last' as const;
        return 'middle' as const;
    }, [storyboard.length]);

    const buildStoryboardGeneratorElement = useCallback((input: {
        id: string;
        type: 'image-generator' | 'video-generator';
        title: string;
        prompt: string;
        storyboardItemId: string;
        storyboardOrder: number;
        aspectRatio: StoryboardAspectRatio;
        outputSize: StoryboardVideoSize;
        width: number;
        height: number;
        renderProfile: ReturnType<typeof getStoryboardRenderProfile>;
        durationSec: number;
        orientation: ReturnType<typeof getStoryboardAspectMeta>['orientation'];
        sourceAspectRatio: StoryboardAspectRatio;
        sourceOutputSize: StoryboardVideoSize;
        sourceOrientation: ReturnType<typeof getStoryboardAspectMeta>['orientation'];
        content?: string;
        videoModelMode?: VideoModelMode;
    }): CanvasElement => {
        const sequenceState = buildStoryboardSequenceState(input.storyboardOrder);
        const linkedPatch = buildStoryboardLinkedElementPatch({
            id: input.storyboardItemId,
            assetId: '',
            elementId: input.id,
            title: input.title,
            type: input.type === 'video-generator' ? 'video' : 'image',
            thumbnailUrl: '',
            order: input.storyboardOrder - 1,
            sourcePrompt: input.prompt,
            durationSec: input.durationSec,
            aspectRatio: input.aspectRatio,
            orientation: input.orientation,
            outputSize: input.outputSize,
            renderProfile: input.renderProfile,
            sourceAspectRatio: input.sourceAspectRatio,
            sourceOrientation: input.sourceOrientation,
            sourceOutputSize: input.sourceOutputSize,
            createdAt: new Date().toISOString(),
        }, input.storyboardOrder - 1, storyboard.length, storyboardLayout);

        return {
            id: input.id,
            type: input.type,
            x: 120,
            y: 120,
            width: input.width,
            height: input.height,
            originalWidth: input.width,
            originalHeight: input.height,
            content: input.content,
            prompt: input.prompt,
            ...linkedPatch,
            storyboardItemId: input.storyboardItemId,
            storyboardTitle: input.title,
            storyboardBrief: input.prompt,
            storyboardAspectRatio: input.aspectRatio,
            storyboardVideoSize: input.outputSize,
            storyboardOrientation: input.orientation,
            storyboardSourceAspectRatio: input.sourceAspectRatio,
            storyboardSourceVideoSize: input.sourceOutputSize,
            storyboardSourceOrientation: input.sourceOrientation,
            storyboardRenderProfile: input.renderProfile,
            storyboardDurationSec: input.durationSec,
            storyboardShotIndex: input.storyboardOrder,
            storyboardShotCount: storyboard.length,
            storyboardSequenceState: sequenceState,
            storyboardSequenceHint: getStoryboardSequenceHint(storyboardLayout, sequenceState),
            storyboardBoardMode: getStoryboardBoardMode(storyboardLayout, sequenceState),
            videoModelMode: input.videoModelMode,
        };
    }, [buildStoryboardLinkedElementPatch, buildStoryboardSequenceState, storyboard.length, storyboardLayout]);

    const buildStoryboardAssetId = useCallback((kind: 'image' | 'video', storyboardItemId: string) => `agent-storyboard-${kind}-${storyboardItemId}-${Date.now()}`, []);

    const buildStoryboardItemResultPatch = useCallback((input: {
        item: StoryboardItem;
        elementId: string;
        assetId: string;
        thumbnailUrl: string;
        type: 'image' | 'video';
        sourcePrompt: string;
        aspectRatio: StoryboardAspectRatio;
        orientation: ReturnType<typeof getStoryboardAspectMeta>['orientation'];
        outputSize: StoryboardVideoSize;
        renderProfile: ReturnType<typeof getStoryboardRenderProfile>;
        sourceAspectRatio: StoryboardAspectRatio;
        sourceOrientation: ReturnType<typeof getStoryboardAspectMeta>['orientation'];
        sourceOutputSize: StoryboardVideoSize;
        durationSec?: number;
    }) => ({
        ...input.item,
        elementId: input.elementId,
        assetId: input.assetId,
        thumbnailUrl: input.thumbnailUrl,
        type: input.type,
        sourcePrompt: input.item.sourcePrompt || input.sourcePrompt,
        durationSec: input.durationSec ?? input.item.durationSec,
        aspectRatio: input.item.aspectRatio || input.aspectRatio,
        orientation: input.item.orientation || input.orientation,
        outputSize: input.item.outputSize || input.outputSize,
        renderProfile: input.item.renderProfile || input.renderProfile,
        sourceAspectRatio: input.item.sourceAspectRatio || input.sourceAspectRatio,
        sourceOrientation: input.item.sourceOrientation || input.sourceOrientation,
        sourceOutputSize: input.item.sourceOutputSize || input.sourceOutputSize,
    }), []);

    const buildStoryboardImageElementPatch = useCallback((input: {
        imageData: string;
        finalPrompt: string;
        displaySize: ReturnType<typeof getSmartDisplaySize>;
        generationMetadata: Record<string, unknown> | undefined;
        requestedResolution: Resolution;
        requestedAspectRatio: AspectRatio;
        returnedModelVariant?: 'standard' | 'pro' | 'gpt-image-2' | 'gpt-image-2-official';
        returnedProvider?: GenerationMetadata['provider'];
        returnedProviderMode?: GenerationMetadata['providerMode'];
        providerFallbackUsed?: boolean;
        fallbackFrom?: GenerationMetadata['fallbackFrom'];
        fallbackReason?: string;
        returnedModel?: string;
    }): Pick<CanvasElement, 'type' | 'content' | 'width' | 'height' | 'originalWidth' | 'originalHeight' | 'prompt' | 'generationMetadata' | 'requestedAspectRatio' | 'requestedResolution'> => ({
        type: 'image' as const,
        content: input.imageData,
        width: input.displaySize.width,
        height: input.displaySize.height,
        originalWidth: input.displaySize.originalWidth,
        originalHeight: input.displaySize.originalHeight,
        prompt: input.finalPrompt,
        generationMetadata: {
            ...input.generationMetadata,
            resolution: input.requestedResolution,
            aspectRatio: input.requestedAspectRatio,
            modelVariant: input.returnedModelVariant,
            provider: input.returnedProvider,
            providerMode: input.returnedProviderMode,
            providerFallbackUsed: input.providerFallbackUsed,
            fallbackFrom: input.fallbackFrom,
            fallbackReason: input.fallbackReason,
            model: input.returnedModel,
        },
        requestedAspectRatio: input.requestedAspectRatio,
        requestedResolution: input.requestedResolution,
    }), []);

    const buildStoryboardVideoProgressPatch = useCallback((input: {
        existingGenerationMetadata: CanvasElement['generationMetadata'];
        taskId: string;
        videoStatus?: string;
        progress?: number;
        model?: string;
        videoModelMode?: VideoModelMode;
    }) => ({
        generationMetadata: {
            ...(input.existingGenerationMetadata || {}),
            taskId: input.taskId,
            videoStatus: input.videoStatus ?? 'processing',
            progress: input.progress ?? 0,
            model: input.model,
            videoModelMode: input.videoModelMode,
        },
    }), []);

    const buildStoryboardVideoElementPatch = useCallback((input: {
        videoUrl: string;
        width?: number;
        height?: number;
        originalWidth?: number;
        originalHeight?: number;
        prompt: string;
        existingGenerationMetadata: CanvasElement['generationMetadata'];
        taskId: string;
        videoStatus: string;
        progress: number;
        model?: string;
        videoModelMode?: VideoModelMode;
    }) => ({
        type: 'video' as const,
        content: input.videoUrl,
        width: input.width,
        height: input.height,
        originalWidth: input.originalWidth,
        originalHeight: input.originalHeight,
        prompt: input.prompt,
        ...buildStoryboardVideoProgressPatch({
            existingGenerationMetadata: input.existingGenerationMetadata,
            taskId: input.taskId,
            videoStatus: input.videoStatus,
            progress: input.progress,
            model: input.model,
            videoModelMode: input.videoModelMode,
        }),
    }), [buildStoryboardVideoProgressPatch]);

    const handleAgentGenerateStoryboardImage = useCallback(async (input: {
        storyboardItemId: string;
        storyboardOrder: number;
        title: string;
        prompt: string;
        aspectRatio: AspectRatio;
        resolution: Resolution;
        modelVariant: 'standard' | 'pro' | 'gpt-image-2' | 'gpt-image-2-official';
    }) => {
        const targetStoryboardItem = storyboard.find((item) => item.id === input.storyboardItemId);
        const aspectMeta = getStoryboardAspectMeta(input.aspectRatio as StoryboardAspectRatio);
        const nextElementId = `agent-storyboard-image-${input.storyboardItemId}-${Date.now()}`;

        const generatorElement = buildStoryboardGeneratorElement({
            id: nextElementId,
            type: 'image-generator',
            title: input.title,
            prompt: targetStoryboardItem?.sourcePrompt || input.prompt,
            storyboardItemId: input.storyboardItemId,
            storyboardOrder: input.storyboardOrder,
            aspectRatio: input.aspectRatio as StoryboardAspectRatio,
            outputSize: targetStoryboardItem?.outputSize || aspectMeta.videoSize,
            width: aspectMeta.canvasWidth,
            height: aspectMeta.canvasHeight,
            renderProfile: targetStoryboardItem?.renderProfile || getStoryboardRenderProfile(targetStoryboardItem?.outputSize || aspectMeta.videoSize),
            durationSec: targetStoryboardItem?.durationSec || 5,
            orientation: aspectMeta.orientation,
            sourceAspectRatio: targetStoryboardItem?.sourceAspectRatio || input.aspectRatio as StoryboardAspectRatio,
            sourceOutputSize: targetStoryboardItem?.sourceOutputSize || targetStoryboardItem?.outputSize || aspectMeta.videoSize,
            sourceOrientation: targetStoryboardItem?.sourceOrientation || aspectMeta.orientation,
        });

        setElements((prev) => [...prev, generatorElement]);
        setSelectedIds([generatorElement.id]);
        setSelectedStoryboardItemId(input.storyboardItemId);

        try {
            const result = await requestImageGeneration({
                prompt: input.prompt,
                resolution: input.resolution,
                aspectRatio: input.aspectRatio,
                referenceImages: [],
                modelVariant: input.modelVariant,
                editMode: 'generate',
            });

            if (!result.imageData) {
                throw new Error('镜头出图失败');
            }

            const imageData = result.imageData;
            const dimensions = await getImageDimensions(imageData);
            const displaySize = getSmartDisplaySize(dimensions);

            setElements((prev) => prev.map((el) => el.id === generatorElement.id ? {
                ...el,
                ...buildStoryboardImageElementPatch({
                    imageData,
                    finalPrompt: result.finalPrompt,
                    displaySize,
                    generationMetadata: result.generationMetadata,
                    requestedResolution: result.requestedResolution,
                    requestedAspectRatio: result.requestedAspectRatio,
                    returnedModelVariant: result.returnedModelVariant,
                    returnedProvider: result.returnedProvider,
                    returnedProviderMode: result.returnedProviderMode,
                    providerFallbackUsed: result.providerFallbackUsed,
                    fallbackFrom: result.fallbackFrom,
                    fallbackReason: result.fallbackReason,
                    returnedModel: result.returnedModel,
                }),
            } : el));

            setStoryboard((prev) => prev.map((item) => item.id === input.storyboardItemId
                ? buildStoryboardItemResultPatch({
                    item,
                    elementId: generatorElement.id,
                    assetId: buildStoryboardAssetId('image', input.storyboardItemId),
                    thumbnailUrl: imageData,
                    type: 'image',
                    sourcePrompt: result.finalPrompt,
                    aspectRatio: input.aspectRatio as StoryboardAspectRatio,
                    orientation: aspectMeta.orientation,
                    outputSize: aspectMeta.videoSize,
                    renderProfile: getStoryboardRenderProfile(item.outputSize || aspectMeta.videoSize),
                    sourceAspectRatio: input.aspectRatio as StoryboardAspectRatio,
                    sourceOrientation: aspectMeta.orientation,
                    sourceOutputSize: item.outputSize || aspectMeta.videoSize,
                })
                : item));
        } catch (error) {
            setElements((prev) => prev.filter((el) => el.id !== generatorElement.id));
            throw error;
        }
    }, [buildStoryboardAssetId, buildStoryboardGeneratorElement, buildStoryboardImageElementPatch, buildStoryboardItemResultPatch, setElements, setSelectedIds, setSelectedStoryboardItemId, setStoryboard, storyboard]);

    const handleAgentGenerateStoryboardVideo = useCallback(async (input: {
        storyboardItemId: string;
        storyboardOrder: number;
        title: string;
        prompt: string;
        size: StoryboardVideoSize;
        durationSeconds: number;
        mode: VideoModelMode;
    }) => {
        const targetStoryboardItem = storyboard.find((item) => item.id === input.storyboardItemId);
        const aspectRatio = inferStoryboardAspectRatioFromVideoSize(input.size) ?? targetStoryboardItem?.aspectRatio ?? '9:16';
        const aspectMeta = getStoryboardAspectMeta(aspectRatio);
        const nodeSize = getStoryboardNodeSize(aspectRatio, input.size);
        const nextElementId = `agent-storyboard-video-${input.storyboardItemId}-${Date.now()}`;

        const generatorElement = buildStoryboardGeneratorElement({
            id: nextElementId,
            type: 'video-generator',
            title: input.title,
            prompt: targetStoryboardItem?.sourcePrompt || input.prompt,
            storyboardItemId: input.storyboardItemId,
            storyboardOrder: input.storyboardOrder,
            aspectRatio,
            outputSize: input.size,
            width: nodeSize.width,
            height: nodeSize.height,
            renderProfile: targetStoryboardItem?.renderProfile || getStoryboardRenderProfile(input.size),
            durationSec: input.durationSeconds,
            orientation: aspectMeta.orientation,
            sourceAspectRatio: targetStoryboardItem?.sourceAspectRatio || aspectRatio,
            sourceOutputSize: targetStoryboardItem?.sourceOutputSize || targetStoryboardItem?.outputSize || input.size,
            sourceOrientation: targetStoryboardItem?.sourceOrientation || aspectMeta.orientation,
            content: input.size,
            videoModelMode: input.mode,
        });

        setElements((prev) => [...prev, generatorElement]);
        setSelectedIds([generatorElement.id]);
        setSelectedStoryboardItemId(input.storyboardItemId);

        try {
            const startResult = await startVideoGeneration({
                prompt: input.prompt,
                seconds: input.durationSeconds,
                size: input.size,
                modelMode: input.mode,
            });

            const startedAt = Date.now();
            const timeoutMs = 10 * 60 * 1000;

            while (true) {
                if (Date.now() - startedAt > timeoutMs) {
                    throw new Error('镜头视频生成超时');
                }

                await new Promise((resolve) => setTimeout(resolve, 3000));
                const status = await getVideoGenerationStatus(startResult.taskId);

                const videoStatus = status.status ?? 'processing';
                const progress = status.progress ?? 0;

                setElements((prev) => prev.map((el) => el.id === generatorElement.id ? {
                    ...el,
                    ...buildStoryboardVideoProgressPatch({
                        existingGenerationMetadata: el.generationMetadata,
                        taskId: startResult.taskId,
                        videoStatus,
                        progress,
                        model: status.model || startResult.model,
                        videoModelMode: startResult.modelMode || input.mode,
                    }),
                } : el));

                if (videoStatus === 'failed') {
                    throw new Error('镜头视频生成失败');
                }

                if (progress === 100 && status.videoUrl) {
                    const videoUrl = status.videoUrl;
                    setElements((prev) => prev.map((el) => el.id === generatorElement.id ? {
                        ...el,
                        ...buildStoryboardVideoElementPatch({
                            videoUrl,
                            width: generatorElement.width,
                            height: generatorElement.height,
                            originalWidth: generatorElement.originalWidth,
                            originalHeight: generatorElement.originalHeight,
                            prompt: input.prompt,
                            existingGenerationMetadata: el.generationMetadata,
                            taskId: startResult.taskId,
                            videoStatus,
                            progress,
                            model: status.model || startResult.model,
                            videoModelMode: startResult.modelMode || input.mode,
                        }),
                    } : el));

                    setStoryboard((prev) => prev.map((item) => item.id === input.storyboardItemId
                        ? buildStoryboardItemResultPatch({
                            item,
                            elementId: generatorElement.id,
                            assetId: buildStoryboardAssetId('video', input.storyboardItemId),
                            thumbnailUrl: videoUrl,
                            type: 'video',
                            sourcePrompt: input.prompt,
                            aspectRatio,
                            orientation: aspectMeta.orientation,
                            outputSize: input.size,
                            renderProfile: getStoryboardRenderProfile(input.size),
                            sourceAspectRatio: aspectRatio,
                            sourceOrientation: aspectMeta.orientation,
                            sourceOutputSize: item.outputSize || input.size,
                            durationSec: input.durationSeconds,
                        })
                        : item));
                    return;
                }
            }
        } catch (error) {
            setElements((prev) => prev.filter((el) => el.id !== generatorElement.id));
            throw error;
        }
    }, [buildStoryboardAssetId, buildStoryboardGeneratorElement, buildStoryboardItemResultPatch, buildStoryboardVideoElementPatch, buildStoryboardVideoProgressPatch, getStoryboardNodeSize, setElements, setSelectedIds, setSelectedStoryboardItemId, setStoryboard, storyboard]);

    const buildAgentFollowUps = useCallback((result: AgentActionResult): string[] => {
        switch (result.kind) {
            case 'storyboard_created':
                return [
                    '把这个分镜扩展成 6 镜头，并补每镜头的画面描述',
                    '基于这套分镜，继续为每个镜头生成出图提示词',
                    '把这套分镜整理成更偏商业广告的节奏',
                ];
            case 'storyboard_board_requested':
                return [
                    '继续生成 4 镜头品牌短片分镜',
                    '给这个制作板补一版更电影感的镜头语言',
                    '把这个方向改成更适合竖屏短视频',
                ];
            case 'images_generated':
                return [
                    '把这组图统一成同一视觉风格',
                    '基于这组图继续生成一版更高级冷调的变体',
                    '从这组图里挑一个方向继续做成视频分镜',
                ];
            case 'storyboard_image_generation_requested':
                return [
                    '继续为剩下镜头批量生成图片',
                    '把这一镜改成更强对比和更电影感的光影',
                    '基于当前镜头继续生成对应的视频提示词',
                ];
            case 'storyboard_video_generation_requested':
            case 'video_started':
                return [
                    '继续为下一镜生成视频',
                    '把这个视频方向改得更适合品牌广告',
                    '基于这个视频镜头补一版配套封面图',
                ];
            case 'canvas_update_planned':
                return [
                    '继续把这些内容整理成更清晰的版式层级',
                    '在当前画布上补一套标题和卖点文案',
                    '把当前画布延展成一页完整提案',
                ];
            case 'image_edited':
                return [
                    '继续把这张图统一成更高级的商业质感',
                    '保持主体不变，再给我一版更简洁的背景',
                    '基于这张图继续扩展两版不同风格变体',
                ];
            default:
                return [];
        }
    }, []);

    const buildStoryboardItemsFromAgentResult = useCallback((items: Array<{
        id: string;
        title: string;
        sourcePrompt: string;
        durationSec: number;
        aspectRatio: StoryboardAspectRatio;
        outputSize: StoryboardVideoSize;
        renderProfile: ReturnType<typeof getStoryboardRenderProfile>;
        createdAt?: string;
    }>) => normalizeStoryboardItems(items.map((item, index) => ({
        id: item.id,
        assetId: `draft-storyboard-${item.id}`,
        elementId: '',
        title: item.title,
        type: 'image',
        thumbnailUrl: '',
        order: index,
        sourcePrompt: item.sourcePrompt,
        durationSec: item.durationSec,
        aspectRatio: item.aspectRatio,
        orientation: getStoryboardAspectMeta(item.aspectRatio).orientation,
        outputSize: item.outputSize,
        renderProfile: item.renderProfile,
        sourceAspectRatio: item.aspectRatio,
        sourceOrientation: getStoryboardAspectMeta(item.aspectRatio).orientation,
        sourceOutputSize: item.outputSize,
        createdAt: item.createdAt || new Date().toISOString(),
    }))), []);

    const handleAgentRun = useCallback(async (message: string, options?: { mode?: AgentMode }): Promise<AgentPanelResponse> => {
        const response = await runAgent(message, agentContext, options);
        const nextResult = response.result;
        const chat = response.chat;

        if (chat) {
            if (chat.plan && Object.keys(chat.plan).length > 0) {
                applyAgentPlanToCanvas({
                    prompt: message,
                    mode: options?.mode || 'design',
                    reply: chat.reply,
                    summary: chat.summary,
                    plan: chat.plan,
                });
            }
            return {
                kind: 'chat',
                reply: chat.reply,
                summary: chat.summary,
                plan: chat.plan || {},
                meta: [],
                followUps: [
                    '把这个方向整理成可直接放到画布里的方案',
                    '基于这个思路继续给我 3 个不同风格方向',
                    '按这个方向直接开始生成图片或分镜',
                ],
            };
        }

        if (!nextResult) {
            return {
                kind: 'action',
                reply: 'Agent 已执行，但没有返回结果。',
                summary: 'Agent 已执行，但没有返回结果。',
                plan: {},
                actionKind: undefined,
                meta: [{ label: '动作', value: '未知执行' }],
            };
        }

        if (nextResult.kind === 'storyboard_created') {
            setStoryboard(buildStoryboardItemsFromAgentResult(nextResult.items));
            setStoryboardLayout('vertical');
        }

        if (nextResult.kind === 'storyboard_board_requested') {
            handleCreateStoryboardFlow();
        }

        if (nextResult.kind === 'canvas_update_planned') {
            applyAgentCanvasDrafts(nextResult.elementDrafts);
        }

        if (nextResult.kind === 'images_generated') {
            applyAgentCanvasDrafts(buildAgentImageDrafts(nextResult.images));
        }

        if (nextResult.kind === 'storyboard_image_generation_requested') {
            await handleAgentGenerateStoryboardImage({
                storyboardItemId: nextResult.storyboardItemId,
                storyboardOrder: nextResult.storyboardOrder,
                title: nextResult.title,
                prompt: nextResult.prompt,
                aspectRatio: nextResult.aspectRatio as AspectRatio,
                resolution: nextResult.resolution,
                modelVariant: nextResult.modelVariant,
            });
        }

        if (nextResult.kind === 'storyboard_video_generation_requested') {
            await handleAgentGenerateStoryboardVideo({
                storyboardItemId: nextResult.storyboardItemId,
                storyboardOrder: nextResult.storyboardOrder,
                title: nextResult.title,
                prompt: nextResult.prompt,
                size: nextResult.size,
                durationSeconds: nextResult.durationSeconds,
                mode: nextResult.mode,
            });
        }

        if (nextResult.kind === 'image_edited') {
            applyAgentCanvasDrafts([
                buildEditedImageDraft(nextResult.imageData, message),
            ]);
        }

        const reply = nextResult.message;
        return {
            kind: 'action',
            actionKind: nextResult.kind,
            reply,
            summary: reply,
            plan: {},
            meta: buildAgentActionMeta(nextResult),
            followUps: buildAgentFollowUps(nextResult),
        };
    }, [agentContext, applyAgentCanvasDrafts, applyAgentPlanToCanvas, buildAgentActionMeta, buildAgentFollowUps, buildAgentImageDrafts, buildEditedImageDraft, buildStoryboardItemsFromAgentResult, handleAgentGenerateStoryboardImage, handleAgentGenerateStoryboardVideo, handleCreateStoryboardFlow, runAgent, setStoryboard, setStoryboardLayout]);

    const handleUnifiedAgentSubmit = useCallback(async (message: string, options?: { mode?: AgentMode }): Promise<AgentPanelResponse> => {
        setAgentStage('analyzing');
        try {
            const response = await handleAgentRun(message.trim(), options);
            if (response.plan && Object.keys(response.plan).length > 0) {
                setAgentStage('planning');
            } else {
                setAgentStage('building');
            }
            return response;
        } finally {
            setAgentStage('done');
            window.setTimeout(() => setAgentStage('idle'), 1200);
        }
    }, [handleAgentRun]);

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
        <div className="h-screen w-full relative overflow-hidden bg-[#F5F5F5] dark:bg-[#0F1115]">
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
                        onClick={() => setShowChat((prev) => !prev)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${showChat ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                        title="Agent"
                    >
                        <Sparkles size={18} className="text-black" />
                    </button>
                </div>
            </header>

            {agentStage !== 'idle' && (
                <div className="absolute top-16 left-1/2 z-50 -translate-x-1/2 rounded-full border border-sky-200 bg-white/92 px-4 py-2 text-sm font-medium text-sky-700 shadow-[0_14px_34px_rgba(14,165,233,0.14)] backdrop-blur-xl dark:border-sky-400/20 dark:bg-slate-950/86 dark:text-sky-200">
                    {agentStage === 'analyzing' ? 'Agent 正在分析需求…' : agentStage === 'planning' ? 'Agent 正在规划工作区…' : agentStage === 'building' ? 'Agent 正在搭建节点…' : 'Agent 已完成初始工作区'}
                </div>
            )}

            {showChat && (
                <div className="absolute top-20 bottom-4 right-4 w-[400px] z-40 animate-in slide-in-from-right-4 duration-300">
                    <AiDesignerPanel
                        onGenerate={handleUnifiedAgentSubmit}
                        isGenerating={isGenerating || isAgentRunning}
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
                    onDelete={handleDeleteElement}
                    onDeleteMany={handleDeleteElements}
                    onAddElement={appendElement}
                    backgroundColor={canvasBackground}
                    onCreateNodeAt={(x, y) => {
                        appendElement({
                            ...createImageGeneratorElement(),
                            x,
                            y,
                        });
                    }}
                    onDropImages={handleDropImages}
                    activeTool={activeTool}
                    onDragStart={() => setIsDraggingElement(true)}
                    onDragEnd={() => setIsDraggingElement(false)}
                    onGenerateFromImage={handleGenerateFromImage}
                    onOpenImageEditMode={handleOpenImageEditMode}
                    onConnectFlow={handleConnectFlow}
                    onRemoveBackground={handleRemoveBackground}
                    onUpscale={handleUpscale}
                    onCrop={handleCrop}
                    annotationImageId={annotationImageId}
                    annotationObject={annotationObject}
                    isDetectingObject={isDetectingObject}
                    onStartObjectAnnotation={enterAnnotationMode}
                    onExitObjectAnnotation={exitAnnotationMode}
                    onDetectObjectAt={handleDetectObjectAt}
                    onAnnotateRegion={handleAnnotateRegion}
                />
                {annotationImageId && annotationObject && (() => {
                    const imageElement = elements.find((element) => element.id === annotationImageId);
                    if (!imageElement) return null;
                    return (
                        <div
                            className="absolute z-[90] w-80 rounded-2xl border border-gray-200 bg-white/96 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl"
                            style={{
                                left: `${(imageElement.x + (imageElement.width || 0)) * scale + pan.x + 18}px`,
                                top: `${imageElement.y * scale + pan.y}px`,
                            }}
                        >
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">手动标记编辑</div>
                                    <div className="mt-1 text-xs text-gray-500">先点选一个区域，再自己告诉系统这里是什么</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        exitAnnotationMode();
                                        setAnnotationSubject('');
                                        setObjectEditPrompt('');
                                    }}
                                    className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                                >
                                    关闭
                                </button>
                            </div>
                            <div className="mb-3">
                                <div className="mb-1 text-xs font-medium text-gray-600">对象名称</div>
                                <input
                                    value={annotationSubject}
                                    onChange={(event) => setAnnotationSubject(event.target.value)}
                                    placeholder="例如：帽子、logo、包、路牌"
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {['人物', '服饰', 'logo'].map((item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => setAnnotationSubject(item)}
                                            className="rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                value={objectEditPrompt}
                                onChange={(event) => setObjectEditPrompt(event.target.value)}
                                placeholder="描述你想怎么修改这个对象，比如：改成红色帽子、删掉这个 logo、把它换成金属材质"
                                className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 focus:bg-white"
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                                {['删除', '换颜色', '替换'].map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setObjectEditPrompt((prev) => prev ? `${prev}，${item}` : item)}
                                        className="rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-gray-400">当前为手动标记版：你定义对象名称，系统只改这块区域</div>
                                <div className="flex items-center gap-2">
                                    {!!imageElement.previousContent && (
                                        <button
                                            type="button"
                                            onClick={handleRevertObjectEdit}
                                            className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700"
                                        >
                                            回退
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => void handleApplyObjectEdit()}
                                        disabled={!annotationSubject.trim() || !objectEditPrompt.trim() || isEditingObject}
                                        className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isEditingObject ? '处理中...' : '应用修改'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
                        selectedStoryboardItemId={selectedStoryboardItemId}
                        collapsed={assetsCollapsed}
                        onToggleCollapse={() => setAssetsCollapsed((prev) => !prev)}
                        onInsertAsset={handleInsertAsset}
                        onLocateAsset={handleLocateAsset}
                        onUseAsImageReference={handleUseAsImageReference}
                        onUseAsVideoReference={handleUseAsVideoReference}
                        onAddToStoryboard={handleAddToStoryboard}
                        onSelectStoryboardItem={setSelectedStoryboardItemId}
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
                        onUpdateAllStoryboardAspectRatios={handleUpdateAllStoryboardAspectRatios}
                        onResetAllStoryboardAspectRatiosFromAssets={handleResetAllStoryboardAspectRatiosFromAssets}
                        storyboardLayout={storyboardLayout}
                        onStoryboardLayoutChange={handleStoryboardLayoutChange}
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
                        <label className="ml-1 mr-1 flex items-center gap-2 rounded-xl px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
                            <span>背景</span>
                            <input
                                type="color"
                                value={canvasBackground}
                                onChange={(e) => setCanvasBackground(e.target.value)}
                                className="h-7 w-7 cursor-pointer rounded-md border border-gray-200 bg-transparent p-0 dark:border-white/10"
                                title="设置画布背景色"
                            />
                        </label>
                        <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-white/10" />
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
