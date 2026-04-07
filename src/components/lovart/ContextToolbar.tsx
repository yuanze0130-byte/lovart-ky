import React, { useState } from 'react';
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
}

export function ContextToolbar({
    element,
    onUpdate,
    onDelete,
    onGenerateFromImage,
    onConnectFlow,
    onDuplicate,
    onRemoveBackground,
}: ContextToolbarProps) {
    const [showEditPanel, setShowEditPanel] = useState(false);
    const [editPrompt, setEditPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRemovingBg, setIsRemovingBg] = useState(false);

    if (!element) return null;

    // ==================== 下载功能 ====================
    const handleDownload = () => {
        const src = element.content;
        if (!src) return;

        if (src.startsWith('data:')) {
            // base64 直接下载
            const link = document.createElement('a');
            link.href = src;
            link.download = `lovart-${element.id.slice(0, 8)}.png`;
            link.click();
        } else {
            // http 链接：fetch 转 blob 再下载，避免跨域
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
                    // 跨域失败则新标签页打开
                    window.open(src, '_blank');
                });
        }
    };

    // ==================== 编辑（重新生成）功能 ====================
    const handleEditConfirm = async () => {
        if (!editPrompt.trim() || !onGenerateFromImage) return;
        setIsGenerating(true);
        // 将原图作为参考图，用新 prompt 触发重新生成
        // content 字段复用为新 prompt，referenceImageId 指向原图 id
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

    // ==================== 图片 / 视频工具栏 ====================
    if (element.type === 'image' || element.type === 'video') {
        return (
            <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                {/* 主工具栏 */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-1.5 flex items-center gap-1">
                    {/* 尺寸显示 */}
                    <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600">
                        <span className="font-mono">
                            {Math.round(element.width || 0)} × {Math.round(element.height || 0)}
                        </span>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    {/* 去背景 */}
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

                    {/* Mockup（待实现，置灰提示） */}
                    <button
                        className="p-2 rounded-lg text-gray-300 cursor-not-allowed"
                        title="Mockup（即将推出）"
                        disabled
                    >
                        <Shirt size={18} />
                    </button>

                    {/* ✅ 编辑按钮 — 点击弹出重新生成面板 */}
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

                    {/* 流程图连接 */}
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

                    {/* ✅ 复制按钮 */}
                    {onDuplicate && (
                        <button
                            onClick={() => onDuplicate(element)}
                            className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors"
                            title="复制"
                        >
                            <Copy size={18} />
                        </button>
                    )}

                    {/* ✅ 下载按钮 */}
                    <button
                        onClick={handleDownload}
                        className="p-2 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors"
                        title="下载图片"
                    >
                        <Download size={18} />
                    </button>

                    {/* 删除按钮 */}
                    <button
                        onClick={() => onDelete(element.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                        title="删除"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>

                {/* ✅ 编辑浮层 — 重新输入提示词 */}
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
                                // Ctrl/Cmd + Enter 快速确认
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

    // ==================== 其他元素（文字、形状、路径等）工具栏 ====================
    return (
        <div
            className="bg-white rounded-xl shadow-lg border border-gray-200 p-2 flex items-center gap-3"
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* 颜色选择器 */}
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

            {/* 形状尺寸输入 */}
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

            {/* 文字属性 */}
            {element.type === 'text' && (
                <>
                    <select
                        className="bg-transparent text-sm outline-none border border-gray-200 rounded-md px-2 py-1"
                        value={element.fontFamily || 'Inter'}
                        onChange={(e) => onUpdate(element.id, { fontFamily: e.target.value })}
                    >
                        <option value="Inter">Inter</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                    </select>
                    <select
                        className="bg-transparent text-sm outline-none border border-gray-200 rounded-md px-2 py-1"
                        value={element.fontSize || 24}
                        onChange={(e) =>
                            onUpdate(element.id, { fontSize: parseInt(e.target.value) })
                        }
                    >
                        {[12, 14, 16, 18, 20, 24, 32, 48, 64, 80, 96].map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                    <div className="w-px h-6 bg-gray-200" />
                </>
            )}

            {/* 通用操作 */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleDownload}
                    className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600"
                    title="下载"
                >
                    <Download size={18} />
                </button>
                <button
                    onClick={() => onDelete(element.id)}
                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-md"
                    title="删除"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}
