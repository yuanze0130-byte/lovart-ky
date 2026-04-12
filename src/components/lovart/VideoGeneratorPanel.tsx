"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Zap, Image as ImageIcon, Upload, X, Video, Loader2, RectangleHorizontal, RectangleVertical, Square, RotateCcw } from 'lucide-react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { getStoryboardNodeDimensions, getStoryboardRenderProfile, getStoryboardVideoSizeOptions, formatStoryboardMeta, getStoryboardFrameDeltaLabel, getStoryboardFrameAdaptationLabel, getStoryboardFrameAdaptationTone, getPreferredStoryboardVideoSize, getStoryboardFrameRoutingLabel, getStoryboardCoverageLabel } from '@/hooks/useProjectAssets';

type VideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024';
type StoryboardAspectRatio = '9:16' | '16:9' | '4:5' | '1:1';
type StoryboardOrientation = 'portrait' | 'landscape' | 'square';
const STORYBOARD_SIZE_PRIORITY: VideoSize[] = ['720x1280', '1024x1792', '1280x720', '1792x1024', '1024x1280', '1024x1024'];
type VideoSeconds = 10 | 15;

const ASPECT_PRESET_TO_SIZE: Record<StoryboardAspectRatio, VideoSize> = {
    '9:16': '720x1280',
    '16:9': '1280x720',
    '4:5': '1024x1280',
    '1:1': '1024x1024',
};

interface VideoGeneratorPanelProps {
    elementId: string;
    onGenerate: (videoUrl: string) => Promise<void>;
    onConfigChange?: (elementId: string, updates: Partial<CanvasElement>) => void;
    style?: React.CSSProperties;
    canvasElements?: CanvasElement[];
}

