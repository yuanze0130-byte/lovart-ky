/* eslint-disable @next/next/no-img-element -- Toolbar previews render transient data URLs from canvas operations. */
import React, { useMemo, useRef, useState } from 'react';
import { Download, Trash2, Wand2, Copy, ArrowRight, X, Sparkles, Loader2, Lightbulb, RotateCcw } from 'lucide-react';
import { CREDIT_COSTS, getUpscaleCreditCost } from '@/lib/credits';
import { CanvasElement } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';

interface ContextToolbarProps {
    element: CanvasElement;
    onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
    onDelete: (id: string) => void;
    onGenerateFromImage?: (element: CanvasElement) => void;
    onOpenImageEditMode?: (element: CanvasElement, mode: 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle', prompt?: string) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onDuplicate?: (element: CanvasElement) => void;
    onRemoveBackground?: (element: CanvasElement) => Promise<void>;
    onUpscale?: (element: CanvasElement, scale?: number) => Promise<void>;
    onCrop?: (
        element: CanvasElement,
        options: { x: number; y: number; width: number; height: number }
    ) => Promise<void>;
    onStartObjectAnnotation?: (element: CanvasElement) => void;
}

function RemoveBackgroundIcon({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" aria-hidden="true">
            <path d="M276.245 370.924c-24.994 24.997-24.99 65.524 0.014 90.512l415.208 415.155 0.755 0.742c25.054 24.24 65.005 23.993 89.75-0.737l99.56-99.55 0.022-0.018c0.347-0.302 0.511-0.483 0.786-0.782 24.994-24.997 24.99-65.524-0.014-90.512L467.118 270.579l-0.754-0.742c-25.054-24.24-65.006-23.993-89.75 0.737l-99.583 99.568c-0.346 0.302-0.51 0.483-0.786 0.782z m45.263 45.252L421.86 315.837l0.012 0.005 415.204 415.152-100.351 100.34-0.011-0.006-415.206-415.152z" />
            <path d="M276.252 370.923c-24.994 24.997-24.99 65.524 0.014 90.512l94.525 94.514 190.87-190.846-94.536-94.525-0.755-0.742c-25.054-24.24-65.005-23.993-89.75 0.737l-99.582 99.568c-0.347 0.302-0.511 0.483-0.786 0.782z m45.263 45.252l100.352-100.339 0.011 0.005 49.267 49.262-100.354 100.342-49.276-49.27zM160.773 669.64c17.497 0 31.714 14.042 31.996 31.471l0.004 0.53v195.193l0.117 0.088c0.549 0.387 1.375 0.672 2.402 0.713l0.261 0.006h351.22c17.674 0 32 14.327 32 32 0 17.496-14.041 31.713-31.47 31.995l-0.53 0.005h-351.22c-35.957 0-66.17-27.497-66.77-62.959l-0.01-1.077V701.641c0-17.673 14.327-32 32-32zM892.143 130c35.987 0 66.246 27.486 66.848 62.967l0.009 1.077V450c0 17.673-14.327 32-32 32-17.496 0-31.713-14.042-31.996-31.47L895 450V194.83l-0.124-0.093c-0.563-0.397-1.412-0.69-2.466-0.732l-0.267-0.005H614c-17.673 0-32-14.327-32-32 0-17.496 14.042-31.713 31.47-31.996L614 130h278.143zM166 321c17.673 0 32 14.327 32 32 0 17.496-14.042 31.713-31.47 31.996L166 385H91c-17.673 0-32-14.327-32-32 0-17.496 14.042-31.713 31.47-31.996L91 321h75z m-15.132-215.384l0.376 0.374 96.5 97.5c12.432 12.56 12.328 32.822-0.234 45.254-12.435 12.308-32.417 12.328-44.878 0.14l-0.376-0.374-96.5-97.5c-12.432-12.56-12.328-32.822 0.234-45.254 12.435-12.308 32.417-12.328 44.878-0.14zM355 64c17.496 0 31.713 14.042 31.996 31.47L387 96v75c0 17.496-14.042 31.713-31.47 31.996L355 203c-17.496 0-31.713-14.042-31.996-31.47L323 171V96c0-17.673 14.327-32 32-32z" />
        </svg>
    );
}

function ReversePromptIcon({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" aria-hidden="true">
            <path d="M739.562667 168.533333c64 0 115.904 51.904 115.904 115.904V512l-2.133334 2.133333h-56.896l-2.133333-2.133333V284.437333a54.762667 54.762667 0 0 0-54.741333-54.741333H284.437333a54.762667 54.762667 0 0 0-54.741333 54.741333v455.125334a54.762667 54.762667 0 0 0 54.741333 54.741333H512l2.133333 2.133333V853.333333l-2.133333 2.133334H284.437333c-64 0-115.904-51.904-115.904-115.904V284.437333c0-64 51.904-115.904 115.904-115.904h455.125334z"></path>
            <path d="M568.469333 732.501333a20.48 20.48 0 0 1-5.397333-13.44V708.266667a20.48 20.48 0 0 1 5.397333-13.44l137.664-137.152a13.077333 13.077333 0 0 1 18.901334 0l18.901333 18.837333a12.970667 12.970667 0 0 1 0 18.816l-91.797333 91.434667h236.565333c8.106667 0 13.482667 5.376 13.482667 13.44v26.88c0 8.085333-5.397333 13.44-13.482667 13.44H652.138667L743.936 832c8.106667 5.376 8.106667 16.128 2.688 18.816l-18.901333 18.816a13.077333 13.077333 0 0 1-18.88 0l-140.373334-137.130667z"></path>
            <path d="M688.490667 362.922667v46.933333a10.666667 10.666667 0 0 1-10.666667 10.666667h-341.333333a10.666667 10.666667 0 0 1-10.666667-10.666667v-46.933333a10.666667 10.666667 0 0 1 10.666667-10.666667h341.333333a10.666667 10.666667 0 0 1 10.666667 10.666667zM578.389333 490.922667v46.933333a10.666667 10.666667 0 0 1-10.666666 10.666667h-231.253334a10.666667 10.666667 0 0 1-10.666666-10.666667v-46.933333a10.666667 10.666667 0 0 1 10.666666-10.666667h231.253334a10.666667 10.666667 0 0 1 10.666666 10.666667z"></path>
        </svg>
    );
}

function AnnotationEditIcon({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" aria-hidden="true">
            <path d="M512.434393 66.861804c-0.054235 0-0.109494 0-0.163729 0l-0.541329 0c-0.056282 0-0.109494 0-0.163729 0-191.363376 0.434905-346.930477 156.1115-346.930477 347.637582 0 188.810227 119.553886 338.510714 326.018192 532.535709 0.325411 0.434905 0.434905 0.977257 0.814552 1.302669 3.042289 3.260254 6.735401 5.432733 10.646478 6.843872 0.923022 0.325411 1.954515 0.325411 2.933819 0.543376 2.226714 0.542352 4.399193 1.412163 6.681166 1.412163 0.107447 0 0.161682-0.10847 0.270153-0.10847 0.109494 0 0.163729 0.10847 0.272199 0.10847 2.281973 0 4.455475-0.86981 6.681166-1.412163 0.977257-0.217964 2.010797-0.217964 2.933819-0.543376 3.90903-1.412163 7.605212-3.584642 10.646478-6.843872 0.379647-0.325411 0.488117-0.868787 0.813528-1.302669 206.464305-194.024995 326.019215-343.725482 326.019215-532.535709C859.364871 222.973304 703.796746 67.296709 512.434393 66.861804zM511.998465 596.247776c-101.193727 0-183.541223-82.347496-183.541223-183.596482 0-101.247962 82.347496-183.486988 183.541223-183.486988 101.195773 0 183.541223 82.238003 183.541223 183.486988C695.539688 513.901303 613.194238 596.247776 511.998465 596.247776z"></path>
        </svg>
    );
}

function UpscaleIcon({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 1024 1024"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M825.173333 132.486095l-192.195047 213.967238a51.785143 51.785143 0 1 0 77.043809 69.241905l180.272762-200.655238c2.340571-2.608762 6.436571-1.219048 6.436572 2.267429v189.244952a53.443048 53.443048 0 0 0 106.886095 0V217.307429a192.365714 192.365714 0 0 0-56.636953-136.289524A192.316952 192.316952 0 0 0 811.641905 24.380952h-188.025905a53.443048 53.443048 0 1 0 0 106.910477h187.684571c4.729905 0 9.386667 0.414476 13.970286 1.219047M292.815238 252.635429a102.912 102.912 0 1 1 0 205.848381 102.912 102.912 0 0 1 0-205.848381z m319.73181 750.933333l-0.024381-0.048762H217.33181a192.438857 192.438857 0 0 1-136.289524-56.636952A192.438857 192.438857 0 0 1 24.380952 810.617905V217.307429c0-53.101714 21.723429-101.376 56.636953-136.289524A192.438857 192.438857 0 0 1 217.307429 24.380952h192.341333a53.443048 53.443048 0 1 1 0 106.910477H217.307429c-23.600762 0-45.080381 9.654857-60.757334 25.331809a85.918476 85.918476 0 0 0-25.35619 60.781714V810.666667c0 23.625143 9.654857 45.104762 25.35619 60.781714 15.60381 15.60381 37.156571 25.35619 60.757334 25.35619h593.310476c23.600762 0 45.080381-9.752381 60.757333-25.35619a85.918476 85.918476 0 0 0 25.356191-60.781714v-192.316953a53.443048 53.443048 0 1 1 106.886095 0v192.316953a192.438857 192.438857 0 0 1-56.636953 136.289523 192.438857 192.438857 0 0 1-136.289523 56.636953h-198.070858l-0.048761-0.024381z" />
        </svg>
    );
}

function CropIcon({ className = 'w-4 h-4' }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 1024 1024"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M832.9 672.8h129v95h-129zM63.5 256h129v95h-129zM351 351V98.2h-95v669.6h351.7v-95H351z" />
            <path d="M416 351h256.8v321.8h-0.1v255.4h95.1V256H416z" />
        </svg>
    );
}

