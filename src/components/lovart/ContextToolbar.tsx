import React, { useMemo, useRef, useState } from 'react';
import { Download, Trash2, Wand2, Eraser, Shirt, Copy, ArrowRight, X, Sparkles, Loader2 } from 'lucide-react';
import { CanvasElement } from './CanvasArea';

interface ContextToolbarProps {
    element: CanvasElement;
    onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
    onDelete: (id: string) => void;
    onGenerateFromImage?: (element: CanvasElement) => void;
    onConnectFlow?: (element: CanvasElement) => void;
    onDuplicate?: (element: CanvasElement) => void;
    onRemoveBackground?: (element: CanvasElement) => Promise<void>;
    onUpscale?: (element: CanvasElement, scale?: number) => Promise<void>;
    onCrop?: (
        element: CanvasElement,
        options: { x: number; y: number; width: number; height: number }
    ) => Promise<void>;
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
    onConnectFlow,
    onDuplicate,
    onRemoveBackground,
    onUpscale,
    onCrop,
}: ContextToolbarProps) {
    const [showEditPanel, setShowEditPanel] = useState(false);
    const [showUpscalePanel, setShowUpscalePanel] = useState(false);
    const [showCropPanel, setShowCropPanel] = useState(false);
    const [selectedUpscale, setSelectedUpscale] = useState<2 | 4>(2);
    const [editPrompt, setEditPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRemovingBg, setIsRemovingBg] = useState(false);
    const [isUpscaling, setIsUpscaling] = useState(false);
    const [isCropping, setIsCropping] = useState(false);
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
                        className={`p-2 rounded-lg transition-colors relative ${
                            element.type === 'image' && onRemoveBackground
                                ? 'hover:bg-gray-50 text-gray-700'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={element.type === 'image' ? (isRemovingBg ? '去背景处理中...' : '去背景') : '仅图片支持去背景'}
                        disabled={element.type !== 'image' || !onRemoveBackground || isRemovingBg}
                    >
                        {isRemovingBg ? <Loader2 size={18} className="animate-spin" /> : <Eraser size={18} />}
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
                                    ? 'bg-sky-400/14 text-sky-200'
                                    : 'text-slate-200 hover:bg-white/8'
                                : 'cursor-not-allowed text-slate-600'
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
                        className={`p-2 rounded-lg transition-colors ${
                            element.type === 'image' && onUpscale
                                ? showUpscalePanel
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'hover:bg-gray-50 text-gray-700'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={element.type === 'image' ? '超分' : '仅图片支持超分'}
                        disabled={element.type !== 'image' || !onUpscale || isUpscaling}
                    >
                        <UpscaleIcon className="w-4 h-4" />
                    </button>

                    <button
                        className="p-2 rounded-lg text-gray-300 cursor-not-allowed"
                        title="Mockup（即将推出）"
                        disabled
                    >
                        <Shirt size={18} />
                    </button>

                    {onGenerateFromImage && (
                        <button
                            onClick={() => {
                                setEditPrompt('');
                                setShowEditPanel((prev) => !prev);
                            }}
                            className={`p-2 rounded-lg transition-colors ${
                                showEditPanel
                                    ? 'bg-purple-100 text-purple-600'
                                    : 'hover:bg-gray-50 text-gray-700'
                            }`}
                            title="编辑 / 重新生成"
                        >
                            <Wand2 size={18} />
                        </button>
                    )}

                    {onConnectFlow && (
                        <button
                            onClick={() => onConnectFlow(element)}
                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title="创建流程图连接"
                        >
                            <ArrowRight size={16} />
                        </button>
                    )}

                    <div className="w-px h-6 bg-gray-200" />

                    {onDuplicate && (
                        <button
                            onClick={() => onDuplicate(element)}
                            className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors"
                            title="复制"
                        >
                            <Copy size={18} />
                        </button>
                    )}

                    <button
                        onClick={handleDownload}
                        className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors"
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
                                        {value}x
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => handleUpscaleConfirm()}
                            disabled={isUpscaling}
                            className="w-full px-3 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isUpscaling ? '超分处理中...' : `开始 ${selectedUpscale}x 超分`}
                        </button>
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
