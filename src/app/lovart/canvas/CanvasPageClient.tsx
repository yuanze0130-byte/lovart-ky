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
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useCanvasViewport } from '@/hooks/useCanvasViewport';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useCanvasElements } from '@/hooks/useCanvasElements';
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
        <div className="h-screen w-full relative overflow-hidden bg-[radial-gradient(circle_at_top,_#13233f_0%,_#0b1220_34%,_#070b14_100%)]">
            <header className="absolute top-0 left-0 w-full h-14 flex items-center justify-between px-4 z-50 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <Link href="/" className="flex items-center gap-1 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                        <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold">D</div>
                        <ChevronDown size={16} className="text-gray-500" />
                    </Link>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-sm font-medium text-gray-700 bg-transparent border-none outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-2 py-1 transition-colors w-40"
                        placeholder="Untitled"
                        disabled={isLoading}
                    />
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
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

                <div className="absolute bottom-4 left-4 z-50 flex items-center rounded-2xl border border-white/10 bg-slate-950/70 p-1.5 shadow-[0_16px_40px_rgba(2,6,23,0.38)] backdrop-blur-xl">
                    <button onClick={() => zoomOut()} className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-sky-200">
                        <Minus size={16} />
                    </button>
                    <span className="min-w-[3.4rem] px-2 text-center text-xs font-medium text-slate-200">
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={() => zoomIn()} className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-sky-200">
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