export function ContextToolbar({
    element,
    onUpdate,
    onDelete,
    onGenerateFromImage,
    onOpenImageEditMode,
    onConnectFlow,
    onDuplicate,
    onRemoveBackground,
    onUpscale,
    onCrop,
    onStartObjectAnnotation,
}: ContextToolbarProps) {
    const [showEditPanel, setShowEditPanel] = useState(false);
    const [showReversePromptPanel, setShowReversePromptPanel] = useState(false);
    const [showUpscalePanel, setShowUpscalePanel] = useState(false);
    const [showCropPanel, setShowCropPanel] = useState(false);
    const [selectedUpscale, setSelectedUpscale] = useState<2 | 4>(2);
    const [editPrompt, setEditPrompt] = useState('');
    const [reversePromptResult, setReversePromptResult] = useState<null | {
        concisePrompt: string;
        detailedPrompt: string;
        negativePrompt?: string;
        styleTags?: string[];
        lightingTags?: string[];
        cameraTags?: string[];
        notes?: string;
    }>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRemovingBg, setIsRemovingBg] = useState(false);
    const [isReversingPrompt, setIsReversingPrompt] = useState(false);
    const [isUpscaling, setIsUpscaling] = useState(false);
    const [isCropping, setIsCropping] = useState(false);
    const [hoveredAction, setHoveredAction] = useState<null | 'remove-bg' | 'reverse-prompt' | 'annotate' | 'upscale'>(null);
    const [cropX, setCropX] = useState(0);
    const [cropY, setCropY] = useState(0);
    const [cropWidth, setCropWidth] = useState(Math.round(element.width || 300));
    const [cropHeight, setCropHeight] = useState(Math.round(element.height || 300));
    const [cropInteraction, setCropInteraction] = useState<null | 'move' | 'nw' | 'ne' | 'sw' | 'se'>(null);
    const cropPreviewRef = useRef<HTMLDivElement | null>(null);
    const cropDragStartRef = useRef<{
        clientX: number;
        clientY: number;
        cropX: number;
        cropY: number;
        cropWidth: number;
        cropHeight: number;
    } | null>(null);

    const safeWidth = useMemo(
        () => Math.max(1, Math.round(element.originalWidth || element.width || 300)),
        [element.originalWidth, element.width]
    );
    const safeHeight = useMemo(
        () => Math.max(1, Math.round(element.originalHeight || element.height || 300)),
        [element.originalHeight, element.height]
    );
    const cropScale = useMemo(() => {
        const maxPreviewWidth = 240;
        const maxPreviewHeight = 180;
        return Math.min(maxPreviewWidth / safeWidth, maxPreviewHeight / safeHeight, 1);
    }, [safeWidth, safeHeight]);
    const previewWidth = Math.max(1, Math.round(safeWidth * cropScale));
    const previewHeight = Math.max(1, Math.round(safeHeight * cropScale));

    if (!element) return null;

    const handleDownload = () => {
        const src = element.content;
        if (!src) return;

        if (src.startsWith('data:')) {
            const link = document.createElement('a');
            link.href = src;
            link.download = `lovart-${element.id.slice(0, 8)}.png`;
            link.click();
        } else {
            fetch(src)
                .then((res) => res.blob())
                .then((blob) => {
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = `lovart-${element.id.slice(0, 8)}.png`;
                    link.click();
                    URL.revokeObjectURL(blobUrl);
                })
                .catch(() => {
                    window.open(src, '_blank');
                });
        }
    };

    const handleEditConfirm = async () => {
        if (!editPrompt.trim() || !onGenerateFromImage) return;
        setIsGenerating(true);
        onGenerateFromImage({
            ...element,
            type: 'image-generator',
            referenceImageId: element.id,
            content: editPrompt.trim(),
        });
        setShowEditPanel(false);
        setEditPrompt('');
        setIsGenerating(false);
    };

    const handleRemoveBackgroundClick = async () => {
        if (!onRemoveBackground || element.type !== 'image') return;

        try {
            setIsRemovingBg(true);
            await onRemoveBackground(element);
        } catch (error) {
            alert(error instanceof Error ? error.message : '去背景失败');
        } finally {
            setIsRemovingBg(false);
        }
    };

    const handleReversePrompt = async () => {
        if (element.type !== 'image' || !element.content) return;

        try {
            setIsReversingPrompt(true);
            setShowReversePromptPanel(true);
            const response = await authedFetch('/api/reverse-prompt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ imageData: element.content }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details || data.error || '反推提示词失败');
            }
            setReversePromptResult(data);
        } catch (error) {
            alert(error instanceof Error ? error.message : '反推提示词失败');
            setShowReversePromptPanel(false);
        } finally {
            setIsReversingPrompt(false);
        }
    };

    const handleUpscaleConfirm = async (scale?: 2 | 4) => {
        if (!onUpscale || element.type !== 'image') return;

        try {
            const targetScale = scale ?? selectedUpscale;
            setIsUpscaling(true);
            await onUpscale(element, targetScale);
            setShowUpscalePanel(false);
        } catch (error) {
            alert(error instanceof Error ? error.message : '超分失败');
        } finally {
            setIsUpscaling(false);
        }
    };

    const handleCropConfirm = async () => {
        if (!onCrop || element.type !== 'image') return;

        try {
            setIsCropping(true);
            await onCrop(element, {
                x: cropX,
                y: cropY,
                width: cropWidth,
                height: cropHeight,
            });
            setShowCropPanel(false);
        } catch (error) {
            alert(error instanceof Error ? error.message : '裁切失败');
        } finally {
            setIsCropping(false);
        }
    };

    const updateCropFromPointer = (clientX: number, clientY: number) => {
        const preview = cropPreviewRef.current;
        if (!preview) return;

        const rect = preview.getBoundingClientRect();
        const px = Math.min(Math.max(clientX - rect.left, 0), rect.width);
        const py = Math.min(Math.max(clientY - rect.top, 0), rect.height);

        const nextX = Math.round((px / rect.width) * safeWidth);
        const nextY = Math.round((py / rect.height) * safeHeight);

        const remainingWidth = Math.max(1, safeWidth - nextX);
        const remainingHeight = Math.max(1, safeHeight - nextY);

        setCropX(nextX);
        setCropY(nextY);
        setCropWidth((prev) => Math.min(Math.max(1, prev), remainingWidth));
        setCropHeight((prev) => Math.min(Math.max(1, prev), remainingHeight));
    };

    const beginCropInteraction = (
        mode: 'move' | 'nw' | 'ne' | 'sw' | 'se',
        clientX: number,
        clientY: number
    ) => {
        cropDragStartRef.current = {
            clientX,
            clientY,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
        };
        setCropInteraction(mode);
    };

    const updateCropInteraction = (clientX: number, clientY: number) => {
        const start = cropDragStartRef.current;
        if (!start || !cropInteraction || !cropPreviewRef.current) return;

        const rect = cropPreviewRef.current.getBoundingClientRect();
        const deltaX = Math.round(((clientX - start.clientX) / rect.width) * safeWidth);
        const deltaY = Math.round(((clientY - start.clientY) / rect.height) * safeHeight);

        if (cropInteraction === 'move') {
            const nextX = Math.min(Math.max(0, start.cropX + deltaX), Math.max(0, safeWidth - start.cropWidth));
            const nextY = Math.min(Math.max(0, start.cropY + deltaY), Math.max(0, safeHeight - start.cropHeight));
            setCropX(nextX);
            setCropY(nextY);
            return;
        }

        let nextX = start.cropX;
        let nextY = start.cropY;
        let nextWidth = start.cropWidth;
        let nextHeight = start.cropHeight;

        if (cropInteraction === 'nw' || cropInteraction === 'sw') {
            nextX = Math.min(Math.max(0, start.cropX + deltaX), start.cropX + start.cropWidth - 1);
            nextWidth = start.cropWidth + (start.cropX - nextX);
        }

        if (cropInteraction === 'ne' || cropInteraction === 'se') {
            nextWidth = Math.min(Math.max(1, start.cropWidth + deltaX), safeWidth - start.cropX);
        }

        if (cropInteraction === 'nw' || cropInteraction === 'ne') {
            nextY = Math.min(Math.max(0, start.cropY + deltaY), start.cropY + start.cropHeight - 1);
            nextHeight = start.cropHeight + (start.cropY - nextY);
        }

        if (cropInteraction === 'sw' || cropInteraction === 'se') {
            nextHeight = Math.min(Math.max(1, start.cropHeight + deltaY), safeHeight - start.cropY);
        }

        setCropX(nextX);
        setCropY(nextY);
        setCropWidth(Math.max(1, nextWidth));
        setCropHeight(Math.max(1, nextHeight));
    };

    if (element.type === 'image' || element.type === 'video') {
        return (
            <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-black/76 dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-600">
                        <span className="font-mono">
                            {Math.round(element.originalWidth || element.width || 0)} × {Math.round(element.originalHeight || element.height || 0)}
                        </span>
                        {element.requestedAspectRatio && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                目标 {element.requestedAspectRatio}
                            </span>
                        )}
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    <button
                        onClick={handleRemoveBackgroundClick}
                        onMouseEnter={() => setHoveredAction('remove-bg')}
                        onMouseLeave={() => setHoveredAction((current) => (current === 'remove-bg' ? null : current))}
                        className={`p-2 rounded-lg transition-colors relative ${
                            element.type === 'image' && onRemoveBackground
                                ? 'hover:bg-gray-50 text-gray-700 dark:text-slate-200 dark:hover:bg-white/8'
                                : 'text-gray-300 cursor-not-allowed dark:text-slate-600'
                        }`}
                        title={element.type === 'image' ? (isRemovingBg ? '去背景处理中...' : '去背景 · 3 积分') : '仅图片支持去背景'}
                        disabled={element.type !== 'image' || !onRemoveBackground || isRemovingBg}
                    >
                        {isRemovingBg ? <Loader2 size={18} className="animate-spin" /> : <RemoveBackgroundIcon className="h-[18px] w-[18px]" />}
                    </button>

                    <button
                        onClick={() => {
                            if (element.type !== 'image' || !onCrop) return;
                            setCropX(0);
                            setCropY(0);
                            setCropWidth(safeWidth);
                            setCropHeight(safeHeight);
                            setShowCropPanel((prev) => !prev);
                        }}
                        className={`rounded-lg p-2 transition-colors ${
                            element.type === 'image' && onCrop
                                ? showCropPanel
                                    ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-white/12 dark:text-white dark:hover:bg-white/16'
                                    : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8'
                                : 'cursor-not-allowed text-gray-300 dark:text-slate-600'
                        }`}
                        title={element.type === 'image' ? '裁切' : '仅图片支持裁切'}
                        disabled={element.type !== 'image' || !onCrop || isCropping}
                    >
                        <CropIcon className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => {
                            if (element.type !== 'image' || !onUpscale) return;
                            setShowUpscalePanel((prev) => !prev);
                        }}
                        onMouseEnter={() => setHoveredAction('upscale')}
                        onMouseLeave={() => setHoveredAction((current) => (current === 'upscale' ? null : current))}
                        className={`p-2 rounded-lg transition-colors ${
                            element.type === 'image' && onUpscale
                                ? showUpscalePanel
                                    ? 'bg-gray-100 text-gray-900 dark:bg-white/12 dark:text-white'
                                    : 'hover:bg-gray-50 text-gray-700 dark:text-slate-200 dark:hover:bg-white/8'
                                : 'text-gray-300 cursor-not-allowed dark:text-slate-600'
                        }`}
                        title={element.type === 'image' ? `超分 · ${getUpscaleCreditCost(selectedUpscale)} 积分起` : '仅图片支持超分'}
                        disabled={element.type !== 'image' || !onUpscale || isUpscaling}
                    >
                        <UpscaleIcon className="w-4 h-4" />
                    </button>

                    {onOpenImageEditMode && element.type === 'image' && (
                        <>
                            <button
                                onClick={() => onOpenImageEditMode(element, 'relight', element.prompt || '保留主体，仅重打光，增强光影氛围与层次。')}
                                className="p-2 rounded-lg text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8"
                                title="重打光"
                            >
                                <Lightbulb size={18} />
                            </button>
                            <button
                                onClick={() => onOpenImageEditMode(element, 'angle', element.prompt || '保留主体身份与材质，仅调整视角与透视关系。')}
                                className="p-2 rounded-lg text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8"
                                title="调整角度"
                            >
                                <RotateCcw size={18} />
                            </button>
                            <button
                                onClick={handleReversePrompt}
                                onMouseEnter={() => setHoveredAction('reverse-prompt')}
                                onMouseLeave={() => setHoveredAction((current) => (current === 'reverse-prompt' ? null : current))}
                                className={`p-2 rounded-lg transition-colors ${isReversingPrompt ? 'bg-gray-100 text-gray-900 dark:bg-white/12 dark:text-white' : 'text-gray-700 hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8'}`}
                                title={`反推提示词 · ${CREDIT_COSTS.reversePrompt} 积分`}
                                disabled={isReversingPrompt}
                            >
                                {isReversingPrompt ? <Loader2 size={18} className="animate-spin" /> : <ReversePromptIcon className="h-[18px] w-[18px]" />}
                            </button>
                        </>
                    )}

                    {element.type === 'image' && onStartObjectAnnotation && (
                        <button
                            onClick={() => onStartObjectAnnotation(element)}
                            onMouseEnter={() => setHoveredAction('annotate')}
                            onMouseLeave={() => setHoveredAction((current) => (current === 'annotate' ? null : current))}
                            className="p-2 rounded-lg text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8"
                            title={`局部编辑 · ${CREDIT_COSTS.detectObject} 积分`}
                        >
                            <AnnotationEditIcon className="h-[18px] w-[18px]" />
                        </button>
                    )}

                    {hoveredAction && (
                        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-600 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-slate-950/92 dark:text-slate-200 dark:shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                            {hoveredAction === 'remove-bg' && `去背景 · ${CREDIT_COSTS.removeBackground} 积分`}
                            {hoveredAction === 'reverse-prompt' && `反推提示词 · ${CREDIT_COSTS.reversePrompt} 积分`}
                            {hoveredAction === 'annotate' && `局部编辑 · ${CREDIT_COSTS.detectObject} 积分 · 进入后可框选局部再编辑`}
                            {hoveredAction === 'upscale' && `超分 · ${getUpscaleCreditCost(selectedUpscale)} 积分起`}
                        </div>
                    )}

                    {onGenerateFromImage && (
                        <button
                            onClick={() => {
                                setEditPrompt('');
                                setShowEditPanel((prev) => !prev);
                            }}
                            className={`p-2 rounded-lg transition-colors ${
                                showEditPanel
                                    ? 'bg-gray-100 text-gray-900 dark:bg-white/12 dark:text-white'
                                    : 'hover:bg-gray-50 text-gray-700 dark:text-slate-200 dark:hover:bg-white/8'
                            }`}
                            title="编辑 / 重新生成 · 3 积分起"
                        >
                            <Wand2 size={18} />
                        </button>
                    )}

                    {onConnectFlow && (
                        <button
                            onClick={() => onConnectFlow(element)}
                            className="p-2 rounded-lg text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-200 dark:hover:bg-white/8"
                            title="创建流程图连接"
                        >
                            <ArrowRight size={16} />
                        </button>
                    )}

                    <div className="w-px h-6 bg-gray-200" />

                    {onDuplicate && (
                        <button
                            onClick={() => {
                                onDuplicate(element);
                            }}
                            className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors dark:text-slate-200 dark:hover:bg-white/8"
                            title="复制图层"
                        >
                            <Copy size={18} />
                        </button>
                    )}

                    <button
                        onClick={async () => {
                            try {
                                const rawClipboardValue = element.finalPrompt || element.prompt || element.initialPrompt || element.content || '';
                                const clipboardText = typeof rawClipboardValue === 'string' ? rawClipboardValue : JSON.stringify(rawClipboardValue);
                                if (!clipboardText) return;
                                await navigator.clipboard.writeText(clipboardText);
                            } catch {
                                // ignore clipboard failures
                            }
                        }}
                        className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors dark:text-slate-200 dark:hover:bg-white/8"
                        title="复制内容"
                    >
                        <span className="text-[11px] font-semibold">文</span>
                    </button>

                    <button
                        onClick={handleDownload}
                        className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors dark:text-slate-200 dark:hover:bg-white/8"
                        title="下载图片"
                    >
                        <Download size={18} />
                    </button>

                    <button
                        onClick={() => onDelete(element.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                        title="删除"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>

                {showCropPanel && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <CropIcon className="w-4 h-4 text-gray-700" />
                                裁切
                            </span>
                            <button
                                onClick={() => setShowCropPanel(false)}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="mb-3 flex flex-col items-center">
                            <div
                                ref={cropPreviewRef}
                                className={`relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50 ${cropInteraction ? 'cursor-grabbing' : 'cursor-crosshair'}`}
                                style={{ width: previewWidth, height: previewHeight }}
                                onMouseDown={(e) => {
                                    if (e.target !== e.currentTarget) return;
                                    updateCropFromPointer(e.clientX, e.clientY);
                                }}
                                onMouseMove={(e) => {
                                    if (!cropInteraction) return;
                                    updateCropInteraction(e.clientX, e.clientY);
                                }}
                                onMouseUp={() => {
                                    setCropInteraction(null);
                                    cropDragStartRef.current = null;
                                }}
                                onMouseLeave={() => {
                                    setCropInteraction(null);
                                    cropDragStartRef.current = null;
                                }}
                            >
                                {element.content && (
                                    <img
                                        src={element.content}
                                        alt="Crop preview"
                                        className="w-full h-full object-contain pointer-events-none select-none"
                                        draggable={false}
                                    />
                                )}

                                <div className="absolute inset-0 bg-black/35 pointer-events-none" />

                                <div
                                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]"
                                    style={{
                                        left: `${(cropX / safeWidth) * previewWidth}px`,
                                        top: `${(cropY / safeHeight) * previewHeight}px`,
                                        width: `${(cropWidth / safeWidth) * previewWidth}px`,
                                        height: `${(cropHeight / safeHeight) * previewHeight}px`,
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        beginCropInteraction('move', e.clientX, e.clientY);
                                    }}
                                >
                                    {([
                                        ['nw', 'top-0 left-0 cursor-nwse-resize'],
                                        ['ne', 'top-0 right-0 cursor-nesw-resize'],
                                        ['sw', 'bottom-0 left-0 cursor-nesw-resize'],
                                        ['se', 'bottom-0 right-0 cursor-nwse-resize'],
                                    ] as const).map(([mode, position]) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border border-black/20 ${position}`}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                beginCropInteraction(mode, e.clientX, e.clientY);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                            <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                                拖动选区可移动，拖四角圆点可缩放裁切框。
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                            <label className="flex flex-col gap-1 text-gray-600">
                                X
                                <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, safeWidth - 1)}
                                    value={cropX}
                                    onChange={(e) => setCropX(Math.min(Math.max(0, Number(e.target.value) || 0), Math.max(0, safeWidth - cropWidth)))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                Y
                                <input
                                    type="number"
                                    min={0}
                                    max={Math.max(0, safeHeight - 1)}
                                    value={cropY}
                                    onChange={(e) => setCropY(Math.min(Math.max(0, Number(e.target.value) || 0), Math.max(0, safeHeight - cropHeight)))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                宽度
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, safeWidth - cropX)}
                                    value={cropWidth}
                                    onChange={(e) => setCropWidth(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, safeWidth - cropX)))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                高度
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, safeHeight - cropY)}
                                    value={cropHeight}
                                    onChange={(e) => setCropHeight(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, safeHeight - cropY)))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                        </div>

                        <button
                            onClick={handleCropConfirm}
                            disabled={isCropping}
                            className="w-full px-3 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isCropping ? '裁切处理中...' : '应用裁切'}
                        </button>
                    </div>
                )}

                {showUpscalePanel && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <UpscaleIcon className="w-4 h-4 text-gray-700" />
                                Upscale
                            </span>
                            <button
                                onClick={() => setShowUpscalePanel(false)}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[2, 4].map((value) => {
                                const scale = value as 2 | 4;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setSelectedUpscale(scale)}
                                        className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                            selectedUpscale === scale
                                                ? 'border-black bg-black text-white'
                                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                                        }`}
                                    >
                                        {value}x · {getUpscaleCreditCost(scale)} 积分
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => handleUpscaleConfirm()}
                            disabled={isUpscaling}
                            className="w-full px-3 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isUpscaling ? '超分处理中...' : `开始 ${selectedUpscale}x 超分 · ${getUpscaleCreditCost(selectedUpscale)} 积分`}
                        </button>
                    </div>
                )}

                {showReversePromptPanel && (
                    <div className="absolute top-full left-1/2 z-50 mt-2 w-[28rem] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                <ReversePromptIcon className="h-[14px] w-[14px] text-purple-500" />
                                反推提示词
                            </span>
                            <button
                                onClick={() => setShowReversePromptPanel(false)}
                                className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {reversePromptResult ? (
                            <div className="space-y-3 text-sm">
                                <div>
                                    <div className="mb-1 text-[11px] font-medium text-gray-500">简洁 Prompt</div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-800">{reversePromptResult.concisePrompt}</div>
                                </div>
                                <div>
                                    <div className="mb-1 text-[11px] font-medium text-gray-500">详细 Prompt</div>
                                    <div className="whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-800">{reversePromptResult.detailedPrompt}</div>
                                </div>
                                {reversePromptResult.negativePrompt && (
                                    <div>
                                        <div className="mb-1 text-[11px] font-medium text-gray-500">Negative Prompt</div>
                                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-800">{reversePromptResult.negativePrompt}</div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2"><div className="mb-1 font-medium text-gray-500">风格标签</div><div>{reversePromptResult.styleTags?.join('，') || '—'}</div></div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2"><div className="mb-1 font-medium text-gray-500">光照标签</div><div>{reversePromptResult.lightingTags?.join('，') || '—'}</div></div>
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2"><div className="mb-1 font-medium text-gray-500">镜头标签</div><div>{reversePromptResult.cameraTags?.join('，') || '—'}</div></div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                        onClick={() => navigator.clipboard.writeText(reversePromptResult.concisePrompt)}
                                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12"
                                    >
                                        复制简版 Prompt
                                    </button>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(reversePromptResult.detailedPrompt)}
                                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12"
                                    >
                                        复制详细 Prompt
                                    </button>
                                    {onOpenImageEditMode && (
                                        <button
                                            onClick={() => {
                                                onOpenImageEditMode(element, 'generate', reversePromptResult.detailedPrompt);
                                                setShowReversePromptPanel(false);
                                            }}
                                            className="rounded-lg bg-black px-3 py-1.5 text-xs text-white transition-colors hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                                        >
                                            用它继续编辑
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-gray-500">
                                {isReversingPrompt ? '正在分析图片并反推提示词…' : '暂无结果'}
                            </div>
                        )}
                    </div>
                )}

                {showEditPanel && (
                    <div className="absolute top-full left-1/2 z-50 mt-2 w-80 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-purple-500" />
                                重新生成图片
                            </span>
                            <button
                                onClick={() => setShowEditPanel(false)}
                                className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <textarea
                            autoFocus
                            className="w-full h-24 resize-none rounded-lg border border-gray-200 p-2 text-sm outline-none transition-all focus:border-purple-400 focus:ring-1 focus:ring-purple-200 dark:border-white/10 dark:bg-black dark:text-gray-100 dark:focus:border-purple-400 dark:focus:ring-purple-500/20"
                            placeholder="输入新的提示词，例如：A cute cat wearing a hat, photorealistic"
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleEditConfirm();
                                }
                                e.stopPropagation();
                            }}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-gray-400">Ctrl + Enter 快速确认</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowEditPanel(false)}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleEditConfirm}
                                    disabled={!editPrompt.trim() || isGenerating}
                                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                >
                                    <Sparkles size={12} />
                                    {isGenerating ? '生成中...' : '生成'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-2 flex items-center gap-3"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <div
                    className="w-8 h-8 rounded-full border border-gray-200 cursor-pointer relative overflow-hidden"
                    style={{
                        backgroundColor:
                            element.color || (element.type === 'text' ? '#000000' : '#9CA3AF'),
                    }}
                >
                    <input
                        type="color"
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        value={element.color || (element.type === 'text' ? '#000000' : '#9CA3AF')}
                        onChange={(e) => onUpdate(element.id, { color: e.target.value })}
                    />
                </div>
            </div>

            <div className="w-px h-6 bg-gray-200" />

            {element.type === 'shape' && (
                <>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
                            <span className="text-xs text-gray-500">W</span>
                            <input
                                type="number"
                                className="w-12 bg-transparent text-sm outline-none"
                                value={Math.round(element.width || 0)}
                                onChange={(e) =>
                                    onUpdate(element.id, { width: parseInt(e.target.value) })
                                }
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
                            <span className="text-xs text-gray-500">H</span>
                            <input
                                type="number"
                                className="w-12 bg-transparent text-sm outline-none"
                                value={Math.round(element.height || 0)}
                                onChange={(e) =>
                                    onUpdate(element.id, { height: parseInt(e.target.value) })
                                }
                            />
                        </div>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />
                </>
            )}

            <button
                onClick={() => onDelete(element.id)}
                className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                title="删除"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );
}