export function VideoGeneratorPanel({ elementId, onGenerate, onConfigChange, style, canvasElements }: VideoGeneratorPanelProps) {
    const [prompt, setPrompt] = useState('');
    const [size, setSize] = useState<VideoSize>('720x1280');
    const [seconds, setSeconds] = useState<VideoSeconds>(10);
    const [referenceImage, setReferenceImage] = useState<File | string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    // Dropdown states
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const [showSecondsMenu, setShowSecondsMenu] = useState(false);
    const [showReferenceMenu, setShowReferenceMenu] = useState(false);
    const [showAdvancedBoardSettings, setShowAdvancedBoardSettings] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const sizes: VideoSize[] = ['720x1280', '1280x720', '1024x1280', '1024x1024', '1024x1792', '1792x1024'];
    const secondsOptions: VideoSeconds[] = [10, 15];

    const getSizeMeta = (value: VideoSize) => {
        const [width, height] = value.split('x').map(Number);
        const orientation: StoryboardOrientation = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
        const aspectRatio: StoryboardAspectRatio = width === height
            ? '1:1'
            : width > height
              ? '16:9'
              : width === 1024 && height === 1280
                ? '4:5'
                : '9:16';
        return { orientation, aspectRatio };
    };

    const getNodeDimensions = (videoSize: VideoSize, aspectRatio: StoryboardAspectRatio) => {
        return getStoryboardNodeDimensions(videoSize, aspectRatio);
    };

    const currentElement = canvasElements?.find(el => el.id === elementId);
    const currentSizeMeta = getSizeMeta(size);
    const availableSizeOptions = useMemo(() => getStoryboardVideoSizeOptions(currentSizeMeta.aspectRatio), [currentSizeMeta.aspectRatio]);
    const shotProgressLabel = currentElement?.storyboardShotIndex && currentElement?.storyboardShotCount
        ? `${String(currentElement.storyboardShotIndex).padStart(2, '0')} / ${String(currentElement.storyboardShotCount).padStart(2, '0')}`
        : currentElement?.storyboardShotIndex
            ? `Shot ${String(currentElement.storyboardShotIndex).padStart(2, '0')}`
            : 'Single Shot';
    const sourceAspectRatio = currentElement?.storyboardSourceAspectRatio || currentElement?.storyboardAspectRatio || currentSizeMeta.aspectRatio;
    const frameDeltaLabel = getStoryboardFrameDeltaLabel(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const frameRoutingLabel = getStoryboardFrameRoutingLabel(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const coverageLabel = getStoryboardCoverageLabel(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const frameAdaptationLabel = getStoryboardFrameAdaptationLabel(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const frameAdaptationTone = getStoryboardFrameAdaptationTone(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const renderProfile = getStoryboardRenderProfile(size);
    const boardFitSize = getPreferredStoryboardVideoSize(currentSizeMeta.aspectRatio, renderProfile);
    const isBoardFitSize = size === boardFitSize;
    const OrientationIcon = currentSizeMeta.orientation === 'landscape'
        ? RectangleHorizontal
        : currentSizeMeta.orientation === 'square'
            ? Square
            : RectangleVertical;
    const aspectPresetCards = useMemo(() => ([
        { value: '9:16' as const, label: '竖版', size: ASPECT_PRESET_TO_SIZE['9:16'], note: '短视频 / reels' },
        { value: '16:9' as const, label: '横版', size: ASPECT_PRESET_TO_SIZE['16:9'], note: '宽幅叙事镜头' },
        { value: '4:5' as const, label: '高版', size: ASPECT_PRESET_TO_SIZE['4:5'], note: '海报式裁切' },
        { value: '1:1' as const, label: '方形', size: ASPECT_PRESET_TO_SIZE['1:1'], note: '均衡构图' },
    ]), []);

    // Auto-fill reference image and prompt from source
    useEffect(() => {
        if (!canvasElements) return;

        if (currentElement?.referenceImageId) {
            const sourceImage = canvasElements.find(el => el.id === currentElement.referenceImageId);
            if (sourceImage?.content && !referenceImage) {
                setReferenceImage(sourceImage.content);
            }
        }

        if (currentElement?.prompt && !prompt) {
            setPrompt(currentElement.prompt);
        }

        if (currentElement?.storyboardVideoSize) {
            setSize(currentElement.storyboardVideoSize);
        } else if (currentElement?.content && sizes.includes(currentElement.content as VideoSize)) {
            setSize(currentElement.content as VideoSize);
        } else if (currentElement?.prompt) {
            const inferredSize = STORYBOARD_SIZE_PRIORITY.find((candidate) => currentElement.prompt?.includes(candidate));
            if (inferredSize) {
                setSize(inferredSize);
            }
        }

        if (typeof currentElement?.storyboardDurationSec === 'number') {
            setSeconds(currentElement.storyboardDurationSec >= 15 ? 15 : 10);
        }
    }, [elementId, canvasElements, referenceImage, prompt, sizes]);

    // Poll for video status
    useEffect(() => {
        if (taskId && isGenerating) {
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const response = await fetch(`/api/video-status?taskId=${taskId}`);
                    const data = await response.json();

                    console.log('Video status:', data);
                    
                    setProgress(data.progress || 0);

                    // 当 progress 达到 100 且有视频 URL 时，视频准备好了
                    if (data.progress === 100 && data.videoUrl) {
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                        }
                        console.log('Video ready! URL:', data.videoUrl);
                        await onGenerate(data.videoUrl);
                        setIsGenerating(false);
                        setTaskId(null);
                        setProgress(0);
                    } else if (data.status === 'failed') {
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                        }
                        setIsGenerating(false);
                        setTaskId(null);
                        setProgress(0);
                        alert('视频生成失败，请重试');
                    }
                } catch (error) {
                    console.error('Error polling video status:', error);
                }
            }, 3000); // Poll every 3 seconds

            return () => {
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                }
            };
        }
    }, [taskId, isGenerating, onGenerate]);

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (prompt.trim() && !isGenerating) {
                await handleGenerate();
            }
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
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

        try {
            const response = await fetch('/api/generate-video', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    seconds,
                    size,
                    referenceImage: referenceImageBase64,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.details || data.error || '生成失败');
            }

            console.log('Video generation started:', data);
            setTaskId(data.taskId);
            // 轮询会在 useEffect 中自动开始
        } catch (error) {
            console.error('Error starting video generation:', error);
            alert(error instanceof Error ? error.message : '启动视频生成失败');
            setIsGenerating(false);
        }
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

    useEffect(() => {
        if (!onConfigChange) return;
        const meta = formatStoryboardMeta(currentSizeMeta.aspectRatio, seconds, renderProfile);
        const nodeDimensions = getNodeDimensions(size, currentSizeMeta.aspectRatio);
        onConfigChange(elementId, {
            prompt,
            width: nodeDimensions.width,
            height: nodeDimensions.height,
            originalWidth: nodeDimensions.width,
            originalHeight: nodeDimensions.height,
            storyboardVideoSize: size,
            storyboardDurationSec: seconds,
            content: size,
            storyboardMeta: meta,
            storyboardAspectRatio: currentSizeMeta.aspectRatio,
            storyboardOrientation: currentSizeMeta.orientation,
            storyboardSourceAspectRatio: currentElement?.storyboardSourceAspectRatio || currentSizeMeta.aspectRatio,
            storyboardSourceVideoSize: currentElement?.storyboardSourceVideoSize || size,
            storyboardSourceOrientation: currentElement?.storyboardSourceOrientation || currentSizeMeta.orientation,
            storyboardRenderProfile: renderProfile,
        });
    }, [currentSizeMeta.aspectRatio, currentSizeMeta.orientation, elementId, getNodeDimensions, onConfigChange, prompt, seconds, size]);

    return (
        <div
            className="absolute z-50 w-[450px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:rounded-3xl dark:border-white/10 dark:bg-black/78 dark:shadow-[0_28px_80px_rgba(0,0,0,0.5)] dark:backdrop-blur-2xl"
            style={style}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
            />

            <div className="p-4">
                {currentElement && (
                    <div className="mb-3 space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                        <div>
                            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{currentElement.storyboardBoardMode || '制作板编辑器'}</div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {currentElement.storyboardShotLabel && (
                                    <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentElement.storyboardShotLabel}</span>
                                )}
                                {currentElement.storyboardTitle && (
                                    <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentElement.storyboardTitle}</span>
                                )}
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{shotProgressLabel}</span>
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentSizeMeta.aspectRatio}</span>
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentSizeMeta.orientation[0].toUpperCase() + currentSizeMeta.orientation.slice(1)}</span>
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{seconds}s</span>
                                <span className={`rounded-full px-2 py-1 shadow-sm ${renderProfile === 'high' ? 'bg-violet-50 text-violet-700 dark:bg-violet-400/12 dark:text-violet-100' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100'}`}>{renderProfile === 'high' ? '高细节' : '标准细节'}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">画幅</div>
                                <div className="mt-1 flex items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
                                    <OrientationIcon size={13} />
                                    <span>{currentSizeMeta.aspectRatio} · {currentSizeMeta.orientation[0].toUpperCase() + currentSizeMeta.orientation.slice(1)}</span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">输出</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{size}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">序列</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{typeof currentElement.storyboardSequenceHint === 'string' ? currentElement.storyboardSequenceHint : '单镜头'}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">镜头进度</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{shotProgressLabel}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">制作板适配</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{currentElement.storyboardBoardMode || '制作板编辑器'}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">画幅差异</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{frameDeltaLabel}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">画幅路由</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{frameRoutingLabel}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">覆盖策略</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{coverageLabel}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">适配方式</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
                                    <span>{frameAdaptationLabel}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                                        frameAdaptationTone === 'stable'
                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100'
                                            : frameAdaptationTone === 'warning'
                                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/12 dark:text-amber-100'
                                                : 'bg-sky-50 text-sky-700 dark:bg-sky-400/12 dark:text-sky-100'
                                    }`}>{frameAdaptationTone}</span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">细节轨道</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{renderProfile === 'high' ? '高细节' : '标准细节'}</div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                <div className="uppercase tracking-wide text-gray-400">节点尺寸</div>
                                <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{getNodeDimensions(size, currentSizeMeta.aspectRatio).width} × {getNodeDimensions(size, currentSizeMeta.aspectRatio).height}</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                <span>画幅预设</span>
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedBoardSettings((prev) => !prev)}
                                    className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:text-gray-300 dark:hover:border-sky-400/20 dark:hover:bg-white/8 dark:hover:text-sky-100"
                                >
                                    {showAdvancedBoardSettings ? '隐藏高级设置' : '分镜感知输出'}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {aspectPresetCards.map((preset) => {
                                    const presetMeta = getSizeMeta(preset.size);
                                    const PresetIcon = presetMeta.orientation === 'landscape'
                                        ? RectangleHorizontal
                                        : presetMeta.orientation === 'square'
                                            ? Square
                                            : RectangleVertical;
                                    const active = currentSizeMeta.aspectRatio === preset.value;
                                    return (
                                        <button
                                            key={preset.value}
                                            type="button"
                                            onClick={() => setSize(preset.size)}
                                            className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                                                active
                                                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-100'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-600 dark:border-white/10 dark:bg-white/6 dark:text-gray-200 dark:hover:border-sky-400/20 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <PresetIcon size={14} />
                                                    <span className="text-xs font-semibold">{preset.value}</span>
                                                </div>
                                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:bg-white/8">{preset.label}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{preset.size}</div>
                                            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">{preset.note}</div>
                                            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{getStoryboardNodeDimensions(preset.size, preset.value).width} × {getStoryboardNodeDimensions(preset.size, preset.value).height} node</div>
                                        </button>
                                    );
                                })}
                            </div>
                            {showAdvancedBoardSettings && (
                                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white/70 p-3 text-[11px] text-gray-500 dark:border-white/10 dark:bg-white/6 dark:text-gray-400">
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                        <div className="uppercase tracking-wide text-gray-400">源画幅</div>
                                        <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{currentElement?.storyboardSourceAspectRatio || currentElement?.storyboardAspectRatio || currentSizeMeta.aspectRatio}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                        <div className="uppercase tracking-wide text-gray-400">当前画幅</div>
                                        <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{currentSizeMeta.aspectRatio}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                        <div className="uppercase tracking-wide text-gray-400">源输出</div>
                                        <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{currentElement?.storyboardSourceVideoSize || currentElement?.storyboardVideoSize || size}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/6">
                                        <div className="uppercase tracking-wide text-gray-400">节点尺寸</div>
                                        <div className="mt-1 font-medium text-gray-800 dark:text-gray-100">{getNodeDimensions(size, currentSizeMeta.aspectRatio).width} × {getNodeDimensions(size, currentSizeMeta.aspectRatio).height}</div>
                                    </div>
                                    <div className="col-span-2 rounded-xl border border-dashed border-gray-200 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="uppercase tracking-wide text-gray-400">画幅差异</div>
                                            {!isBoardFitSize && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSize(boardFitSize)}
                                                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:text-gray-300 dark:hover:border-sky-400/20 dark:hover:bg-sky-400/12 dark:hover:text-sky-100"
                                                >
                                                    <RotateCcw size={10} />
                                                    回到制作板适配
                                                </button>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100">
                                            <span>{frameDeltaLabel}</span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                                                frameAdaptationTone === 'stable'
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100'
                                                    : frameAdaptationTone === 'warning'
                                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/12 dark:text-amber-100'
                                                        : 'bg-sky-50 text-sky-700 dark:bg-sky-400/12 dark:text-sky-100'
                                            }`}>
                                                {frameAdaptationLabel}
                                            </span>
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:bg-white/8 dark:text-gray-300">
                                                {availableSizeOptions.includes(size) ? '预设适配' : '手动覆盖'}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                                                isBoardFitSize
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-400/12 dark:text-amber-100'
                                            }`}>
                                                {isBoardFitSize ? '制作板适配' : `制作板适配 ${boardFitSize}`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">镜头说明</div>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="描述你想要生成的视频..."
                                className="h-24 w-full resize-none bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                                disabled={isGenerating}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Reference Image Preview */}
            {referenceImage && (
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <ImageIcon size={14} className="text-gray-600" />
                        <span className="text-xs text-gray-700 flex-1 truncate">
                            {typeof referenceImage === 'string' ? '画布图片' : referenceImage.name}
                        </span>
                        <button
                            onClick={() => setReferenceImage(null)}
                            className="text-gray-500 hover:text-gray-700 p-0.5"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Progress Bar with Loading UI */}
            {isGenerating && taskId && (
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Loader2 size={14} className="animate-spin text-gray-600" />
                        <span className="text-xs text-gray-600">
                            {progress === 0 ? '正在排队...' : 
                             progress < 30 ? '正在初始化...' : 
                             progress < 70 ? '正在生成视频...' : 
                             progress < 100 ? '即将完成...' : 
                             '视频准备好了！'}
                        </span>
                        <span className="ml-auto text-xs text-slate-500">{progress}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Footer Controls */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-white/10 dark:bg-gray-900/70">
                <div className="flex items-center gap-2">
                    {/* Model Indicator */}
                    <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors text-xs font-medium text-gray-700">
                        <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                            <Video size={8} className="text-white" />
                        </div>
                        <span>Sora 2</span>
                    </button>

                    {/* Reference Image Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowReferenceMenu(!showReferenceMenu)}
                            className={`p-1.5 hover:bg-gray-100 rounded-lg transition-colors ${
                                referenceImage ? 'text-gray-900 bg-gray-100' : 'text-gray-600'
                            }`}
                            title="参考图"
                        >
                            <Upload size={16} />
                        </button>
                        {showReferenceMenu && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 min-w-[140px]">
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
                                                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
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

                    {/* Size Selector */}
                    <div className="relative">
                        <div
                            onClick={() => setShowSizeMenu(!showSizeMenu)}
                            className="flex items-center gap-1 text-xs text-gray-600 font-medium cursor-pointer hover:bg-gray-100 px-1.5 py-1 rounded-lg transition-colors"
                        >
                            <span>{size}</span>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                {getSizeMeta(size).orientation[0].toUpperCase() + getSizeMeta(size).orientation.slice(1)}
                            </span>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                {getSizeMeta(size).aspectRatio}
                            </span>
                            <ChevronDown size={12} />
                        </div>
                         <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 dark:bg-white/8">Storyboard aware</span>
                            <span>{currentSizeMeta.orientation[0].toUpperCase() + currentSizeMeta.orientation.slice(1)} / {currentSizeMeta.aspectRatio}</span>
                        </div>
                        {showSizeMenu && (
                            <div className="absolute bottom-full mb-1 min-w-[220px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg z-10 dark:border-white/10 dark:bg-gray-950/96">
                                {sizes.map((s) => {
                                    const sizeMeta = getSizeMeta(s);
                                    const isRecommended = availableSizeOptions.includes(s);
                                    const isBoardDefault = currentElement?.storyboardVideoSize === s;
                                    return (
                                        <div
                                            key={s}
                                            onClick={() => {
                                                setSize(s);
                                                setShowSizeMenu(false);
                                            }}
                                            className={`px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/8 ${
                                                size === s ? 'text-black font-medium bg-gray-50 dark:bg-white/8 dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span>{s}</span>
                                                    {isRecommended && (
                                                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-sky-400/14 dark:text-sky-100">fit</span>
                                                    )}
                                                    {isBoardDefault && (
                                                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-400/14 dark:text-emerald-200">board</span>
                                                    )}
                                                    {!isRecommended && !isBoardDefault && sizeMeta.aspectRatio === currentSizeMeta.aspectRatio && (
                                                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-400/14 dark:text-amber-200">same frame</span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{sizeMeta.orientation[0].toUpperCase() + sizeMeta.orientation.slice(1)} · {sizeMeta.aspectRatio}</span>
                                            </div>
                                            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
                                                {isRecommended
                                                    ? (s === boardFitSize ? 'Board fit output' : 'Recommended for current storyboard frame')
                                                    : sizeMeta.aspectRatio === currentSizeMeta.aspectRatio
                                                        ? 'Same frame, alternate render tier'
                                                        : 'Manual override output'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Seconds Selector */}
                    <div className="relative">
                        <div
                            onClick={() => setShowSecondsMenu(!showSecondsMenu)}
                            className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8"
                        >
                            <span>{seconds}s</span>
                            <ChevronDown size={12} />
                        </div>
                        {showSecondsMenu && (
                            <div className="absolute bottom-full z-10 mb-1 min-w-[60px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg dark:rounded-xl dark:border-white/10 dark:bg-gray-950/96 dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                                {secondsOptions.map((sec) => (
                                    <div
                                        key={sec}
                                        onClick={() => {
                                            setSeconds(sec);
                                            setShowSecondsMenu(false);
                                        }}
                                        className={`px-3 py-1 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-white/8 ${
                                            seconds === sec ? 'bg-gray-50 text-black font-medium dark:bg-white/8 dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                        }`}
                                    >
                                        {sec}s
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Generate Button */}
                <button
                    onClick={() => prompt.trim() && !isGenerating && handleGenerate()}
                    disabled={!prompt.trim() || isGenerating}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 transition-all ${
                        prompt.trim() && !isGenerating
                            ? 'bg-black text-white shadow-md hover:bg-gray-800 dark:bg-gradient-to-r dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500 dark:shadow-[0_12px_30px_rgba(37,99,235,0.35)] dark:hover:brightness-110'
                            : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/8 dark:text-slate-500'
                    }`}
                >
                    {isGenerating ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <Zap size={16} className="fill-current" />
                    )}
                    <span className="font-medium">80</span>
                </button>
            </div>
        </div>
    );
}
