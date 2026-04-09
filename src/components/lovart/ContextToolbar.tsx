import React, { useMemo, useState } from 'react';
import { Download, Trash2, Wand2, Eraser, Shirt, Copy, ArrowRight, X, Sparkles } from 'lucide-react';
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

    const safeWidth = useMemo(() => Math.max(1, Math.round(element.width || 300)), [element.width]);
    const safeHeight = useMemo(() => Math.max(1, Math.round(element.height || 300)), [element.height]);

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

    if (element.type === 'image' || element.type === 'video') {
        return (
            <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex items-center gap-1">
                    <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600">
                        <span className="font-mono">
                            {Math.round(element.width || 0)} × {Math.round(element.height || 0)}
                        </span>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    <button
                        onClick={handleRemoveBackgroundClick}
                        className={`p-2 rounded-lg transition-colors ${
                            element.type === 'image' && onRemoveBackground
                                ? 'hover:bg-gray-50 text-gray-700'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={element.type === 'image' ? '去背景' : '仅图片支持去背景'}
                        disabled={element.type !== 'image' || !onRemoveBackground || isRemovingBg}
                    >
                        <Eraser size={18} />
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
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                            element.type === 'image' && onCrop
                                ? showCropPanel
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'hover:bg-gray-50 text-gray-700'
                                : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={element.type === 'image' ? '裁切' : '仅图片支持裁切'}
                        disabled={element.type !== 'image' || !onCrop || isCropping}
                    >
                        <CropIcon className="w-4 h-4" />
                        <span className="text-xs font-medium">裁切</span>
                    </button>

                    <button
                        onClick={() => {
                            if (element.type !== 'image' || !onUpscale) return;
                            setShowUpscalePanel((prev) => !prev);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${
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
                        <span className="text-xs font-medium">超分</span>
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
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title="创建流程图连接"
                        >
                            <ArrowRight size={16} />
                            <span className="text-xs font-medium">流程</span>
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

                        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                            <label className="flex flex-col gap-1 text-gray-600">
                                X
                                <input
                                    type="number"
                                    min={0}
                                    value={cropX}
                                    onChange={(e) => setCropX(Math.max(0, Number(e.target.value) || 0))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                Y
                                <input
                                    type="number"
                                    min={0}
                                    value={cropY}
                                    onChange={(e) => setCropY(Math.max(0, Number(e.target.value) || 0))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                宽度
                                <input
                                    type="number"
                                    min={1}
                                    value={cropWidth}
                                    onChange={(e) => setCropWidth(Math.max(1, Number(e.target.value) || 1))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-gray-600">
                                高度
                                <input
                                    type="number"
                                    min={1}
                                    value={cropHeight}
                                    onChange={(e) => setCropHeight(Math.max(1, Number(e.target.value) || 1))}
                                    className="border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
                                />
                            </label>
                        </div>

                        <p className="text-xs text-gray-400 mb-3">
                            当前为功能骨架版，先支持参数式裁切；后面我可以继续升级成拖拽裁切框。
                        </p>

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
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50">
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
                            className="w-full h-24 text-sm border border-gray-200 rounded-lg p-2 resize-none outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 transition-all"
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
            className="bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex items-center gap-3"
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
