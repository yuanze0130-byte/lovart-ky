import React, { useState, useRef, useEffect } from 'react';
import { ContextToolbar } from './ContextToolbar';
import type { Json } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export type CanvasElementType = 'image' | 'text' | 'shape' | 'path' | 'image-generator' | 'video-generator' | 'video' | 'connector';

export interface CanvasElement extends Record<string, Json | undefined> {
    id: string;
    type: CanvasElementType;
    x: number;
    y: number;
    content?: string;
    width?: number;
    height?: number;
    originalWidth?: number;
    originalHeight?: number;
    requestedAspectRatio?: '1:1' | '4:3' | '16:9';
    requestedResolution?: '1K' | '2K' | '4K';
    color?: string;
    shapeType?: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right';
    fontSize?: number;
    fontFamily?: string;
    points?: { x: number; y: number }[];
    strokeWidth?: number;
    referenceImageId?: string;
    groupId?: string;
    linkedElements?: string[];
    connectorFrom?: string;
    connectorTo?: string;
    connectorStyle?: 'solid' | 'dashed';
}

interface CanvasAreaProps {
    scale: number;
    pan: { x: number; y: number };
    onPanChange: (pan: { x: number; y: number }) => void;
    onZoomIn?: (center?: { x: number; y: number }) => void;
    onZoomOut?: (center?: { x: number; y: number }) => void;
    onZoomTo?: (scale: number, center?: { x: number; y: number }) => void;
    elements: CanvasElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    onDelete: (id: string) => void;
    onAddElement: (element: CanvasElement) => void;
    onCreateNodeAt?: (x: number, y: number) => void;
    activeTool: string;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onGenerateFromImage?: (element: CanvasElement) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onRemoveBackground?: (element: CanvasElement) => Promise<void>;
    onUpscale?: (element: CanvasElement, scale?: number) => Promise<void>;
    onCrop?: (
        element: CanvasElement,
        options: { x: number; y: number; width: number; height: number }
    ) => Promise<void>;
}

