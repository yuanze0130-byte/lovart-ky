"use client";

import React, { useMemo, useState, useEffect, Suspense, useRef, useCallback } from 'react';
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
import { useProjectAssets, type ProjectAsset, type StoryboardItem, normalizeStoryboardItems } from '@/hooks/useProjectAssets';
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

    const projectAssets = useProjectAssets(elements);
    const storyboardStorageKey = useMemo(() => `lovart:storyboard:${projectId || 'draft'}`, [projectId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(storyboardStorageKey);
            if (!raw) {
                setStoryboard([]);
                return;
            }
            const parsed = JSON.parse(raw) as StoryboardItem[];
            setStoryboard(normalizeStoryboardItems(parsed));
        } catch {
            setStoryboard([]);
        }
    }, [storyboardStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(storyboardStorageKey, JSON.stringify(normalizeStoryboardItems(storyboard)));
    }, [storyboard, storyboardStorageKey]);

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
        const width = asset.type === 'video' ? 400 : 300;
        const height = asset.type === 'video' ? 300 : 200;
        const x = (window.innerWidth / 2 - pan.x) / scale - width / 2;
        const y = (window.innerHeight / 2 - 56 - pan.y) / scale - height / 2;

        appendElement({
            id: uuidv4(),
            type: asset.type,
            x,
            y,
            width,
            height,
            content: asset.url,
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

    const buildStoryboardVideoFlow = useCallback((item: StoryboardItem, options?: { x?: number; y?: number; forceStandalone?: boolean; shotIndex?: number }) => {
        const source = elements.find((element) => element.id === item.elementId);
        const width = 400;
        const height = 300;
        const spacing = 120;

        const fallbackX = options?.x ?? ((window.innerWidth / 2 - pan.x) / scale - width / 2);
        const fallbackY = options?.y ?? ((window.innerHeight / 2 - 56 - pan.y) / scale - height / 2);

        const shotLabel = `Shot ${String((options?.shotIndex ?? item.order) + 1).padStart(2, '0')}`;
        const draftPrompt = [
            shotLabel,
            item.title,
            item.sourcePrompt,
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
            referenceImageId: source.type === 'image' ? source.id : undefined,
            prompt: draftPrompt,
            groupId,
            linkedElements: [source.id, connectorId],
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
        };
    }, [createVideoGeneratorElement, elements, pan.x, pan.y, scale]);

    const handleCreateVideoFromStoryboard = useCallback((item: StoryboardItem) => {
        const flow = buildStoryboardVideoFlow(item, { shotIndex: item.order });

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
    }, [buildStoryboardVideoFlow, setActiveTool, setElements, setSelectedIds]);

    const handleCreateStoryboardFlow = useCallback(() => {
        if (storyboard.length === 0) return;

        const baseX = (window.innerWidth / 2 - pan.x) / scale - 200;
        const baseY = (window.innerHeight / 2 - 56 - pan.y) / scale - 150;
        const verticalGap = 380;

        const flows = storyboard.map((item, index) => buildStoryboardVideoFlow(item, {
            x: baseX,
            y: baseY + index * verticalGap,
            forceStandalone: true,
            shotIndex: index,
        }));

        setElements((prev) => [...prev, ...flows.flatMap((flow) => flow.elementsToAdd)]);
        setSelectedIds(flows.map((flow) => flow.selectedId));
        setActiveTool('select');
    }, [buildStoryboardVideoFlow, pan.x, pan.y, scale, setActiveTool, setElements, setSelectedIds, storyboard]);

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
