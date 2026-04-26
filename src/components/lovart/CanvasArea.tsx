/* eslint-disable @next/next/no-img-element -- The canvas renders user-provided/generated image data directly. */
import React, { useState, useRef, useEffect } from 'react';
import { AlignCenter, AlignEndHorizontal, AlignEndVertical, AlignHorizontalJustifyCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalJustifyCenter, Copy, Link2, Trash2, Unlink2, X } from 'lucide-react';
import { ContextToolbar } from './ContextToolbar';
import { ObjectAnnotationOverlay } from './ObjectAnnotationOverlay';
import type { AnnotationObject as DetectedObject } from '@/lib/object-annotation';
import type { Json } from '@/lib/supabase';
import { getStoryboardReviewRailLabel, getStoryboardReviewRailState } from '@/hooks/useProjectAssets';
import { v4 as uuidv4 } from 'uuid';

export type CanvasElementType = 'image' | 'text' | 'shape' | 'path' | 'image-generator' | 'video-generator' | 'video' | 'connector';

export interface GenerationMetadata extends Record<string, Json | undefined> {
    sourcePrompt?: string;
    finalPrompt?: string;
    promptPatch?: string;
    promptPresetId?: string;
    promptPresetLabel?: string;
    promptDebug?: string;
    imageEditMode?: 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
    modelVariant?: 'standard' | 'pro' | 'gpt-image-2' | 'gpt-image-2-official';
    provider?: 'official' | 'proxy';
    providerMode?: 'official' | 'proxy' | 'auto';
    providerFallbackUsed?: boolean;
    fallbackFrom?: 'official' | 'proxy';
    fallbackReason?: string;
    model?: string;
    taskId?: string;
    proxyTarget?: 'primary' | 'fallback';
    taskStatus?: string;
    taskPollIntervalMs?: number;
    taskPollTimeoutMs?: number;
    taskPollAttemptCount?: number;
    taskDurationMs?: number;
    taskCompletedAt?: string;
    taskPayload?: Json;
    referenceCount?: number;
    resolution?: '1K' | '2K' | '4K';
    aspectRatio?: 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
    officialQuality?: 'auto' | 'high' | 'medium' | 'low';
    officialBackground?: 'auto' | 'transparent' | 'opaque';
    officialOutputFormat?: 'png' | 'jpeg' | 'webp';
    officialModeration?: 'auto' | 'low';
}

export interface CanvasElement extends Record<string, Json | undefined> {
    id: string;
    type: CanvasElementType;
    videoModelMode?: 'standard' | 'fast';
    x: number;
    y: number;
    content?: string;
    width?: number;
    height?: number;
    originalWidth?: number;
    originalHeight?: number;
    requestedAspectRatio?: 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
    requestedResolution?: '1K' | '2K' | '4K';
    storyboardItemId?: string;
    storyboardShotLabel?: string;
    storyboardTitle?: string;
    storyboardMeta?: string;
    storyboardBrief?: string;
    storyboardAspectRatio?: '9:16' | '16:9' | '4:5' | '1:1' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3';
    storyboardVideoSize?: '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024' | '1024x768' | '768x1024' | '1536x640' | '1152x768' | '768x1152';
    storyboardOrientation?: 'portrait' | 'landscape' | 'square';
    storyboardSourceAspectRatio?: '9:16' | '16:9' | '4:5' | '1:1' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3';
    storyboardSourceVideoSize?: '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024' | '1024x768' | '768x1024' | '1536x640' | '1152x768' | '768x1152';
    storyboardSourceOrientation?: 'portrait' | 'landscape' | 'square';
    storyboardRenderProfile?: 'standard' | 'high';
    storyboardDurationSec?: number;
    storyboardShotIndex?: number;
    storyboardShotCount?: number;
    storyboard序列State?: 'single' | 'first' | 'middle' | 'last';
    storyboard序列Hint?: string;
    storyboardBoardMode?: string;
    storyboardElementRole?: 'board-header' | 'board-surface' | 'board-lane' | 'board-lane-label';
    storyboardLaneOrientation?: 'portrait' | 'landscape' | 'square';
    prompt?: string;
    generationMetadata?: GenerationMetadata;
    previousContent?: string;
    annotationLabel?: string;
    annotationScore?: number;
    annotationPolygon?: { x: number; y: number }[];
    annotationMaskUrl?: string;
    color?: string;
    shapeType?: 'square' | 'circle' | 'triangle' | 'star' | 'message' | 'arrow-left' | 'arrow-right';
    fontSize?: number;
    fontFamily?: string;
    points?: { x: number; y: number }[];
    strokeWidth?: number;
    referenceImageId?: string;
    initialEditMode?: 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
    initialPrompt?: string;
    groupId?: string;
    linkedElements?: string[];
    connectorFrom?: string;
    connectorTo?: string;
    connectorStyle?: 'solid' | 'dashed';
}

function getReviewRailToneClass(state: 'clean' | 'watch' | 'check') {
    if (state === 'clean') return 'border-emerald-300/20 bg-emerald-400/15 text-emerald-50';
    if (state === 'watch') return 'border-amber-300/20 bg-amber-400/15 text-amber-50';
    return 'border-sky-300/20 bg-sky-400/15 text-sky-50';
}

function getProviderLabel(metadata?: GenerationMetadata) {
    if (!metadata) return undefined;
    const provider = metadata.provider === 'official'
        ? '官方'
        : metadata.provider === 'proxy'
            ? '中转'
            : undefined;
    const providerMode = metadata.providerMode === 'official'
        ? '官方路由'
        : metadata.providerMode === 'proxy'
            ? '中转路由'
            : metadata.providerMode === 'auto'
                ? '自动路由'
                : undefined;

    if (metadata.providerFallbackUsed) {
        const fromLabel = metadata.fallbackFrom === 'official'
            ? '官方'
            : metadata.fallbackFrom === 'proxy'
                ? '中转'
                : undefined;
        return fromLabel ? `${providerMode || provider || '自动路由'} · 从${fromLabel}回退` : `${providerMode || provider || '自动路由'} · 已回退`;
    }

    return providerMode || provider;
}

function getModelLabel(metadata?: GenerationMetadata) {
    if (!metadata?.model) return undefined;
    return metadata.model;
}

function getOfficialOptionChips(metadata?: GenerationMetadata) {
    if (metadata?.modelVariant !== 'gpt-image-2-official') return [] as string[];

    const chips: string[] = [];

    if (metadata.officialQuality) {
        const qualityLabel = metadata.officialQuality === 'high'
            ? '高质量'
            : metadata.officialQuality === 'medium'
                ? '中质量'
                : metadata.officialQuality === 'low'
                    ? '低质量'
                    : '自动质量';
        chips.push(qualityLabel);
    }

    if (metadata.officialBackground) {
        const backgroundLabel = metadata.officialBackground === 'transparent'
            ? '透明背景'
            : metadata.officialBackground === 'opaque'
                ? '实色背景'
                : '自动背景';
        chips.push(backgroundLabel);
    }

    if (metadata.officialOutputFormat) {
        const formatLabel = metadata.officialOutputFormat.toUpperCase();
        chips.push(formatLabel);
    }

    if (metadata.officialModeration) {
        chips.push(metadata.officialModeration === 'low' ? '低审查' : '自动审查');
    }

    return chips;
}

function getTaskDebugChips(metadata?: GenerationMetadata) {
    if (!metadata?.taskId) return [] as string[];

    const chips: string[] = [];

    if (metadata.proxyTarget) {
        chips.push(metadata.proxyTarget === 'fallback' ? '备用通道' : '主通道');
    }

    if (typeof metadata.taskPollAttemptCount === 'number') {
        chips.push(`轮询 ${metadata.taskPollAttemptCount} 次`);
    }

    if (typeof metadata.taskDurationMs === 'number') {
        chips.push(`耗时 ${(metadata.taskDurationMs / 1000).toFixed(metadata.taskDurationMs >= 10000 ? 0 : 1)}s`);
    }

    return chips;
}

function getTaskDebugSummary(metadata?: GenerationMetadata) {
    if (!metadata?.taskId) return undefined;

    const parts: string[] = [`Task ${metadata.taskId}`];

    if (metadata.taskStatus) {
        parts.push(`状态 ${metadata.taskStatus}`);
    }

    if (typeof metadata.taskPollIntervalMs === 'number') {
        parts.push(`间隔 ${metadata.taskPollIntervalMs}ms`);
    }

    if (typeof metadata.taskPollTimeoutMs === 'number') {
        parts.push(`超时 ${Math.round(metadata.taskPollTimeoutMs / 1000)}s`);
    }

    return parts.join(' · ');
}