export function CanvasArea({
    scale,
    pan,
    onPanChange,
    onZoomIn,
    onZoomOut,
    elements,
    selectedIds,
    onSelect,
    onElementChange,
    onDelete,
    onAddElement,
    onCreateNodeAt,
    activeTool,
    onDragStart,
    onDragEnd,
    onGenerateFromImage,
    onConnectFlow,
    onRemoveBackground,
    onUpscale,
    onCrop,
}: CanvasAreaProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    } | null>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState<{ points: { x: number; y: number }[] } | null>(null);

    const dragStartRef = useRef<{
        x: number;
        y: number;
        elementX: number;
        elementY: number;
        width: number;
        height: number;
        panX: number;
        panY: number;
        aspectRatio?: number;
        initialPositions?: { id: string; x: number; y: number }[];
    } | null>(null);
    const draggedElementIdRef = useRef<string | null>(null);
    const resizeHandleRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const getCanvasPoint = (clientX: number, clientY: number) => ({
        x: (clientX - pan.x) / scale,
        y: (clientY - 56 - pan.y) / scale,
    });

    const handleMouseDown = (
        e: React.MouseEvent,
        elementId: string | null,
        elementX: number = 0,
        elementY: number = 0,
        width: number = 0,
        height: number = 0
    ) => {
        const isPanGesture = activeTool === 'hand' || e.button === 1 || (!elementId && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey);

        if (isPanGesture) {
            setIsPanning(true);
            dragStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                elementX: 0,
                elementY: 0,
                width: 0,
                height: 0,
                panX: pan.x,
                panY: pan.y,
            };
            return;
        }

        if (activeTool === 'draw') {
            setIsDrawing(true);
            const point = getCanvasPoint(e.clientX, e.clientY);
            setCurrentPath({ points: [point] });
            return;
        }

        if (!elementId) {
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                onSelect([]);
            }
            const point = getCanvasPoint(e.clientX, e.clientY);
            setIsSelecting(true);
            setSelectionBox({
                startX: point.x,
                startY: point.y,
                currentX: point.x,
                currentY: point.y,
            });
            setEditingTextId(null);
            return;
        }

        e.stopPropagation();

        let dragSelectedIds = selectedIds;
        const isToggleSelect = e.ctrlKey || e.metaKey || e.shiftKey;

        if (isToggleSelect) {
            if (selectedIds.includes(elementId)) {
                dragSelectedIds = selectedIds.filter((id) => id !== elementId);
                onSelect(dragSelectedIds);
            } else {
                dragSelectedIds = [...selectedIds, elementId];
                onSelect(dragSelectedIds);
            }
        } else {
            if (!selectedIds.includes(elementId)) {
                dragSelectedIds = [elementId];
                onSelect(dragSelectedIds);
            }
        }

        if ((e.target as HTMLElement).dataset.handle) return;

        setIsDragging(true);
        onDragStart?.();
        draggedElementIdRef.current = elementId;

        const initialPositions = elements
            .filter((el) => dragSelectedIds.includes(el.id))
            .map((el) => ({ id: el.id, x: el.x, y: el.y }));

        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elementX,
            elementY,
            width: width || 0,
            height: height || 0,
            panX: 0,
            panY: 0,
            aspectRatio: width && height ? width / height : undefined,
            initialPositions,
        };
    };

    const handleResizeStart = (
        e: React.MouseEvent,
        elementId: string,
        handle: string,
        element: CanvasElement
    ) => {
        e.stopPropagation();
        setIsResizing(true);
        draggedElementIdRef.current = elementId;
        resizeHandleRef.current = handle;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elementX: element.x,
            elementY: element.y,
            width: element.width || 0,
            height: element.height || 0,
            panX: 0,
            panY: 0,
            aspectRatio: (element.width || 1) / (element.height || 1),
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const point = getCanvasPoint(e.clientX, e.clientY);

        if (isDrawing && currentPath) {
            setCurrentPath((prev) => prev ? { points: [...prev.points, point] } : null);
            return;
        }

        if (isSelecting && selectionBox) {
            setSelectionBox((prev) => prev ? { ...prev, currentX: point.x, currentY: point.y } : null);
            return;
        }

        if (!dragStartRef.current) return;

        if (isPanning) {
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            onPanChange({
                x: dragStartRef.current.panX + dx,
                y: dragStartRef.current.panY + dy,
            });
            return;
        }

        if (!draggedElementIdRef.current) return;

        const dx = (e.clientX - dragStartRef.current.x) / scale;
        const dy = (e.clientY - dragStartRef.current.y) / scale;

        if (isDragging && dragStartRef.current.initialPositions) {
            dragStartRef.current.initialPositions.forEach((pos) => {
                onElementChange(pos.id, { x: pos.x + dx, y: pos.y + dy });
            });
        } else if (isResizing && resizeHandleRef.current) {
            const { elementX, elementY, width, height, aspectRatio } = dragStartRef.current;
            const element = elements.find((el) => el.id === draggedElementIdRef.current);
            const isImage = element?.type === 'image';

            let newX = elementX;
            let newY = elementY;
            let newWidth = width;
            let newHeight = height;

            if (resizeHandleRef.current.includes('e')) newWidth = width + dx;
            if (resizeHandleRef.current.includes('s')) newHeight = height + dy;
            if (resizeHandleRef.current.includes('w')) {
                newWidth = width - dx;
                newX = elementX + dx;
            }
            if (resizeHandleRef.current.includes('n')) {
                newHeight = height - dy;
                newY = elementY + dy;
            }

            if (isImage && aspectRatio) {
                if (resizeHandleRef.current.includes('e') || resizeHandleRef.current.includes('w')) {
                    newHeight = newWidth / aspectRatio;
                    if (resizeHandleRef.current.includes('n')) {
                        newY = elementY + (height - newHeight);
                    }
                } else if (resizeHandleRef.current.includes('n') || resizeHandleRef.current.includes('s')) {
                    newWidth = newHeight * aspectRatio;
                    if (resizeHandleRef.current.includes('w')) {
                        newX = elementX + (width - newWidth);
                    }
                    if (resizeHandleRef.current === 'n') {
                        newY = elementY + (height - newHeight);
                    }
                }
            }

            onElementChange(draggedElementIdRef.current, {
                x: newX,
                y: newY,
                width: Math.max(10, newWidth),
                height: Math.max(10, newHeight),
            });
        }
    };

    const handleMouseUp = () => {
        if (isSelecting && selectionBox) {
            const x1 = Math.min(selectionBox.startX, selectionBox.currentX);
            const y1 = Math.min(selectionBox.startY, selectionBox.currentY);
            const x2 = Math.max(selectionBox.startX, selectionBox.currentX);
            const y2 = Math.max(selectionBox.startY, selectionBox.currentY);

            const newSelectedIds = elements
                .filter((el) => {
                    const elRight = el.x + (el.width || 0);
                    const elBottom = el.y + (el.height || 0);
                    return el.x < x2 && elRight > x1 && el.y < y2 && elBottom > y1;
                })
                .map((el) => el.id);

            onSelect(newSelectedIds);
        }

        if (isDrawing && currentPath) {
            const points = currentPath.points;
            if (points.length > 1) {
                const xs = points.map((p) => p.x);
                const ys = points.map((p) => p.y);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);
                const width = maxX - minX;
                const height = maxY - minY;
                const newPoints = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));

                const newElement: CanvasElement = {
                    id: uuidv4(),
                    type: 'path',
                    x: minX,
                    y: minY,
                    width: Math.max(width, 1),
                    height: Math.max(height, 1),
                    points: newPoints,
                    color: '#000000',
                    strokeWidth: 3,
                };
                onAddElement(newElement);
                onSelect([newElement.id]);
            }
            setCurrentPath(null);
        }

        setIsDragging(false);
        setIsResizing(false);
        setIsPanning(false);
        setIsDrawing(false);
        setIsSelecting(false);
        setSelectionBox(null);
        dragStartRef.current = null;
        draggedElementIdRef.current = null;
        resizeHandleRef.current = null;
        onDragEnd?.();
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging || isResizing || isPanning || isDrawing || isSelecting) {
                handleMouseUp();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging, isResizing, isPanning, isDrawing, isSelecting, elements, selectionBox, currentPath]);

    const selectedElement = elements.find((el) => selectedIds.includes(el.id));

    const renderPath = (points: { x: number; y: number }[]) => {
        if (!points || points.length === 0) return '';
        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    };

    const handleDuplicate = (el: CanvasElement) => {
        onAddElement({
            ...el,
            id: uuidv4(),
            x: el.x + 20,
            y: el.y + 20,
        });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const center = { x: e.clientX, y: e.clientY };
        if (e.deltaY < 0) {
            onZoomIn?.(center);
        } else {
            onZoomOut?.(center);
        }
    };

    const handleDoubleClickCanvas = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-canvas-element="true"]')) return;
        const point = getCanvasPoint(e.clientX, e.clientY);
        onCreateNodeAt?.(point.x, point.y);
    };

    return (
        <div
            className={`w-full h-full bg-[#F9FAFB] relative overflow-hidden ${
                activeTool === 'hand'
                    ? 'cursor-grab active:cursor-grabbing'
                    : activeTool === 'draw'
                        ? 'cursor-crosshair'
                        : ''
            }`}
            onMouseMove={handleMouseMove}
            onMouseDown={(e) => handleMouseDown(e, null)}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClickCanvas}
        >
            {selectedIds.length === 1 && selectedElement && !isDragging && !isResizing && !isPanning && !isDrawing && selectedElement.type !== 'connector' && (
                <div
                    style={{
                        position: 'absolute',
                        left: (selectedElement.x + (selectedElement.width || 0) / 2) * scale + pan.x,
                        top: (selectedElement.y - 60) * scale + pan.y,
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                    }}
                >
                    <ContextToolbar
                        element={selectedElement}
                        onUpdate={onElementChange}
                        onDelete={onDelete}
                        onGenerateFromImage={onGenerateFromImage}
                        onConnectFlow={onConnectFlow}
                        onDuplicate={handleDuplicate}
                        onRemoveBackground={onRemoveBackground}
                        onUpscale={onUpscale}
                        onCrop={onCrop}
                    />
                </div>
            )}

            {selectedIds.length > 1 && !isDragging && (
                <div
                    className="absolute z-50 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-2 flex items-center gap-3"
                    style={{ left: '50%', top: 20, transform: 'translateX(-50%)' }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <span className="text-sm font-medium text-gray-600 px-2">{selectedIds.length} items selected</span>
                    <div className="w-px h-6 bg-gray-200" />
                    <button
                        onClick={() => selectedIds.forEach((id) => onDelete(id))}
                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-md"
                    >
                        Delete All
                    </button>
                </div>
            )}

            <div
                ref={containerRef}
                className="w-full h-full origin-top-left transition-transform duration-200 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        width: '10000px',
                        height: '10000px',
                    }}
                />

                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                    {elements
                        .filter((el) => el.type === 'connector')
                        .map((connector) => {
                            const fromEl = elements.find((e) => e.id === connector.connectorFrom);
                            const toEl = elements.find((e) => e.id === connector.connectorTo);
                            if (!fromEl || !toEl) return null;

                            const fromX = fromEl.x + (fromEl.width || 0) / 2;
                            const fromY = fromEl.y + (fromEl.height || 0) / 2;
                            const toX = toEl.x + (toEl.width || 0) / 2;
                            const toY = toEl.y + (toEl.height || 0) / 2;

                            return (
                                <g key={connector.id}>
                                    <line
                                        x1={fromX}
                                        y1={fromY}
                                        x2={toX}
                                        y2={toY}
                                        stroke={connector.color || '#6B7280'}
                                        strokeWidth={connector.strokeWidth || 2}
                                        strokeDasharray={connector.connectorStyle === 'dashed' ? '8 4' : '0'}
                                        markerEnd="url(#arrowhead)"
                                    />
                                </g>
                            );
                        })}
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                            <polygon points="0 0, 10 3, 0 6" fill="#6B7280" />
                        </marker>
                    </defs>
                </svg>

                <div className="absolute inset-0">
                    {elements
                        .filter((el) => el.type !== 'connector')
                        .map((el) => (
                            <div
                                key={el.id}
                                data-canvas-element="true"
                                className={`absolute group ${selectedIds.includes(el.id) ? 'z-10' : ''}`}
                                style={{
                                    left: el.x,
                                    top: el.y,
                                    width: el.width,
                                    height: el.height,
                                    pointerEvents: activeTool === 'draw' ? 'none' : 'auto',
                                }}
                                onMouseDown={(e) => handleMouseDown(e, el.id, el.x, el.y, el.width, el.height)}
                                onDoubleClick={() => el.type === 'text' && setEditingTextId(el.id)}
                            >
                                {el.type === 'image-generator' && (
                                    <div className="w-full h-full bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-400 dark:border-blue-500 rounded-xl flex flex-col items-center justify-center text-blue-500 dark:text-blue-300">
                                        <div className="w-20 h-20 mb-4 opacity-50">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-medium">Image Generator</div>
                                        <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                                    </div>
                                )}

                                {el.type === 'video-generator' && (
                                    <div className="w-full h-full bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-400 dark:border-blue-500 rounded-xl flex flex-col items-center justify-center text-blue-500 dark:text-blue-300">
                                        <div className="w-20 h-20 mb-4 opacity-50">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-medium">Video Generator</div>
                                        <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                                    </div>
                                )}

                                {!selectedIds.includes(el.id) && !isDrawing && (() => {
                                    const isLinked = selectedIds.some((selectedId) => {
                                        const selectedEl = elements.find((e) => e.id === selectedId);
                                        return selectedEl?.linkedElements?.includes(el.id) || el.linkedElements?.includes(selectedId);
                                    });
                                    return isLinked ? <div className="absolute inset-0 border-2 border-dashed border-purple-400 pointer-events-none opacity-60" /> : null;
                                })()}

                                {selectedIds.includes(el.id) && !isDrawing && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-blue-500 dark:border-blue-400 pointer-events-none" />
                                        {selectedIds.length === 1 && (
                                            <>
                                                {['nw', 'ne', 'sw', 'se', 'w', 'e', 'n', 's'].map((handle) => {
                                                    const classes: Record<string, string> = {
                                                        nw: 'absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-full cursor-nw-resize',
                                                        ne: 'absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-full cursor-ne-resize',
                                                        sw: 'absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 rounded-full cursor-sw-resize',
                                                        se: 'absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 rounded-full cursor-se-resize',
                                                        w: 'absolute top-1/2 -left-1.5 w-3 h-3 -mt-1.5 bg-white border border-blue-500 rounded-full cursor-w-resize',
                                                        e: 'absolute top-1/2 -right-1.5 w-3 h-3 -mt-1.5 bg-white border border-blue-500 rounded-full cursor-e-resize',
                                                        n: 'absolute -top-1.5 left-1/2 w-3 h-3 -ml-1.5 bg-white border border-blue-500 rounded-full cursor-n-resize',
                                                        s: 'absolute -bottom-1.5 left-1/2 w-3 h-3 -ml-1.5 bg-white border border-blue-500 rounded-full cursor-s-resize',
                                                    };
                                                    return <div key={handle} className={classes[handle]} data-handle={handle} onMouseDown={(e) => handleResizeStart(e, el.id, handle, el)} />;
                                                })}
                                            </>
                                        )}
                                    </>
                                )}

                                {el.type === 'image' && el.content && <img src={el.content} alt="Upload" className="w-full h-full object-contain pointer-events-none select-none rounded-lg" />}

                                {el.type === 'video' && el.content && (
                                    <div className="relative w-full h-full rounded-lg overflow-hidden">
                                        <video src={el.content} className="w-full h-full object-cover select-none" controls loop playsInline onClick={(e) => e.stopPropagation()} />
                                    </div>
                                )}

                                {el.type === 'text' && (editingTextId === el.id ? (
                                    <textarea
                                        autoFocus
                                        className="w-full h-full bg-transparent outline-none resize-none overflow-hidden"
                                        style={{ fontSize: el.fontSize || 24, fontFamily: el.fontFamily || 'Inter', color: el.color || '#000000' }}
                                        value={el.content}
                                        onChange={(e) => onElementChange(el.id, { content: e.target.value })}
                                        onBlur={() => setEditingTextId(null)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <div className="w-full h-full whitespace-nowrap select-none flex items-center" style={{ fontSize: el.fontSize || 24, fontFamily: el.fontFamily || 'Inter', color: el.color || '#000000' }}>
                                        {el.content || 'Double click to edit'}
                                    </div>
                                ))}

                                {el.type === 'shape' && (
                                    <div className="w-full h-full flex items-center justify-center">
                                        {(!el.shapeType || el.shapeType === 'square') && <div className="w-full h-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />}
                                        {el.shapeType === 'circle' && <div className="w-full h-full rounded-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />}
                                        {el.shapeType === 'triangle' && (
                                            <div className="w-0 h-0 border-l-[50px] border-r-[50px] border-b-[100px] border-l-transparent border-r-transparent" style={{ borderBottomColor: el.color || '#9CA3AF', borderBottomWidth: el.height, borderLeftWidth: (el.width || 0) / 2, borderRightWidth: (el.width || 0) / 2 }} />
                                        )}
                                    </div>
                                )}

                                {el.type === 'path' && el.points && (
                                    <svg className="w-full h-full overflow-visible pointer-events-none" viewBox={`0 0 ${el.width} ${el.height}`} preserveAspectRatio="none">
                                        <path d={renderPath(el.points)} stroke={el.color || '#000000'} strokeWidth={el.strokeWidth || 3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </div>
                        ))}
                </div>

                {currentPath && (
                    <div className="absolute inset-0 pointer-events-none z-50">
                        <svg className="w-full h-full overflow-visible">
                            <path d={renderPath(currentPath.points)} stroke="#000000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                )}

                {selectionBox && (
                    <div
                        className="absolute border border-blue-500 dark:border-blue-400 bg-blue-500/10 dark:bg-blue-400/10 pointer-events-none z-50"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.currentX),
                            top: Math.min(selectionBox.startY, selectionBox.currentY),
                            width: Math.abs(selectionBox.currentX - selectionBox.startX),
                            height: Math.abs(selectionBox.currentY - selectionBox.startY),
                        }}
                    />
                )}

                {elements.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"></div>
                )}
            </div>
        </div>
    );
}
