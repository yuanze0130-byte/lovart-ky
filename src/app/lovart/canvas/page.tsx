"use client";

import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { Plus, Minus, ChevronDown, Sparkles, Cloud, CloudOff } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { FloatingToolbar } from '@/components/lovart/FloatingToolbar';
import { CanvasArea, CanvasElement } from '@/components/lovart/CanvasArea';
import { ImageGeneratorPanel } from '@/components/lovart/ImageGeneratorPanel';
import { VideoGeneratorPanel } from '@/components/lovart/VideoGeneratorPanel';
import { AiDesignerPanel } from '@/components/lovart/AiDesignerPanel';
import { useCanvasViewport } from '@/hooks/useCanvasViewport';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useCanvasElements } from '@/hooks/useCanvasElements';
import { useCanvasGeneration } from '@/hooks/useCanvasGeneration';
import { useCanvasImageActions } from '@/hooks/useCanvasImageActions';

function LovartCanvasContent() {
    const { user } = useUser();
    const searchParams = useSearchParams();
    const projectId = searchParams.get('id');

    const { scale, pan, setPan, zoomIn, zoomOut } = useCanvasViewport();
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeTool, setActiveTool] = useState('select'); // 'select', 'hand', 'mark', 'shape', 'text', 'draw'
    const [title, setTitle] = useState('Untitled');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const promptFromUrl = useMemo(() => searchParams.get('prompt') || undefined, [searchParams]);
    const [showChat, setShowChat] = useState(Boolean(promptFromUrl));

    const {
        saveStatus,
        isLoading,
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

    const { handleRemoveBackground } = useCanvasImageActions({
        setElements,
    });

    // Handle Delete Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't delete if user is typing in an input or textarea
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
                setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
                setSelectedIds([]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIds]);


    // 显示加载状态
    if (isLoading) {
        return (
            <div className="h-screen w-full bg-white flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">加载画布中...</p>
                    <p className="text-gray-400 text-sm mt-2">正在从云端获取数据</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-white relative overflow-hidden">
            {/* Header */}
            <header className="absolute top-0 left-0 w-full h-14 flex items-center justify-between px-4 z-50 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <Link href="/lovart" className="flex items-center gap-1 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                        <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold">L</div>
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
                    {/* Save Status Indicator */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        {saveStatus === 'saving' && (
                            <>
                                <Cloud size={14} className="animate-pulse" />
                                <span>保存中...</span>
                            </>
                        )}
                        {saveStatus === 'saved' && user && (
                            <>
                                <Cloud size={14} className="text-green-500" />
                                <span className="text-green-600">已保存</span>
                            </>
                        )}
                        {saveStatus === 'offline' && (
                            <>
                                <CloudOff size={14} className="text-red-500" />
                                <span className="text-red-600">离线</span>
                            </>
                        )}
                        {!user && (
                            <span className="text-amber-600">未登录</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
                    <button
                        onClick={() => setShowChat(!showChat)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${showChat ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
                    >
                        <Sparkles size={18} className="text-black" />
                    </button>
                </div>
            </header>

            {/* AI Designer Panel */}
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

            {/* Main Editor Area */}
            <div className="absolute inset-0">
                <CanvasArea
                    scale={scale}
                    pan={pan}
                    onPanChange={setPan}
                    elements={elements}
                    selectedIds={selectedIds}
                    onSelect={setSelectedIds}
                    onElementChange={handleElementChange}
                    onDelete={handleDelete}
                    onAddElement={appendElement}
                    activeTool={activeTool}
                    onDragStart={() => setIsDraggingElement(true)}
                    onDragEnd={() => setIsDraggingElement(false)}
                    onGenerateFromImage={handleGenerateFromImage}
                    onConnectFlow={handleConnectFlow}
                    onRemoveBackground={handleRemoveBackground}
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

                {/* Image Generator Panel */}
                {selectedIds.length === 1 && !isDraggingElement && (() => {
                    const selectedEl = elements.find(el => el.id === selectedIds[0]);
                    if (selectedEl?.type === 'image-generator') {
                        // Calculate position
                        const left = (selectedEl.x * scale) + pan.x;
                        const top = ((selectedEl.y + (selectedEl.height || 400)) * scale) + pan.y + 20; // 20px margin

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

                {/* Video Generator Panel */}
                {selectedIds.length === 1 && !isDraggingElement && (() => {
                    const selectedEl = elements.find(el => el.id === selectedIds[0]);
                    if (selectedEl?.type === 'video-generator') {
                        // Calculate position
                        const left = (selectedEl.x * scale) + pan.x;
                        const top = ((selectedEl.y + (selectedEl.height || 300)) * scale) + pan.y + 20; // 20px margin

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

                {/* Zoom Controls */}
                <div className="absolute bottom-4 left-4 flex items-center bg-white rounded-lg shadow-sm border border-gray-100 p-1 z-50">
                    <button onClick={zoomOut} className="p-1.5 hover:bg-gray-50 rounded text-gray-500">
                        <Minus size={16} />
                    </button>
                    <span className="px-2 text-xs font-medium text-gray-600 min-w-[3rem] text-center">
                        {Math.round(scale * 100)}%
                    </span>
                    <button onClick={zoomIn} className="p-1.5 hover:bg-gray-50 rounded text-gray-500">
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
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading canvas...</p>
                </div>
            </div>
        }>
            <LovartCanvasContent />
        </Suspense>
    );
}
