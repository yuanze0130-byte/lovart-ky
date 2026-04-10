"use client";

import React, { useState, useRef } from 'react';
import { Sparkles, ChevronDown, Zap, Image as ImageIcon, Upload, X } from 'lucide-react';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = '1:1' | '4:3' | '16:9';
type BananaVariant = 'standard' | 'pro';

interface ImageGeneratorPanelProps {
    elementId: string;
    onGenerate: (
        prompt: string,
        resolution: Resolution,
        aspectRatio: AspectRatio,
        referenceImage?: string,
        modelVariant?: BananaVariant
    ) => Promise<void>;
    isGenerating: boolean;
    style?: React.CSSProperties;
    canvasElements?: Array<{ id: string; type: string; content?: string; referenceImageId?: string }>;
}

export function ImageGeneratorPanel({ elementId, onGenerate, isGenerating, style, canvasElements }: ImageGeneratorPanelProps) {
    const [prompt, setPrompt] = useState('');
    const [resolution, setResolution] = useState<Resolution>('1K');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [modelVariant, setModelVariant] = useState<BananaVariant>('pro');
    const [referenceImage, setReferenceImage] = useState<File | string | null>(null);

    React.useEffect(() => {
        if (canvasElements) {
            const currentElement = canvasElements.find(el => el.id === elementId);
            if (currentElement?.referenceImageId) {
                const sourceImage = canvasElements.find(el => el.id === currentElement.referenceImageId);
                if (sourceImage?.content && !referenceImage) {
                    setReferenceImage(sourceImage.content);
                }
            }
        }
    }, [elementId, canvasElements, referenceImage]);

    const [showResolutionMenu, setShowResolutionMenu] = useState(false);
    const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
    const [showReferenceMenu, setShowReferenceMenu] = useState(false);
    const [showModelMenu, setShowModelMenu] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const resolutions: Resolution[] = ['1K', '2K', '4K'];
    const aspectRatios: AspectRatio[] = ['1:1', '4:3', '16:9'];
    const modelOptions: Array<{ value: BananaVariant; label: string }> = [
        { value: 'standard', label: 'Nano Banana 标准' },
        { value: 'pro', label: 'Nano Banana Pro' },
    ];

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (prompt.trim() && !isGenerating) {
                await handleGenerate();
            }
        }
    };

    const handleGenerate = async () => {
        let referenceImageBase64: string | undefined = undefined;

        if (referenceImage) {
            if (typeof referenceImage === 'string') {
                referenceImageBase64 = referenceImage;
            } else {
                referenceImageBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        if (result && result.includes(',')) {
                            resolve(result.split(',')[1]);
                        } else {
                            resolve(result);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(referenceImage);
                });
            }
        }

        await onGenerate(prompt, resolution, aspectRatio, referenceImageBase64, modelVariant);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setReferenceImage(e.target.files[0]);
            setShowReferenceMenu(false);
        }
    };

    const handleCanvasImageSelect = (imageContent: string) => {
        setReferenceImage(imageContent);
        setShowReferenceMenu(false);
    };

    const getImageElements = () => {
        if (!canvasElements) return [];
        return canvasElements.filter(el => el.type === 'image' && el.content);
    };

    const imageElements = getImageElements();
    const activeModelLabel = modelOptions.find(option => option.value === modelVariant)?.label || 'Nano Banana Pro';

    return (
        <div
            className="absolute z-50 w-[450px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/78 shadow-[0_28px_80px_rgba(2,6,23,0.5)] backdrop-blur-2xl"
            style={style}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
            />

            <div className="p-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="今天我们要创作什么..."
                    className="w-full h-24 resize-none outline-none text-gray-700 placeholder-gray-400 text-lg bg-transparent"
                    disabled={isGenerating}
                />
            </div>

            {referenceImage && (
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                        <ImageIcon size={14} className="text-blue-500" />
                        <span className="text-xs text-blue-700 flex-1 truncate">
                            {typeof referenceImage === 'string' ? '画布图片' : referenceImage.name}
                        </span>
                        <button
                            onClick={() => setReferenceImage(null)}
                            className="text-blue-500 hover:text-blue-700 p-0.5"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            <div className="px-4 py-3 bg-gray-50/50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            onClick={() => setShowModelMenu(!showModelMenu)}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors text-xs font-medium text-gray-700"
                        >
                            <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                                <Sparkles size={8} className="text-white" />
                            </div>
                            <span>{activeModelLabel}</span>
                            <ChevronDown size={12} className="text-slate-500" />
                        </button>
                        {showModelMenu && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 py-1 z-10 min-w-[160px]">
                                {modelOptions.map((option) => (
                                    <div
                                        key={option.value}
                                        onClick={() => {
                                            setModelVariant(option.value);
                                            setShowModelMenu(false);
                                        }}
                                        className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                                            modelVariant === option.value ? 'text-blue-500 font-medium' : 'text-gray-700'
                                        }`}
                                    >
                                        {option.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => setShowReferenceMenu(!showReferenceMenu)}
                            className={`p-1.5 hover:bg-gray-100 rounded-lg transition-colors ${
                                referenceImage ? 'text-blue-500 bg-blue-50' : 'text-gray-600'
                            }`}
                            title="参考图"
                        >
                            <Upload size={16} />
                        </button>
                        {showReferenceMenu && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 py-1 z-10 min-w-[140px]">
                                <div
                                    onClick={() => {
                                        fileInputRef.current?.click();
                                        setShowReferenceMenu(false);
                                    }}
                                    className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 text-gray-700"
                                >
                                    上传图片
                                </div>
                                {imageElements.length > 0 && (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        <div className="px-2 py-1 text-xs text-gray-500">画布图片</div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {imageElements.map((el, idx) => (
                                                <div
                                                    key={el.id}
                                                    onClick={() => handleCanvasImageSelect(el.content!)}
                                                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/8"
                                                >
                                                    <ImageIcon size={14} />
                                                    <span>图片 {idx + 1}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <div
                            onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                            className="flex items-center gap-1 text-xs text-gray-600 font-medium cursor-pointer hover:bg-gray-100 px-1.5 py-1 rounded-lg transition-colors"
                        >
                            <span>{resolution}</span>
                            <ChevronDown size={12} />
                        </div>
                        {showResolutionMenu && (
                            <div className="absolute bottom-full mb-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 min-w-[60px]">
                                {resolutions.map((res) => (
                                    <div
                                        key={res}
                                        onClick={() => {
                                            setResolution(res);
                                            setShowResolutionMenu(false);
                                        }}
                                        className={`px-3 py-1 text-xs cursor-pointer hover:bg-gray-50 ${
                                            resolution === res ? 'text-blue-500 font-medium' : 'text-gray-700'
                                        }`}
                                    >
                                        {res}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <div
                            onClick={() => setShowAspectRatioMenu(!showAspectRatioMenu)}
                            className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/8"
                        >
                            <span>{aspectRatio}</span>
                            <ChevronDown size={12} />
                        </div>
                        {showAspectRatioMenu && (
                            <div className="absolute bottom-full z-10 mb-1 min-w-[60px] rounded-xl border border-white/10 bg-slate-950/92 py-1 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl">
                                {aspectRatios.map((ratio) => (
                                    <div
                                        key={ratio}
                                        onClick={() => {
                                            setAspectRatio(ratio);
                                            setShowAspectRatioMenu(false);
                                        }}
                                        className={`cursor-pointer px-3 py-1 text-xs transition-colors hover:bg-white/8 ${
                                            aspectRatio === ratio ? 'font-medium text-sky-300' : 'text-slate-200'
                                        }`}
                                    >
                                        {ratio}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={() => prompt.trim() && !isGenerating && handleGenerate()}
                    disabled={!prompt.trim() || isGenerating}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 transition-all ${
                        prompt.trim() && !isGenerating
                            ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] hover:brightness-110'
                            : 'cursor-not-allowed bg-white/8 text-slate-500'
                    }`}
                >
                    <Zap size={16} className={isGenerating ? 'animate-pulse' : 'fill-current'} />
                    <span className="font-medium">40</span>
                </button>
            </div>
        </div>
    );
}