interface CanvasAreaProps {
    scale: number;
    pan: { x: number; y: number };
    boardColor?: string;
    onPanChange: (pan: { x: number; y: number }) => void;
    onZoomIn?: (center?: { x: number; y: number }) => void;
    onZoomOut?: (center?: { x: number; y: number }) => void;
    onZoomTo?: (scale: number, center?: { x: number; y: number }) => void;
    elements: CanvasElement[];
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    onElementChange: (id: string, newAttrs: Partial<CanvasElement>) => void;
    onElementsChange?: (changes: Array<{ id: string; newAttrs: Partial<CanvasElement> }>) => void;
    onDelete: (id: string) => void;
    onDeleteMany?: (ids: string[]) => void;
    onAddElement: (element: CanvasElement) => void;
    onCreateNodeAt?: (x: number, y: number) => void;
    onDropImages?: (files: File[], point: { x: number; y: number }) => void;
    activeTool: string;
    backgroundColor?: string;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onGenerateFromImage?: (element: CanvasElement) => void;
    onOpenImageEditMode?: (element: CanvasElement, mode: 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle', prompt?: string) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onRemoveBackground?: (element: CanvasElement) => Promise<void>;
    onUpscale?: (element: CanvasElement, scale?: number) => Promise<void>;
    onCrop?: (
        element: CanvasElement,
        options: { x: number; y: number; width: number; height: number }
    ) => Promise<void>;
    annotationImageId?: string | null;
    annotationObject?: DetectedObject | null;
    isDetectingObject?: boolean;
    annotationPendingPoint?: { x: number; y: number } | null;
    onStartObjectAnnotation?: (element: CanvasElement) => void;
    onExitObjectAnnotation?: () => void;
    onDetectObjectAt?: (element: CanvasElement, point: { x: number; y: number }) => void;
    onAnnotateRegion?: (element: CanvasElement, region: { x: number; y: number; width: number; height: number }) => void;
}

export function CanvasArea({
    scale,
    pan,
    boardColor = '#f5f7fb',
    onPanChange,
    onZoomIn,
    onZoomOut,
    elements,
    selectedIds,
    onSelect,
    onElementChange,
    onElementsChange,
    onDelete,
    onDeleteMany,
    onAddElement,
    onCreateNodeAt,
    onDropImages,
    activeTool,
    backgroundColor = '#F4F4F5',
    onDragStart,
    onDragEnd,
    onGenerateFromImage,
    onOpenImageEditMode,
    onConnectFlow,
    onRemoveBackground,
    onUpscale,
    onCrop,
    annotationImageId,
    annotationObject,
    isDetectingObject,
    annotationPendingPoint,
    onStartObjectAnnotation,
    onExitObjectAnnotation,
    onDetectObjectAt,
    onAnnotateRegion,
}: CanvasAreaProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);
    const dragDepthRef = useRef(0);
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
        preserveAspectRatio?: boolean;
        initialPositions?: { id: string; x: number; y: number; width?: number; height?: number }[];
        selectionBounds?: { left: number; top: number; right: number; bottom: number };
    } | null>(null);
    const draggedElementIdRef = useRef<string | null>(null);
    const resizeHandleRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const getCanvasPoint = (clientX: number, clientY: number) => ({
        x: (clientX - pan.x) / scale,
        y: (clientY - 56 - pan.y) / scale,
    });

    const handleCanvasDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepthRef.current += 1;
        setIsDragOverCanvas(true);
    };

    const handleCanvasDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isDragOverCanvas) {
            setIsDragOverCanvas(true);
        }
    };

    const handleCanvasDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
            setIsDragOverCanvas(false);
        }
    };

    const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDragOverCanvas(false);

        const imageFiles = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
        if (!imageFiles.length) return;

        const point = getCanvasPoint(e.clientX, e.clientY);
        onDropImages?.(imageFiles, point);
    };

    const getGroupedSelectionIds = (elementId: string | null) => {
        if (!elementId) return [] as string[];
        const element = elements.find((el) => el.id === elementId);
        if (!element) return [] as string[];
        if (!element.groupId) return [element.id];
        return elements
            .filter((el) => el.type !== 'connector' && el.groupId === element.groupId)
            .map((el) => el.id);
    };

    const handleMouseDown = (
        e: React.MouseEvent,
        elementId: string | null,
        elementX: number = 0,
        elementY: number = 0,
        width: number = 0,
        height: number = 0
    ) => {
        const isPanGesture = activeTool === 'hand' || e.button === 1;

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

        const clickedElement = elements.find((el) => el.id === elementId);
        if (annotationImageId && clickedElement?.id === annotationImageId && clickedElement.type === 'image') {
            if (isDetectingObject) {
                return;
            }

            const point = getCanvasPoint(e.clientX, e.clientY);
            onDetectObjectAt?.(clickedElement, {
                x: Math.max(0, Math.min(point.x - clickedElement.x, clickedElement.width || 1)),
                y: Math.max(0, Math.min(point.y - clickedElement.y, clickedElement.height || 1)),
            });
            return;
        }

        const groupedIds = getGroupedSelectionIds(elementId);
        let dragSelectedIds = selectedIds;
        const isToggleSelect = e.ctrlKey || e.metaKey || e.shiftKey;
        const isGroupAlreadySelected = groupedIds.length > 0 && groupedIds.every((id) => selectedIds.includes(id));

        if (isToggleSelect) {
            if (isGroupAlreadySelected) {
                dragSelectedIds = selectedIds.filter((id) => !groupedIds.includes(id));
                onSelect(dragSelectedIds);
            } else {
                dragSelectedIds = Array.from(new Set([...selectedIds, ...groupedIds]));
                onSelect(dragSelectedIds);
            }
        } else {
            if (!isGroupAlreadySelected || groupedIds.length !== selectedIds.length) {
                dragSelectedIds = groupedIds;
                onSelect(dragSelectedIds);
            }
        }

        if ((e.target as HTMLElement).dataset.handle) return;

        setIsDragging(true);
        onDragStart?.();
        draggedElementIdRef.current = elementId;

        const initialPositions = elements
            .filter((el) => dragSelectedIds.includes(el.id))
            .map((el) => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }));

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

    const handleSelectionResizeStart = (e: React.MouseEvent, handle: 'nw' | 'ne' | 'sw' | 'se') => {
        if (!selectionBounds || actionableSelection.length < 2) return;
        e.stopPropagation();
        setIsResizing(true);
        draggedElementIdRef.current = '__selection__';
        resizeHandleRef.current = handle;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            elementX: selectionBounds.left,
            elementY: selectionBounds.top,
            width: selectionBounds.right - selectionBounds.left,
            height: selectionBounds.bottom - selectionBounds.top,
            panX: 0,
            panY: 0,
            preserveAspectRatio: e.shiftKey,
            initialPositions: actionableSelection.map((el) => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height })),
            selectionBounds,
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
            applyElementUpdates(dragStartRef.current.initialPositions.map((pos) => ({
                id: pos.id,
                updates: { x: pos.x + dx, y: pos.y + dy },
            })));
        } else if (isResizing && resizeHandleRef.current) {
            if (draggedElementIdRef.current === '__selection__' && dragStartRef.current.selectionBounds && dragStartRef.current.initialPositions) {
                const bounds = dragStartRef.current.selectionBounds;
                const minSelectionWidth = 40;
                const minSelectionHeight = 40;
                let nextLeft = bounds.left;
                let nextTop = bounds.top;
                let nextRight = bounds.right;
                let nextBottom = bounds.bottom;

                if (resizeHandleRef.current.includes('w')) {
                    nextLeft = Math.min(bounds.left + dx, bounds.right - minSelectionWidth);
                }
                if (resizeHandleRef.current.includes('e')) {
                    nextRight = Math.max(bounds.right + dx, bounds.left + minSelectionWidth);
                }
                if (resizeHandleRef.current.includes('n')) {
                    nextTop = Math.min(bounds.top + dy, bounds.bottom - minSelectionHeight);
                }
                if (resizeHandleRef.current.includes('s')) {
                    nextBottom = Math.max(bounds.bottom + dy, bounds.top + minSelectionHeight);
                }

                let nextWidth = Math.max(minSelectionWidth, nextRight - nextLeft);
                let nextHeight = Math.max(minSelectionHeight, nextBottom - nextTop);
                const baseWidth = Math.max(1, bounds.right - bounds.left);
                const baseHeight = Math.max(1, bounds.bottom - bounds.top);

                if (dragStartRef.current.preserveAspectRatio) {
                    const uniformScale = Math.max(nextWidth / baseWidth, nextHeight / baseHeight);
                    nextWidth = Math.max(minSelectionWidth, baseWidth * uniformScale);
                    nextHeight = Math.max(minSelectionHeight, baseHeight * uniformScale);

                    if (resizeHandleRef.current.includes('w')) {
                        nextLeft = bounds.right - nextWidth;
                        nextRight = bounds.right;
                    } else {
                        nextRight = bounds.left + nextWidth;
                        nextLeft = bounds.left;
                    }

                    if (resizeHandleRef.current.includes('n')) {
                        nextTop = bounds.bottom - nextHeight;
                        nextBottom = bounds.bottom;
                    } else {
                        nextBottom = bounds.top + nextHeight;
                        nextTop = bounds.top;
                    }
                }

                applyElementUpdates(dragStartRef.current.initialPositions.map((pos) => {
                    const relX = (pos.x - bounds.left) / baseWidth;
                    const relY = (pos.y - bounds.top) / baseHeight;
                    const relRight = ((pos.x + (pos.width || 0)) - bounds.left) / baseWidth;
                    const relBottom = ((pos.y + (pos.height || 0)) - bounds.top) / baseHeight;
                    const scaledX = nextLeft + relX * nextWidth;
                    const scaledY = nextTop + relY * nextHeight;
                    const scaledRight = nextLeft + relRight * nextWidth;
                    const scaledBottom = nextTop + relBottom * nextHeight;
                    const nextElementWidth = scaledRight - scaledX;
                    const nextElementHeight = scaledBottom - scaledY;

                    return {
                        id: pos.id,
                        updates: {
                            x: scaledX,
                            y: scaledY,
                            width: pos.width !== undefined ? Math.max(10, nextElementWidth) : pos.width,
                            height: pos.height !== undefined ? Math.max(10, nextElementHeight) : pos.height,
                        },
                    };
                }));
                return;
            }

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

            if (annotationImageId) {
                const imageElement = elements.find((el) => el.id === annotationImageId && el.type === 'image');
                if (imageElement) {
                    const localX = Math.max(0, x1 - imageElement.x);
                    const localY = Math.max(0, y1 - imageElement.y);
                    const localRight = Math.min(imageElement.width || 0, x2 - imageElement.x);
                    const localBottom = Math.min(imageElement.height || 0, y2 - imageElement.y);
                    const width = Math.max(1, localRight - localX);
                    const height = Math.max(1, localBottom - localY);

                    onAnnotateRegion?.(imageElement, {
                        x: localX,
                        y: localY,
                        width,
                        height,
                    });
                }
            } else {
                const directlySelected = elements.filter((el) => {
                    const elRight = el.x + (el.width || 0);
                    const elBottom = el.y + (el.height || 0);
                    return el.x < x2 && elRight > x1 && el.y < y2 && elBottom > y1;
                });

                const expandedSelectedIds = Array.from(new Set(directlySelected.flatMap((el) => getGroupedSelectionIds(el.id))));

                onSelect(expandedSelectedIds);
            }
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handleMouseUp intentionally reads the current gesture state mirrored in these dependencies.
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

    const applyElementUpdates = (updates: Array<{ id: string; updates: Partial<CanvasElement> }>) => {
        if (updates.length === 0) return;
        if (onElementsChange) {
            onElementsChange(updates.map(({ id, updates: nextUpdates }) => ({ id, newAttrs: nextUpdates })));
            return;
        }
        updates.forEach(({ id, updates: nextUpdates }) => {
            onElementChange(id, nextUpdates);
        });
    };

    const handleDuplicateSelection = () => {
        if (selectedIds.length === 0) return;

        const selectedElements = elements.filter((el) => selectedIds.includes(el.id));
        if (selectedElements.length === 0) return;

        const idMap = new Map<string, string>();
        const groupIdMap = new Map<string, string>();
        selectedElements.forEach((el) => {
            idMap.set(el.id, uuidv4());
            if (el.groupId && !groupIdMap.has(el.groupId)) {
                groupIdMap.set(el.groupId, uuidv4());
            }
        });

        const duplicatedElements = selectedElements.map((el) => {
            const nextId = idMap.get(el.id) || uuidv4();
            return {
                ...el,
                id: nextId,
                x: el.x + 20,
                y: el.y + 20,
                groupId: el.groupId ? (groupIdMap.get(el.groupId) || el.groupId) : undefined,
                linkedElements: el.linkedElements
                    ?.map((linkedId) => idMap.get(linkedId) || linkedId),
                connectorFrom: el.connectorFrom ? (idMap.get(el.connectorFrom) || el.connectorFrom) : undefined,
                connectorTo: el.connectorTo ? (idMap.get(el.connectorTo) || el.connectorTo) : undefined,
            } satisfies CanvasElement;
        });

        duplicatedElements.forEach((el) => onAddElement(el));
        onSelect(duplicatedElements.map((el) => el.id));
    };

    const handleAlignSelection = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const selectedElements = elements.filter((el) => selectedIds.includes(el.id) && el.type !== 'connector');
        if (selectedElements.length < 2) return;

        const left = Math.min(...selectedElements.map((el) => el.x));
        const right = Math.max(...selectedElements.map((el) => el.x + (el.width || 0)));
        const top = Math.min(...selectedElements.map((el) => el.y));
        const bottom = Math.max(...selectedElements.map((el) => el.y + (el.height || 0)));
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;

        applyElementUpdates(selectedElements.map((el) => {
            const width = el.width || 0;
            const height = el.height || 0;

            if (alignment === 'left') {
                return { id: el.id, updates: { x: left } };
            }
            if (alignment === 'center') {
                return { id: el.id, updates: { x: centerX - width / 2 } };
            }
            if (alignment === 'right') {
                return { id: el.id, updates: { x: right - width } };
            }
            if (alignment === 'top') {
                return { id: el.id, updates: { y: top } };
            }
            if (alignment === 'middle') {
                return { id: el.id, updates: { y: centerY - height / 2 } };
            }
            return { id: el.id, updates: { y: bottom - height } };
        }));
    };

    const handleDistributeSelection = (direction: 'horizontal' | 'vertical') => {
        const selectedElements = elements
            .filter((el) => selectedIds.includes(el.id) && el.type !== 'connector')
            .filter((el) => (direction === 'horizontal' ? (el.width || 0) > 0 : (el.height || 0) > 0));

        if (selectedElements.length < 3) return;

        if (direction === 'horizontal') {
            const sorted = [...selectedElements].sort((a, b) => a.x - b.x);
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const totalWidth = sorted.reduce((sum, el) => sum + (el.width || 0), 0);
            const span = (last.x + (last.width || 0)) - first.x;
            const gap = (span - totalWidth) / (sorted.length - 1);

            let currentX = first.x;
            const updates: Array<{ id: string; updates: Partial<CanvasElement> }> = [];
            sorted.forEach((el, index) => {
                if (index === 0) {
                    currentX = el.x + (el.width || 0) + gap;
                    return;
                }
                if (index === sorted.length - 1) return;

                updates.push({ id: el.id, updates: { x: currentX } });
                currentX += (el.width || 0) + gap;
            });
            applyElementUpdates(updates);
            return;
        }

        const sorted = [...selectedElements].sort((a, b) => a.y - b.y);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalHeight = sorted.reduce((sum, el) => sum + (el.height || 0), 0);
        const span = (last.y + (last.height || 0)) - first.y;
        const gap = (span - totalHeight) / (sorted.length - 1);

        let currentY = first.y;
        const updates: Array<{ id: string; updates: Partial<CanvasElement> }> = [];
        sorted.forEach((el, index) => {
            if (index === 0) {
                currentY = el.y + (el.height || 0) + gap;
                return;
            }
            if (index === sorted.length - 1) return;

            updates.push({ id: el.id, updates: { y: currentY } });
            currentY += (el.height || 0) + gap;
        });
        applyElementUpdates(updates);
    };

    const actionableSelection = elements.filter((el) => selectedIds.includes(el.id) && el.type !== 'connector');
    const canAlignSelection = actionableSelection.length >= 2;
    const canDistributeHorizontally = actionableSelection.filter((el) => (el.width || 0) > 0).length >= 3;
    const canDistributeVertically = actionableSelection.filter((el) => (el.height || 0) > 0).length >= 3;
    const multiSelectionGroupIds = Array.from(new Set(actionableSelection.map((el) => el.groupId).filter(Boolean))) as string[];
    const selectedGroupMemberCount = actionableSelection.filter((el) => el.groupId && multiSelectionGroupIds.includes(el.groupId)).length;
    const canGroupSelection = actionableSelection.length >= 2;
    const canUngroupSelection = actionableSelection.length > 0 && multiSelectionGroupIds.length > 0;
    const selectionBounds = actionableSelection.length > 0
        ? {
            left: Math.min(...actionableSelection.map((el) => el.x)),
            top: Math.min(...actionableSelection.map((el) => el.y)),
            right: Math.max(...actionableSelection.map((el) => el.x + (el.width || 0))),
            bottom: Math.max(...actionableSelection.map((el) => el.y + (el.height || 0))),
          }
        : null;
    const selectedSingleGroupId = multiSelectionGroupIds.length === 1 ? multiSelectionGroupIds[0] : null;

    const handleGroupSelection = () => {
        if (!canGroupSelection) return;
        const nextGroupId = uuidv4();
        applyElementUpdates(actionableSelection.map((el) => ({
            id: el.id,
            updates: { groupId: nextGroupId },
        })));
    };

    const handleUngroupSelection = () => {
        if (!canUngroupSelection) return;
        applyElementUpdates(actionableSelection
            .filter((el) => Boolean(el.groupId))
            .map((el) => ({
                id: el.id,
                updates: { groupId: undefined },
            })));
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
            className={`w-full h-full relative overflow-hidden ${
                activeTool === 'hand'
                    ? 'cursor-grab active:cursor-grabbing'
                    : activeTool === 'draw'
                        ? 'cursor-crosshair'
                        : ''
            }`}
            style={{ backgroundColor: backgroundColor ?? boardColor }}
            onMouseMove={handleMouseMove}
            onMouseDown={(e) => handleMouseDown(e, null)}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClickCanvas}
            onDragEnter={handleCanvasDragEnter}
            onDragOver={handleCanvasDragOver}
            onDragLeave={handleCanvasDragLeave}
            onDrop={handleCanvasDrop}
        >
            {isDragOverCanvas && (
                <div className="pointer-events-none absolute inset-0 z-[140] flex items-center justify-center bg-sky-500/10 backdrop-blur-[1px]">
                    <div className="rounded-2xl border border-sky-300 bg-white/92 px-5 py-3 text-sm font-medium text-sky-700 shadow-lg">
                        拖入图片到画布
                    </div>
                </div>
            )}
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
                        onOpenImageEditMode={onOpenImageEditMode}
                        onConnectFlow={onConnectFlow}
                        onDuplicate={handleDuplicate}
                        onRemoveBackground={onRemoveBackground}
                        onUpscale={onUpscale}
                        onCrop={onCrop}
                        onStartObjectAnnotation={onStartObjectAnnotation}
                    />
                </div>
            )}

            {selectedIds.length > 1 && selectionBounds && !isDragging && (
                <div
                    className="absolute z-50 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white/94 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]"
                    style={{
                        left: ((selectionBounds.left + selectionBounds.right) / 2) * scale + pan.x,
                        top: Math.max(20, selectionBounds.top * scale + pan.y - 56),
                        transform: 'translateX(-50%)'
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <span className="px-2 text-sm font-medium text-gray-700 dark:text-slate-200">
                        已选中 {selectedIds.length} 项{multiSelectionGroupIds.length > 0 ? ` · ${multiSelectionGroupIds.length} 组 / ${selectedGroupMemberCount} 个组内元素` : ''}{selectedSingleGroupId ? ' · 当前为单组选择' : ''}
                    </span>
                    <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />

                    <button
                        onClick={handleDuplicateSelection}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-white"
                        title="复制图层"
                    >
                        <Copy size={16} />
                    </button>

                    <div className="flex items-center gap-1 rounded-xl border border-gray-200/90 bg-gray-50/90 px-1 py-1 dark:border-white/10 dark:bg-white/6">
                        <button
                            onClick={() => handleAlignSelection('left')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '左对齐' : '至少选择 2 个元素才能左对齐'}
                        >
                            <AlignStartHorizontal size={15} />
                        </button>
                        <button
                            onClick={() => handleAlignSelection('center')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '水平居中对齐' : '至少选择 2 个元素才能水平居中对齐'}
                        >
                            <AlignCenter size={15} />
                        </button>
                        <button
                            onClick={() => handleAlignSelection('right')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '右对齐' : '至少选择 2 个元素才能右对齐'}
                        >
                            <AlignEndHorizontal size={15} />
                        </button>
                        <div className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-white/10" />
                        <button
                            onClick={() => handleAlignSelection('top')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '顶对齐' : '至少选择 2 个元素才能顶对齐'}
                        >
                            <AlignStartVertical size={15} />
                        </button>
                        <button
                            onClick={() => handleAlignSelection('middle')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '垂直居中对齐' : '至少选择 2 个元素才能垂直居中对齐'}
                        >
                            <AlignVerticalJustifyCenter size={15} />
                        </button>
                        <button
                            onClick={() => handleAlignSelection('bottom')}
                            disabled={!canAlignSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canAlignSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canAlignSelection ? '底对齐' : '至少选择 2 个元素才能底对齐'}
                        >
                            <AlignEndVertical size={15} />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl border border-gray-200/90 bg-gray-50/90 px-1 py-1 dark:border-white/10 dark:bg-white/6">
                        <button
                            onClick={() => handleDistributeSelection('horizontal')}
                            disabled={!canDistributeHorizontally}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canDistributeHorizontally
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canDistributeHorizontally ? '水平平均分布' : '至少选择 3 个可参与布局的元素才能水平平均分布'}
                        >
                            <AlignHorizontalJustifyCenter size={15} />
                        </button>
                        <button
                            onClick={() => handleDistributeSelection('vertical')}
                            disabled={!canDistributeVertically}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canDistributeVertically
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canDistributeVertically ? '垂直平均分布' : '至少选择 3 个可参与布局的元素才能垂直平均分布'}
                        >
                            <AlignVerticalJustifyCenter size={15} />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl border border-gray-200/90 bg-gray-50/90 px-1 py-1 dark:border-white/10 dark:bg-white/6">
                        <button
                            onClick={handleGroupSelection}
                            disabled={!canGroupSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canGroupSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canGroupSelection ? '编组' : '至少选择 2 个元素才能编组'}
                        >
                            <Link2 size={15} />
                        </button>
                        <button
                            onClick={handleUngroupSelection}
                            disabled={!canUngroupSelection}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                canUngroupSelection
                                    ? 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                                    : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                            }`}
                            title={canUngroupSelection ? '解组' : '当前选择中没有可解组的元素'}
                        >
                            <Unlink2 size={15} />
                        </button>
                    </div>

                    <button
                        onClick={() => onSelect([])}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white"
                        title="取消选择"
                    >
                        <X size={16} />
                    </button>
                    <button
                        onClick={() => onDeleteMany ? onDeleteMany(selectedIds) : selectedIds.forEach((id) => onDelete(id))}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-red-300 dark:hover:bg-red-500/12 dark:hover:text-red-200"
                        title="删除全部"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}

            {selectedIds.length > 1 && selectionBounds && !isDrawing && (
                <div
                    className="absolute pointer-events-none z-30 rounded-[22px] border border-blue-400/80 shadow-[0_0_0_1px_rgba(59,130,246,0.12),0_10px_30px_rgba(37,99,235,0.12)] dark:border-sky-300/80 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.2),0_0_28px_rgba(56,189,248,0.14)]"
                    style={{
                        left: selectionBounds.left * scale + pan.x - 6,
                        top: selectionBounds.top * scale + pan.y - 6,
                        width: (selectionBounds.right - selectionBounds.left) * scale + 12,
                        height: (selectionBounds.bottom - selectionBounds.top) * scale + 12,
                    }}
                >
                    {selectedSingleGroupId && (
                        <div className="absolute -top-7 left-0 rounded-full border border-blue-200 bg-white/95 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-600 shadow-sm dark:border-sky-400/20 dark:bg-slate-950/90 dark:text-sky-200">
                            Group
                        </div>
                    )}
                    {([
                        { handle: 'nw', position: 'top-0 left-0', cursor: 'cursor-nwse-resize' },
                        { handle: 'ne', position: 'top-0 right-0', cursor: 'cursor-nesw-resize' },
                        { handle: 'sw', position: 'bottom-0 left-0', cursor: 'cursor-nesw-resize' },
                        { handle: 'se', position: 'bottom-0 right-0', cursor: 'cursor-nwse-resize' },
                    ] as const).map(({ handle, position, cursor }) => (
                        <button
                            key={handle}
                            type="button"
                            data-handle={handle}
                            onMouseDown={(e) => handleSelectionResizeStart(e, handle)}
                            className={`pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500 bg-white shadow-sm dark:border-sky-300 dark:bg-slate-950 ${position} ${cursor}`}
                        />
                    ))}
                </div>
            )}

            <div
                ref={containerRef}
                className="w-full h-full origin-top-left transition-transform duration-200 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
                <div
                    className="absolute inset-0 opacity-[0.22] dark:opacity-[0.22]"
                    style={{
                        backgroundImage: 'radial-gradient(rgba(148,163,184,0.28) 1px, transparent 1px)',
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
                                    <div className="w-full h-full rounded-2xl border border-sky-400/35 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.24),_rgba(15,23,42,0.92)_62%)] flex flex-col items-center justify-center text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_rgba(2,6,23,0.35)] backdrop-blur-sm">
                                        <div className="w-20 h-20 mb-4 opacity-60">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                            </svg>
                                        </div>
                                        <div className="text-sm font-medium">Image Generator</div>
                                        <div className="text-xs opacity-70">{Math.round(el.width || 0)} x {Math.round(el.height || 0)}</div>
                                    </div>
                                )}

                                {el.type === 'video-generator' && (() => {
                                    const promptText = typeof el.prompt === 'string' ? el.prompt : '';
                                    const promptParts = promptText.split('｜').filter(Boolean);
                                    const shotLabel = (typeof el.storyboardShotLabel === 'string' && el.storyboardShotLabel) || promptParts[0] || '镜头';
                                    const shotTitle = (typeof el.storyboardTitle === 'string' && el.storyboardTitle) || promptParts[1] || '视频生成器';
                                    const shotMeta = (typeof el.storyboardMeta === 'string' && el.storyboardMeta) || promptParts[2] || `${Math.round(el.width || 0)} x ${Math.round(el.height || 0)}`;
                                    const sizeMeta = (typeof el.storyboardVideoSize === 'string' && el.storyboardVideoSize)
                                        || (typeof el.content === 'string' && /^\d+x\d+$/.test(el.content) ? el.content : undefined);
                                    const aspectLabel = (typeof el.storyboardAspectRatio === 'string' && el.storyboardAspectRatio)
                                        || shotMeta.match(/(9:16|16:9|4:5|1:1)/)?.[1];
                                    const orientationLabel = el.storyboardOrientation === 'landscape'
                                        ? '横版'
                                        : el.storyboardOrientation === 'square'
                                            ? '方形'
                                            : el.storyboardOrientation === 'portrait'
                                                ? '竖版'
                                                : shotMeta.includes('Landscape') || shotMeta.includes('横版')
                                                    ? '横版'
                                                    : shotMeta.includes('Square') || shotMeta.includes('方形')
                                                        ? '方形'
                                                        : '竖版';
                                    const boardBrief = (typeof el.storyboardBrief === 'string' && el.storyboardBrief)
                                        || promptParts[3]
                                        || '已准备好承接运动、镜头调度与节奏方向。';
                                    const durationLabel = typeof el.storyboardDurationSec === 'number' ? `${el.storyboardDurationSec}s` : undefined;
                                    const sequenceHint = typeof el.storyboard序列Hint === 'string' && el.storyboard序列Hint
                                        ? el.storyboard序列Hint
                                        : '下一镜 →';
                                    const sequenceState = typeof el.storyboard序列State === 'string' && el.storyboard序列State
                                        ? el.storyboard序列State
                                        : 'middle';
                                    const shotIndex = typeof el.storyboardShotIndex === 'number' ? el.storyboardShotIndex : undefined;
                                    const shotCount = typeof el.storyboardShotCount === 'number' ? el.storyboardShotCount : undefined;
                                    const sourceAspectLabel = typeof el.storyboardSourceAspectRatio === 'string' ? el.storyboardSourceAspectRatio : undefined;
                                    const frameDeltaLabel = sourceAspectLabel && aspectLabel
                                        ? sourceAspectLabel === aspectLabel
                                            ? '源画幅锁定'
                                            : `${sourceAspectLabel} → ${aspectLabel}`
                                        : aspectLabel || '自动画幅';
                                    const coverageLabel = sourceAspectLabel && aspectLabel
                                        ? sourceAspectLabel === aspectLabel
                                            ? '覆盖范围锁定'
                                            : (el.storyboardOrientation === 'landscape'
                                                ? '重构为横版'
                                                : el.storyboardOrientation === 'square'
                                                    ? '中心重裁'
                                                    : '重构为竖版')
                                        : '覆盖范围锁定';
                                    const chipPrimaryClass = 'rounded-full border border-blue-200/80 bg-white/88 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/85 shadow-sm dark:border-white/10 dark:bg-white/7 dark:text-sky-100/80';
                                    const chipSecondaryClass = 'rounded-full bg-blue-600/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/85 dark:bg-sky-400/12 dark:text-sky-100/80';
                                    const infoCardClass = 'rounded-2xl border border-blue-100/80 bg-blue-50/70 px-3 py-2 dark:border-white/8 dark:bg-white/4';
                                    const boardProgressLabel = shotIndex && shotCount
                                        ? `${String(shotIndex).padStart(2, '0')} / ${String(shotCount).padStart(2, '0')}`
                                        : shotIndex
                                            ? `镜头 ${String(shotIndex).padStart(2, '0')}`
                                            : '草稿';
                                    const frameToneClass = el.storyboardOrientation === 'landscape'
                                        ? 'from-violet-500/12 via-fuchsia-500/10 to-transparent dark:from-violet-400/18 dark:via-fuchsia-400/12 dark:to-transparent'
                                        : el.storyboardOrientation === 'square'
                                            ? 'from-emerald-500/12 via-teal-500/10 to-transparent dark:from-emerald-400/18 dark:via-teal-400/12 dark:to-transparent'
                                            : 'from-sky-500/12 via-blue-500/10 to-transparent dark:from-sky-400/18 dark:via-blue-400/12 dark:to-transparent';
                                    const sequenceBarClass = sequenceState === 'single'
                                        ? 'w-8 opacity-40'
                                        : sequenceState === 'first'
                                            ? 'w-16 opacity-95'
                                            : sequenceState === 'last'
                                                ? 'w-6 opacity-80'
                                                : 'w-12 opacity-75';
                                    const compactPortrait = el.storyboardOrientation === 'portrait' && (el.width || 0) <= 280;
                                    const compactVertical = (el.height || 0) >= 420;
                                    const boardModeLabel = typeof el.storyboardBoardMode === 'string' && el.storyboardBoardMode
                                        ? el.storyboardBoardMode
                                        : sequenceState === 'single' ? '单镜头板' : '分镜流程';
                                    const detailRailLabel = el.storyboardRenderProfile === 'high' ? '高细节' : '标准细节';
                                    const laneLabel = el.storyboardOrientation === 'landscape'
                                        ? '横版轨道'
                                        : el.storyboardOrientation === 'square'
                                            ? '方形轨道'
                                            : '竖版轨道';
                                    const outputRailLabel = sizeMeta ? `${sizeMeta} 渲染` : '分镜渲染';
                                    const fallbackSummary = el.generationMetadata?.providerFallbackUsed
                                        ? (el.generationMetadata.fallbackReason || '已触发回退')
                                        : undefined;

                                    return (
                                        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-blue-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] text-blue-950 shadow-[0_18px_48px_rgba(37,99,235,0.18)] dark:border-sky-400/30 dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),rgba(15,23,42,0.94)_68%)] dark:text-sky-50">
                                            <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${frameToneClass}`} />
                                            <div className="relative flex items-center justify-between border-b border-blue-200/80 px-4 py-3 dark:border-white/10">
                                                <div className="flex items-center gap-2">
                                                    <div className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white dark:bg-sky-400/20 dark:text-sky-100">
                                                        {shotLabel}
                                                    </div>
                                                    <div className={`h-2 rounded-full bg-blue-600/15 dark:bg-sky-400/14 ${sequenceBarClass}`} />
                                                </div>
                                                <div className="text-[11px] uppercase tracking-[0.14em] text-blue-600/80 dark:text-sky-200/70">
                                                    {boardModeLabel === '镜头队列'
                                                        ? sequenceState === 'first'
                                                            ? '队列起点'
                                                            : sequenceState === 'last'
                                                                ? '队列终点'
                                                                : sequenceState === 'single'
                                                                    ? '单帧'
                                                                    : '镜头队列'
                                                        : sequenceState === 'first'
                                                            ? '流程起点'
                                                            : sequenceState === 'last'
                                                                ? '流程终点'
                                                                : sequenceState === 'single'
                                                                    ? '单帧'
                                                                    : '制作板'}
                                                </div>
                                            </div>
                                            <div className="relative flex h-[calc(100%-56px)] flex-col justify-between p-4">
                                                <div className="pointer-events-none absolute inset-3 rounded-[22px] border border-dashed border-blue-200/70 dark:border-white/10" />
                                                <div>
                                                    <div className="mb-3 flex items-start justify-between gap-3">
                                                        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-blue-600 shadow-sm dark:border-white/10 dark:bg-white/6 dark:text-sky-100/75">
                                                            <span>{boardModeLabel}</span>
                                                            {sizeMeta && <span className="opacity-70">· {sizeMeta}</span>}
                                                        </div>
                                                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-sky-400/12 dark:text-sky-200">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                                            </svg>
                                                        </div>
                                                        <div className="flex max-w-[58%] flex-wrap items-center justify-end gap-1.5 text-[10px] font-medium uppercase tracking-wide text-blue-700/80 dark:text-sky-100/75">
                                                            {aspectLabel && !compactPortrait && (
                                                                <span className={chipSecondaryClass}>{aspectLabel}</span>
                                                            )}
                                                            <span className={chipSecondaryClass}>{compactPortrait ? aspectLabel || orientationLabel : orientationLabel}</span>
                                                            <span className={chipSecondaryClass}>{laneLabel}</span>
                                                            {durationLabel && (
                                                                <span className={chipSecondaryClass}>{durationLabel}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="line-clamp-2 pr-20 text-base font-semibold leading-snug">{shotTitle}</div>
                                                    <div className="mt-1 text-xs text-blue-700/80 dark:text-sky-200/70">{shotMeta}</div>
                                                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/80 dark:text-sky-100/75">
                                                        <span className={chipPrimaryClass}>{sequenceState === 'single' ? '单镜头' : sequenceState === 'first' ? '镜头带起点' : sequenceState === 'last' ? '镜头带终点' : '镜头带'}</span>
                                                        <span className={chipPrimaryClass}>{boardModeLabel}</span>
                                                        <span className={chipPrimaryClass}>{boardProgressLabel}</span>
                                                        <span className={chipPrimaryClass}>{laneLabel}</span>
                                                        {!compactVertical && <span className={chipPrimaryClass}>{orientationLabel}</span>}
                                                        {aspectLabel && !compactVertical && (
                                                            <span className={chipPrimaryClass}>{aspectLabel}</span>
                                                        )}
                                                        {durationLabel && (
                                                            <span className={chipPrimaryClass}>{durationLabel}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="rounded-2xl border border-blue-200/80 bg-white/75 px-3 py-2 text-xs leading-5 text-blue-700/85 dark:border-white/10 dark:bg-white/5 dark:text-sky-100/75">
                                                        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-500/70 dark:text-sky-200/45">镜头说明</div>
                                                        <div className={compactPortrait ? 'line-clamp-4' : 'line-clamp-5'}>{boardBrief}</div>
                                                        {fallbackSummary && (
                                                            <div className="mt-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100/90">回退说明：{fallbackSummary}</div>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-700/80 dark:text-sky-100/70">
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">画幅</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{aspectLabel || '自动画幅'} · {orientationLabel}</div>
                                                        </div>
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">输出</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{outputRailLabel}</div>
                                                        </div>
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">画幅差异</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{frameDeltaLabel}</div>
                                                        </div>
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">覆盖策略</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{coverageLabel}</div>
                                                        </div>
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">细节轨道</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{detailRailLabel}</div>
                                                        </div>
                                                        <div className={infoCardClass}>
                                                            <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">序列</div>
                                                            <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{sequenceHint}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {!selectedIds.includes(el.id) && !isDrawing && (() => {
                                    const isLinked = selectedIds.some((selectedId) => {
                                        const selectedEl = elements.find((e) => e.id === selectedId);
                                        return selectedEl?.linkedElements?.includes(el.id) || el.linkedElements?.includes(selectedId);
                                    });
                                    const isInSelectedGroup = selectedIds.some((selectedId) => {
                                        const selectedEl = elements.find((e) => e.id === selectedId);
                                        return Boolean(selectedEl?.groupId && el.groupId && selectedEl.groupId === el.groupId);
                                    });

                                    if (isInSelectedGroup) {
                                        return <div className="absolute inset-0 rounded-[inherit] border border-blue-300/90 pointer-events-none opacity-60 dark:border-sky-300/60" />;
                                    }

                                    return isLinked ? <div className="absolute inset-0 border-2 border-dashed border-purple-400 pointer-events-none opacity-60" /> : null;
                                })()}

                                {selectedIds.includes(el.id) && !isDrawing && (
                                    <>
                                        <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none dark:rounded-[inherit] dark:border-sky-400/90 dark:shadow-[0_0_0_1px_rgba(14,165,233,0.18),0_0_28px_rgba(56,189,248,0.24)]" />
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

                                {el.type === 'image' && el.content && (() => {
                                    const metadata = el.generationMetadata;
                                    const providerLabel = getProviderLabel(metadata);
                                    const modelLabel = getModelLabel(metadata);
                                    const officialOptionChips = getOfficialOptionChips(metadata);
                                    const taskDebugChips = getTaskDebugChips(metadata);
                                    const taskDebugSummary = getTaskDebugSummary(metadata);
                                    const fallbackSummary = metadata?.providerFallbackUsed
                                        ? (metadata.fallbackReason || '已触发回退')
                                        : undefined;
                                    const promptPreview = typeof metadata?.sourcePrompt === 'string' && metadata.sourcePrompt
                                        ? metadata.sourcePrompt
                                        : typeof el.prompt === 'string' && el.prompt
                                            ? el.prompt
                                            : undefined;

                                    return (
                                        <div className="relative w-full h-full overflow-hidden rounded-lg bg-slate-950">
                                            <img src={el.content} alt="Upload" className="w-full h-full object-contain pointer-events-none select-none rounded-lg" />
                                            {(providerLabel || modelLabel || officialOptionChips.length > 0 || taskDebugChips.length > 0 || taskDebugSummary || fallbackSummary || promptPreview) && (
                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/88 via-slate-950/48 to-transparent p-3 text-white">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                                                        {providerLabel && <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-white/88">{providerLabel}</span>}
                                                        {modelLabel && <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-white/82">{modelLabel}</span>}
                                                        {officialOptionChips.map((chip) => (
                                                            <span key={chip} className="rounded-full border border-cyan-300/20 bg-cyan-400/15 px-2.5 py-1 text-cyan-50">{chip}</span>
                                                        ))}
                                                        {taskDebugChips.map((chip) => (
                                                            <span key={chip} className="rounded-full border border-violet-300/20 bg-violet-400/15 px-2.5 py-1 text-violet-50 normal-case tracking-normal">{chip}</span>
                                                        ))}
                                                    </div>
                                                    {promptPreview && (
                                                        <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/82">{promptPreview}</div>
                                                    )}
                                                    {taskDebugSummary && (
                                                        <div className="mt-2 rounded-xl border border-violet-300/20 bg-violet-400/12 px-2.5 py-2 text-[11px] leading-5 text-violet-50 normal-case">{taskDebugSummary}</div>
                                                    )}
                                                    {fallbackSummary && (
                                                        <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/12 px-2.5 py-2 text-[11px] leading-5 text-amber-50">回退说明：{fallbackSummary}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {el.type === 'video' && el.content && (() => {
                                    const hasStoryboardMeta = Boolean(el.storyboardShotLabel || el.storyboardTitle || el.storyboardAspectRatio || el.storyboardVideoSize);

                                    if (!hasStoryboardMeta) {
                                        return (
                                            <div className="relative w-full h-full rounded-lg overflow-hidden">
                                                <video src={el.content} className="w-full h-full object-cover select-none" controls loop playsInline onClick={(e) => e.stopPropagation()} />
                                            </div>
                                        );
                                    }

                                    const promptText = typeof el.prompt === 'string' ? el.prompt : '';
                                    const promptParts = promptText.split('｜').filter(Boolean);
                                    const shotLabel = (typeof el.storyboardShotLabel === 'string' && el.storyboardShotLabel) || promptParts[0] || '镜头';
                                    const shotTitle = (typeof el.storyboardTitle === 'string' && el.storyboardTitle) || promptParts[1] || '已渲染镜头';
                                    const shotMeta = (typeof el.storyboardMeta === 'string' && el.storyboardMeta) || promptParts[2] || `${Math.round(el.width || 0)} x ${Math.round(el.height || 0)}`;
                                    const sizeMeta = (typeof el.storyboardVideoSize === 'string' && el.storyboardVideoSize) || undefined;
                                    const aspectLabel = (typeof el.storyboardAspectRatio === 'string' && el.storyboardAspectRatio) || shotMeta.match(/(9:16|16:9|4:5|1:1)/)?.[1];
                                    const orientationLabel = el.storyboardOrientation === 'landscape'
                                        ? 'Landscape'
                                        : el.storyboardOrientation === 'square'
                                            ? 'Square'
                                            : 'Portrait';
                                    const boardBrief = (typeof el.storyboardBrief === 'string' && el.storyboardBrief)
                                        || promptParts[3]
                                        || 'Rendered from storyboard direction.';
                                    const durationLabel = typeof el.storyboardDurationSec === 'number' ? `${el.storyboardDurationSec}s` : undefined;
                                    const sequenceHint = typeof el.storyboard序列Hint === 'string' && el.storyboard序列Hint
                                        ? el.storyboard序列Hint
                                        : 'Ready';
                                    const sequenceState = typeof el.storyboard序列State === 'string' && el.storyboard序列State
                                        ? el.storyboard序列State
                                        : 'single';
                                    const shotIndex = typeof el.storyboardShotIndex === 'number' ? el.storyboardShotIndex : undefined;
                                    const shotCount = typeof el.storyboardShotCount === 'number' ? el.storyboardShotCount : undefined;
                                    const sourceAspectLabel = typeof el.storyboardSourceAspectRatio === 'string' ? el.storyboardSourceAspectRatio : undefined;
                                    const frameDeltaLabel = sourceAspectLabel && aspectLabel
                                        ? sourceAspectLabel === aspectLabel
                                            ? '源画幅锁定'
                                            : `${sourceAspectLabel} → ${aspectLabel}`
                                        : aspectLabel || '自动画幅';
                                    const coverageLabel = sourceAspectLabel && aspectLabel
                                        ? sourceAspectLabel === aspectLabel
                                            ? '覆盖范围锁定'
                                            : (el.storyboardOrientation === 'landscape'
                                                ? '重构为横版'
                                                : el.storyboardOrientation === 'square'
                                                    ? '中心重裁'
                                                    : '重构为竖版')
                                        : '覆盖范围锁定';
                                    const resolvedSourceAspect = (sourceAspectLabel as '9:16' | '16:9' | '4:5' | '1:1' | undefined) ?? ((aspectLabel as '9:16' | '16:9' | '4:5' | '1:1' | undefined) ?? '9:16');
                                    const resolvedCurrentAspect = (aspectLabel as '9:16' | '16:9' | '4:5' | '1:1' | undefined) ?? '9:16';
                                    const reviewRailState = getStoryboardReviewRailState(resolvedSourceAspect, resolvedCurrentAspect);
                                    const reviewRailLabel = getStoryboardReviewRailLabel(resolvedSourceAspect, resolvedCurrentAspect);
                                    const reviewRailToneClass = getReviewRailToneClass(reviewRailState);
                                    const chipPrimaryClass = 'rounded-full border border-blue-200/80 bg-white/88 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/85 shadow-sm dark:border-white/10 dark:bg-white/7 dark:text-sky-100/80';
                                    const chipSecondaryClass = 'rounded-full bg-blue-600/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/85 dark:bg-sky-400/12 dark:text-sky-100/80';
                                    const infoCardClass = 'rounded-2xl border border-blue-100/80 bg-blue-50/70 px-3 py-2 dark:border-white/8 dark:bg-white/4';
                                    const boardProgressLabel = shotIndex && shotCount
                                        ? `${String(shotIndex).padStart(2, '0')} / ${String(shotCount).padStart(2, '0')}`
                                        : shotIndex
                                            ? `镜头 ${String(shotIndex).padStart(2, '0')}`
                                            : '已渲染';
                                    const boardModeLabel = (typeof el.storyboardBoardMode === 'string' && el.storyboardBoardMode)
                                        || (sequenceState === 'single' ? '单镜头板' : '分镜流程');
                                    const frameToneClass = el.storyboardOrientation === 'landscape'
                                        ? 'from-violet-500/16 via-fuchsia-500/12 to-transparent dark:from-violet-400/24 dark:via-fuchsia-400/16 dark:to-transparent'
                                        : el.storyboardOrientation === 'square'
                                            ? 'from-emerald-500/16 via-teal-500/12 to-transparent dark:from-emerald-400/24 dark:via-teal-400/16 dark:to-transparent'
                                            : 'from-sky-500/16 via-blue-500/12 to-transparent dark:from-sky-400/24 dark:via-blue-400/16 dark:to-transparent';
                                    const sequenceBarClass = sequenceState === 'single'
                                        ? 'w-8 opacity-45'
                                        : sequenceState === 'first'
                                            ? 'w-16 opacity-95'
                                            : sequenceState === 'last'
                                                ? 'w-6 opacity-80'
                                                : 'w-12 opacity-75';
                                    const compactPortrait = el.storyboardOrientation === 'portrait' && (el.width || 0) <= 280;
                                    const compactVertical = (el.height || 0) >= 420;
                                    const laneLabel = el.storyboardOrientation === 'landscape'
                                        ? '横版轨道'
                                        : el.storyboardOrientation === 'square'
                                            ? '方形轨道'
                                            : '竖版轨道';
                                    const providerLabel = getProviderLabel(el.generationMetadata);
                                    const modelLabel = getModelLabel(el.generationMetadata);
                                    const fallbackSummary = el.generationMetadata?.providerFallbackUsed
                                        ? (el.generationMetadata.fallbackReason || '已触发回退')
                                        : undefined;

                                    return (
                                        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-blue-300/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.96))] text-blue-950 shadow-[0_18px_48px_rgba(37,99,235,0.18)] dark:border-sky-400/30 dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),rgba(15,23,42,0.96)_68%)] dark:text-sky-50">
                                            <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${frameToneClass}`} />
                                            <div className="relative flex items-center justify-between border-b border-blue-200/80 px-4 py-3 dark:border-white/10">
                                                <div className="flex items-center gap-2">
                                                    <div className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white dark:bg-sky-400/20 dark:text-sky-100">{shotLabel}</div>
                                                    <div className={`h-2 rounded-full bg-blue-600/15 dark:bg-sky-400/14 ${sequenceBarClass}`} />
                                                </div>
                                                <div className="text-[11px] uppercase tracking-[0.14em] text-blue-600/80 dark:text-sky-200/70">
                                                    {boardModeLabel === '镜头队列'
                                                        ? sequenceState === 'first'
                                                            ? '队列起点'
                                                            : sequenceState === 'last'
                                                                ? '队列终点'
                                                                : sequenceState === 'single'
                                                                    ? '单帧'
                                                                    : '已渲染队列'
                                                        : sequenceState === 'first'
                                                            ? '流程起点'
                                                            : sequenceState === 'last'
                                                                ? '流程终点'
                                                                : sequenceState === 'single'
                                                                    ? '单帧'
                                                                    : '已渲染流程'}
                                                </div>
                                            </div>
                                            <div className="relative flex h-[calc(100%-56px)] flex-col p-4">
                                                <div className="pointer-events-none absolute inset-3 rounded-[22px] border border-dashed border-blue-200/70 dark:border-white/10" />
                                                <div className="mb-3 flex items-start justify-between gap-3">
                                                    <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-blue-600 shadow-sm dark:border-white/10 dark:bg-white/6 dark:text-sky-100/75">
                                                        <span>{boardModeLabel}</span>
                                                        {sizeMeta && <span className="opacity-70">· {sizeMeta}</span>}
                                                    </div>
                                                    <div>
                                                        <div className="line-clamp-2 pr-20 text-base font-semibold leading-snug">{shotTitle}</div>
                                                        <div className="mt-1 text-xs text-blue-700/80 dark:text-sky-200/70">{shotMeta}</div>
                                                    </div>
                                                    <div className="flex max-w-[58%] flex-wrap items-center justify-end gap-1.5 text-[10px] font-medium uppercase tracking-wide text-blue-700/80 dark:text-sky-100/75">
                                                        {aspectLabel && !compactPortrait && <span className={chipSecondaryClass}>{aspectLabel}</span>}
                                                        <span className={chipSecondaryClass}>{compactPortrait ? aspectLabel || orientationLabel : orientationLabel}</span>
                                                        <span className={chipSecondaryClass}>{laneLabel}</span>
                                                        {durationLabel && <span className={chipSecondaryClass}>{durationLabel}</span>}
                                                    </div>
                                                </div>
                                                <div className="relative flex-1 overflow-hidden rounded-2xl border border-blue-200/80 bg-black/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:border-white/10">
                                                    <video src={el.content} className="h-full w-full object-cover select-none" controls loop playsInline onClick={(e) => e.stopPropagation()} />
                                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/68 via-black/18 to-transparent p-2.5 text-white">
                                                        <div className="mb-1 flex items-center justify-between gap-1.5">
                                                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                                                                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/15 px-2.5 py-1 text-emerald-50">已渲染</span>
                                                                <span className={`rounded-full border px-2.5 py-1 ${el.storyboardRenderProfile === 'high' ? 'border-violet-300/20 bg-violet-400/15 text-violet-50' : 'border-sky-300/20 bg-sky-400/15 text-sky-50'}`}>{el.storyboardRenderProfile === 'high' ? '高细节' : '标准细节'}</span>
                                                                <span className={`rounded-full border px-2.5 py-1 ${reviewRailToneClass}`}>{reviewRailLabel}</span>
                                                                <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-white/70">{boardModeLabel} · {boardProgressLabel}</span>
                                                            </div>
                                                            <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/75">审阅轨 · 就绪</span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                                                            <span className="rounded-full border border-white/15 bg-white/10 px-2 py-1">{sequenceHint}</span>
                                                            <span className="rounded-full border border-white/12 bg-white/8 px-2 py-1 text-white/82">{frameDeltaLabel}</span>
                                                            <span className="rounded-full border border-white/10 bg-white/6 px-2 py-1 text-white/76">{laneLabel}</span>
                                                            {sizeMeta && <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-white/75">{sizeMeta}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-700/80 dark:text-sky-100/75">
                                                    <span className={chipPrimaryClass}>{sequenceState === 'single' ? '单镜头' : sequenceState === 'first' ? '镜头带起点' : sequenceState === 'last' ? '镜头带终点' : '镜头带'}</span>
                                                    <span className={chipPrimaryClass}>{boardModeLabel}</span>
                                                    <span className={chipPrimaryClass}>{boardProgressLabel}</span>
                                                    {!compactVertical && <span className={chipPrimaryClass}>{orientationLabel}</span>}
                                                    {aspectLabel && !compactVertical && <span className={chipPrimaryClass}>{aspectLabel}</span>}
                                                    {durationLabel && <span className={chipPrimaryClass}>{durationLabel}</span>}
                                                    {providerLabel && <span className={chipPrimaryClass}>{providerLabel}</span>}
                                                    {modelLabel && <span className={chipPrimaryClass}>{modelLabel}</span>}
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-blue-700/80 dark:text-sky-100/70">
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">画幅</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{aspectLabel || '自动画幅'} · {orientationLabel}</div>
                                                    </div>
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">渲染输出</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{sizeMeta || '已渲染'}</div>
                                                    </div>
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">画幅差异</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{frameDeltaLabel}</div>
                                                    </div>
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">覆盖策略</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{coverageLabel}</div>
                                                    </div>
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">序列</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{sequenceHint}</div>
                                                    </div>
                                                    <div className={infoCardClass}>
                                                        <div className="uppercase tracking-wide text-blue-500/70 dark:text-sky-200/45">审阅轨</div>
                                                        <div className="mt-1 font-medium text-blue-900 dark:text-sky-50">{reviewRailLabel}</div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 rounded-2xl border border-blue-200/80 bg-white/75 px-3 py-2 text-xs leading-5 text-blue-700/85 dark:border-white/10 dark:bg-white/5 dark:text-sky-100/75">
                                                    <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-blue-500/70 dark:text-sky-200/45">镜头说明</div>
                                                    <div className={compactPortrait ? 'line-clamp-4' : 'line-clamp-5'}>{boardBrief}</div>
                                                    {fallbackSummary && (
                                                        <div className="mt-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100/90">回退说明：{fallbackSummary}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {el.type === 'text' && (editingTextId === el.id ? (
                                    <textarea
                                        autoFocus
                                        className="w-full h-full bg-transparent outline-none resize-none overflow-hidden"
                                        style={{ fontSize: el.fontSize || 24, fontFamily: el.fontFamily || 'Inter', color: el.color || '#000000' }}
                                        value={el.content}
                                        onChange={(e) => onElementChange(el.id, { content: e.target.value })}
                                        onBlur={() => setEditingTextId(null)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                ) : el.storyboardElementRole === 'board-lane-label' ? (
                                    <div className={`inline-flex h-full items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-sm ${el.storyboardLaneOrientation === 'landscape' ? 'border-violet-200 bg-violet-50/90 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100' : el.storyboardLaneOrientation === 'square' ? 'border-emerald-200 bg-emerald-50/90 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100' : 'border-sky-200 bg-sky-50/90 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100'}`}>
                                        {el.content || '轨道'}
                                    </div>
                                ) : el.storyboardElementRole === 'board-header' ? (() => {
                                    const parts = (el.content || '').split('｜').filter(Boolean);
                                    const title = parts[0] || '制作板';
                                    const subtitle = parts[parts.length - 1] || '';
                                    const chips = parts.slice(1, Math.max(1, parts.length - 1));
                                    const toneAligned = typeof el.borderColor === 'string' && el.borderColor.toLowerCase() === '#86efac';
                                    const reviewRailChip = chips.find((chip) => /review rail/i.test(chip));
                                    const groupedChips = {
                                        lanes: chips.filter((chip) => /lane|portrait|landscape|square/i.test(chip)),
                                        frame: chips.filter((chip) => /frame|adaptive|layout|recommend|locked/i.test(chip)),
                                        render: chips.filter((chip) => /detail|render|\d+s/i.test(chip)),
                                        coverage: chips.filter((chip) => /coverage|drift|board/i.test(chip)),
                                    };
                                    const headerReviewState = reviewRailChip
                                        ? (/check/i.test(reviewRailChip)
                                            ? 'check'
                                            : /watch/i.test(reviewRailChip)
                                                ? 'watch'
                                                : 'clean')
                                        : chips.some((chip) => /adaptive|recompose|check/i.test(chip))
                                            ? 'check'
                                            : chips.some((chip) => /crop|drift/i.test(chip))
                                                ? 'watch'
                                                : 'clean';
                                    const headerReviewLabel = headerReviewState === 'check' ? '审阅轨 · 检查' : headerReviewState === 'watch' ? '审阅轨 · 关注' : '审阅轨 · 正常';
                                    const headerReviewToneClass = getReviewRailToneClass(headerReviewState);
                                    const renderChipGroup = (label: string, values: string[]) => values.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{label}</span>
                                            {values.slice(0, 4).map((chip, index) => (
                                                <span key={`${label}-${chip}-${index}`} className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-200">
                                                    {chip}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null;
                                    return (
                                        <div className="h-full w-full overflow-hidden rounded-[26px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),rgba(15,23,42,0.94)_72%)]">
                                            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-sky-500/10 via-blue-500/6 to-transparent dark:from-sky-400/14 dark:via-blue-400/10 dark:to-transparent" />
                                            <div className="relative flex h-full flex-col justify-between">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">分镜制作板</div>
                                                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{title}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${headerReviewToneClass}`}>{headerReviewLabel}</div>
                                                        <div className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneAligned ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-100' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/14 dark:text-amber-100'}`}>
                                                            {toneAligned ? '布局已对齐' : '布局有偏移'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 space-y-2">
                                                    {renderChipGroup('轨道', groupedChips.lanes)}
                                                    {renderChipGroup('画幅', groupedChips.frame)}
                                                    {renderChipGroup('渲染', groupedChips.render)}
                                                    {renderChipGroup('覆盖', groupedChips.coverage)}
                                                </div>
                                                {subtitle && subtitle !== title && (
                                                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-300/80">{subtitle}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })() : (
                                    <div className="w-full h-full whitespace-nowrap select-none flex items-center" style={{ fontSize: el.fontSize || 24, fontFamily: el.fontFamily || 'Inter', color: el.color || '#000000' }}>
                                        {el.content || 'Double click to edit'}
                                    </div>
                                ))}

                                {el.type === 'shape' && (
                                    el.storyboardElementRole === 'board-surface' ? (
                                        <div className="h-full w-full rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.9))] shadow-[0_40px_100px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),rgba(15,23,42,0.72)_78%)]">
                                            <div className="absolute inset-5 rounded-[28px] border border-dashed border-slate-200/80 dark:border-white/10" />
                                            <div className="absolute inset-x-0 top-0 h-24 rounded-t-[32px] bg-gradient-to-r from-sky-500/10 via-blue-500/6 to-transparent dark:from-sky-400/12 dark:via-blue-400/8 dark:to-transparent" />
                                        </div>
                                    ) : el.storyboardElementRole === 'board-lane' ? (
                                        <div className={`h-full w-full rounded-[24px] border border-dashed ${el.storyboardLaneOrientation === 'landscape' ? 'border-violet-300/70 bg-violet-50/55 dark:border-violet-400/18 dark:bg-violet-400/6' : el.storyboardLaneOrientation === 'square' ? 'border-emerald-300/70 bg-emerald-50/55 dark:border-emerald-400/18 dark:bg-emerald-400/6' : 'border-sky-300/70 bg-sky-50/55 dark:border-sky-400/18 dark:bg-sky-400/6'}`} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            {(!el.shapeType || el.shapeType === 'square') && <div className="w-full h-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />}
                                            {el.shapeType === 'circle' && <div className="w-full h-full rounded-full" style={{ backgroundColor: el.color || '#9CA3AF' }} />}
                                            {el.shapeType === 'triangle' && (
                                                <div className="w-0 h-0 border-l-[50px] border-r-[50px] border-b-[100px] border-l-transparent border-r-transparent" style={{ borderBottomColor: el.color || '#9CA3AF', borderBottomWidth: el.height, borderLeftWidth: (el.width || 0) / 2, borderRightWidth: (el.width || 0) / 2 }} />
                                            )}
                                        </div>
                                    )
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
                            <path d={renderPath(currentPath.points)} stroke="#38BDF8" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                )}

                {annotationImageId && (() => {
                    const imageElement = elements.find((el) => el.id === annotationImageId && el.type === 'image');
                    if (!imageElement) return null;
                    return (
                        <>
                            <ObjectAnnotationOverlay
                                imageBounds={{
                                    left: imageElement.x,
                                    top: imageElement.y,
                                    width: imageElement.width || 1,
                                    height: imageElement.height || 1,
                                }}
                                object={annotationObject || null}
                                isDetecting={isDetectingObject}
                                onClose={() => onExitObjectAnnotation?.()}
                            />
                            {isDetectingObject && annotationPendingPoint && (
                                <div
                                    className="pointer-events-none absolute z-[72]"
                                    style={{
                                        left: imageElement.x + annotationPendingPoint.x,
                                        top: imageElement.y + annotationPendingPoint.y,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                >
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-fuchsia-300 bg-white/95 shadow-lg">
                                        <div className="h-2.5 w-2.5 animate-ping rounded-full bg-fuchsia-500" />
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}

                {selectionBox && (
                    <div
                        className="absolute z-50 pointer-events-none border border-blue-500 bg-blue-500/10 dark:border-sky-400/80 dark:bg-sky-400/12 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.14)]"
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



