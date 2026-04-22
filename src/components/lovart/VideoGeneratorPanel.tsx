"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Zap, Image as ImageIcon, Upload, X, Video, Loader2 } from 'lucide-react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { getStoryboardNodeDimensions, getStoryboardRenderProfile, getStoryboardVideoSizeOptions, formatStoryboardMeta, getStoryboardFrameDeltaLabel, getStoryboardFrameAdaptationLabel, getPreferredStoryboardVideoSize } from '@/hooks/useProjectAssets';

export type VideoModelMode = 'standard' | 'fast';
export type VideoGenerationStartResult = {
  taskId: string;
  status?: string;
  model?: string;
  modelMode?: VideoModelMode;
  ratio?: string;
};

export type VideoGenerationStatusResult = {
  id?: string;
  status?: string;
  progress?: number;
  videoUrl?: string;
  model?: string;
  createdAt?: string | number;
  size?: string;
  seconds?: number;
};

export async function startVideoGeneration(input: {
  prompt: string;
  seconds: number;
  size: string;
  modelMode?: VideoModelMode;
  referenceImage?: string;
}): Promise<VideoGenerationStartResult> {
  const response = await authedFetch('/api/generate-video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();

  if (!response.ok || !data.taskId) {
    throw new Error(data.details || data.error || '启动视频生成失败');
  }

  return data as VideoGenerationStartResult;
}

export async function getVideoGenerationStatus(taskId: string): Promise<VideoGenerationStatusResult> {
  const response = await authedFetch(`/api/video-status?taskId=${encodeURIComponent(taskId)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.details || data.error || '查询视频状态失败');
  }

  return data as VideoGenerationStatusResult;
}

type VideoSize = '720x1280' | '1280x720' | '1024x1280' | '1024x1024' | '1024x1792' | '1792x1024' | '1024x768' | '768x1024' | '1536x640' | '1152x768' | '768x1152';
type StoryboardAspectRatio = '9:16' | '16:9' | '4:5' | '1:1' | '4:3' | '3:4' | '21:9' | '3:2' | '2:3';
type StoryboardOrientation = 'portrait' | 'landscape' | 'square';
const STORYBOARD_SIZE_PRIORITY: VideoSize[] = ['720x1280', '1024x1792', '1280x720', '1792x1024', '1024x1280', '1024x1024', '1024x768', '768x1024', '1536x640', '1152x768', '768x1152'];
type VideoSeconds = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

const VIDEO_MODEL_MODE_OPTIONS: Array<{ value: VideoModelMode; label: string; hint: string }> = [
    { value: 'standard', label: 'Seedance 2.0', hint: '更稳，适合最终出片' },
    { value: 'fast', label: 'Seedance 2.0 Fast', hint: '更快，适合快速迭代' },
];

const ASPECT_PRESET_TO_SIZE: Record<StoryboardAspectRatio, VideoSize> = {
    '9:16': '720x1280',
    '16:9': '1280x720',
    '4:5': '1024x1280',
    '1:1': '1024x1024',
    '4:3': '1024x768',
    '3:4': '768x1024',
    '21:9': '1536x640',
    '3:2': '1152x768',
    '2:3': '768x1152',
};

const FAST_MODEL_SIZE_OPTIONS: Partial<Record<StoryboardAspectRatio, VideoSize[]>> = {
    '16:9': ['1280x720'],
    '9:16': ['720x1280'],
    '1:1': ['1024x1024'],
};

const FAST_MODEL_DEFAULT_SIZE_BY_ASPECT: Partial<Record<StoryboardAspectRatio, VideoSize>> = {
    '16:9': '1280x720',
    '9:16': '720x1280',
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
    const [videoModelMode, setVideoModelMode] = useState<VideoModelMode>('standard');
    const [taskId, setTaskId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);

    // Dropdown states
    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const [showSecondsMenu, setShowSecondsMenu] = useState(false);
    const [showReferenceMenu, setShowReferenceMenu] = useState(false);
    const [showModelMenu, setShowModelMenu] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const sizes = useMemo<VideoSize[]>(() => ['720x1280', '1280x720', '1024x1280', '1024x1024', '1024x1792', '1792x1024', '1024x768', '768x1024', '1536x640', '1152x768', '768x1152'], []);
    const secondsOptions: VideoSeconds[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    const getSizeMeta = (value: VideoSize) => {
        const [width, height] = value.split('x').map(Number);
        const orientation: StoryboardOrientation = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
        const ratio = width / height;
        const candidates: Array<{ value: StoryboardAspectRatio; ratio: number }> = [
            { value: '1:1', ratio: 1 },
            { value: '16:9', ratio: 16 / 9 },
            { value: '9:16', ratio: 9 / 16 },
            { value: '4:5', ratio: 4 / 5 },
            { value: '4:3', ratio: 4 / 3 },
            { value: '3:4', ratio: 3 / 4 },
            { value: '21:9', ratio: 21 / 9 },
            { value: '3:2', ratio: 3 / 2 },
            { value: '2:3', ratio: 2 / 3 },
        ];
        const aspectRatio = candidates.reduce((best, current) => {
            const bestDelta = Math.abs(best.ratio - ratio);
            const currentDelta = Math.abs(current.ratio - ratio);
            return currentDelta < bestDelta ? current : best;
        }).value;
        return { orientation, aspectRatio };
    };

    const getNodeDimensions = useCallback((videoSize: VideoSize, aspectRatio: StoryboardAspectRatio) => {
        return getStoryboardNodeDimensions(videoSize, aspectRatio);
    }, []);

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
    const frameAdaptationLabel = getStoryboardFrameAdaptationLabel(sourceAspectRatio, currentSizeMeta.aspectRatio);
    const renderProfile = getStoryboardRenderProfile(size);
    const boardFitSize = videoModelMode === 'fast'
        ? (FAST_MODEL_DEFAULT_SIZE_BY_ASPECT[currentSizeMeta.aspectRatio] || FAST_MODEL_DEFAULT_SIZE_BY_ASPECT['9:16'] || '720x1280')
        : getPreferredStoryboardVideoSize(currentSizeMeta.aspectRatio, renderProfile);
    const isBoardFitSize = size === boardFitSize;
    const selectedVideoModelOption = VIDEO_MODEL_MODE_OPTIONS.find((option) => option.value === videoModelMode) || VIDEO_MODEL_MODE_OPTIONS[0];


    // Auto-fill reference image and prompt from source
    useEffect(() => {
        if (!canvasElements || !currentElement) return;

        if (currentElement.referenceImageId) {
            const sourceImage = canvasElements.find(el => el.id === currentElement.referenceImageId);
            if (sourceImage?.content && !referenceImage) {
                setReferenceImage(sourceImage.content);
            }
        }

        if (currentElement.prompt && !prompt) {
            setPrompt(currentElement.prompt);
        }

        if (currentElement.storyboardVideoSize) {
            setSize(currentElement.storyboardVideoSize);
        } else if (currentElement.content && sizes.includes(currentElement.content as VideoSize)) {
            setSize(currentElement.content as VideoSize);
        } else if (currentElement.prompt) {
            const promptText = currentElement.prompt;
            const inferredSize = STORYBOARD_SIZE_PRIORITY.find((candidate) => promptText.includes(candidate));
            if (inferredSize) {
                setSize(inferredSize);
            }
        }

        if (typeof currentElement.storyboardDurationSec === 'number') {
            const boundedSeconds = Math.min(15, Math.max(4, Math.round(currentElement.storyboardDurationSec))) as VideoSeconds;
            setSeconds(boundedSeconds);
        }

        if (currentElement.videoModelMode === 'fast' || currentElement.videoModelMode === 'standard') {
            setVideoModelMode(currentElement.videoModelMode);
        }
    }, [
        canvasElements,
        currentElement,
        prompt,
        referenceImage,
        sizes,
    ]);

    useEffect(() => {
        if (videoModelMode !== 'fast') return;

        const allowedSizes = (FAST_MODEL_SIZE_OPTIONS[currentSizeMeta.aspectRatio] || []) as VideoSize[];
        if (allowedSizes.length > 0 && !allowedSizes.includes(size)) {
            setSize(allowedSizes[0]);
            return;
        }

        if (allowedSizes.length === 0) {
            const fallbackSize = FAST_MODEL_DEFAULT_SIZE_BY_ASPECT['9:16'] || '720x1280';
            setSize(fallbackSize);
        }
    }, [currentSizeMeta.aspectRatio, size, videoModelMode]);

    // Poll for video status
    useEffect(() => {
        if (taskId && isGenerating) {
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const data = await getVideoGenerationStatus(taskId);

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
            const data = await startVideoGeneration({
                prompt,
                seconds,
                size,
                modelMode: videoModelMode,
                referenceImage: referenceImageBase64,
            });

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
            videoModelMode,
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
    }, [
        currentElement?.storyboardSourceAspectRatio,
        currentElement?.storyboardSourceOrientation,
        currentElement?.storyboardSourceVideoSize,
        currentSizeMeta.aspectRatio,
        currentSizeMeta.orientation,
        elementId,
        getNodeDimensions,
        onConfigChange,
        prompt,
        renderProfile,
        seconds,
        size,
        videoModelMode,
    ]);

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

            <div className="p-4 space-y-3">
                {currentElement && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {currentElement.storyboardShotLabel && (
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentElement.storyboardShotLabel}</span>
                            )}
                            {currentElement.storyboardTitle && (
                                <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentElement.storyboardTitle}</span>
                            )}
                            <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{currentSizeMeta.aspectRatio}</span>
                            <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{size}</span>
                            <span className="rounded-full bg-white px-2 py-1 shadow-sm dark:bg-white/8">{seconds}s</span>
                            <span className={`rounded-full px-2 py-1 shadow-sm ${renderProfile === 'high' ? 'bg-violet-50 text-violet-700 dark:bg-violet-400/12 dark:text-violet-100' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100'}`}>{renderProfile === 'high' ? '高细节' : '标准细节'}</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {shotProgressLabel}
                            {frameDeltaLabel ? ` · ${frameDeltaLabel}` : ''}
                            {frameAdaptationLabel ? ` · ${frameAdaptationLabel}` : ''}
                            {!isBoardFitSize ? ` · 建议 ${boardFitSize}` : ''}
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        <span>镜头说明</span>
                        {!isBoardFitSize && (
                            <button
                                type="button"
                                onClick={() => setSize(boardFitSize)}
                                className="rounded-full border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-white/10 dark:text-gray-300 dark:hover:border-sky-400/20 dark:hover:bg-white/8 dark:hover:text-sky-100"
                            >
                                使用推荐尺寸 {boardFitSize}
                            </button>
                        )}
                    </div>
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

            {/* Reference Image Preview */}
            {referenceImage && (
                <div className="px-4 pb-2">
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <ImageIcon size={14} className="text-gray-500 dark:text-gray-300" />
                        <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                            {typeof referenceImage === 'string' ? '已添加画布参考图' : referenceImage.name}
                        </span>
                        <button
                            onClick={() => setReferenceImage(null)}
                            className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Progress Bar with Loading UI */}
            {isGenerating && taskId && (
                <div className="px-4 pb-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="flex-1">{progress < 100 ? '正在生成视频' : '视频已完成'}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
                            <div
                                className="h-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Controls */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-white/10 dark:bg-gray-900/70">
                <div className="flex items-center gap-1.5">
                    {/* Model Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setShowModelMenu(!showModelMenu)}
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/8"
                        >
                            <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                                <Video size={8} className="text-white" />
                            </div>
                            <span>{selectedVideoModelOption.label}</span>
                            <ChevronDown size={12} />
                        </button>
                        {showModelMenu && (
                            <div className="absolute bottom-full mb-1 left-0 min-w-[220px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg z-10 dark:border-white/10 dark:bg-gray-950/96">
                                {VIDEO_MODEL_MODE_OPTIONS.map((option) => (
                                    <div
                                        key={option.value}
                                        onClick={() => {
                                            setVideoModelMode(option.value);
                                            setShowModelMenu(false);
                                        }}
                                        className={`px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/8 ${
                                            videoModelMode === option.value ? 'text-black font-medium bg-gray-50 dark:bg-white/8 dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span>{option.label}</span>
                                            {videoModelMode === option.value && (
                                                <span className="rounded-full bg-black px-1.5 py-0.5 text-[10px] text-white dark:bg-white dark:text-black">当前</span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{option.value === 'fast' ? '更快' : option.hint}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reference Image Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowReferenceMenu(!showReferenceMenu)}
                            className={`rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/8 ${
                                referenceImage ? 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white' : 'text-gray-600 dark:text-gray-300'
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
                                    className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 text-gray-700 dark:text-gray-200 dark:hover:bg-white/8"
                                >
                                    上传参考图
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
                                                    <span>{idx + 1}</span>
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
                            className="flex items-center gap-1 text-xs text-gray-600 font-medium cursor-pointer hover:bg-gray-100 px-1.5 py-1 rounded-lg transition-colors dark:text-gray-300 dark:hover:bg-white/8"
                        >
                            <span>{size}</span>
                            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/8 dark:text-gray-300">
                                {getSizeMeta(size).aspectRatio}
                            </span>
                            <ChevronDown size={12} />
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
                                                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-sky-400/14 dark:text-sky-100">推荐</span>
                                                    )}
                                                    {isBoardDefault && (
                                                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-400/14 dark:text-emerald-200">默认</span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{sizeMeta.aspectRatio}</span>
                                            </div>
                                            <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                                {isRecommended
                                                    ? '当前镜头推荐尺寸'
                                                    : isBoardDefault
                                                        ? '制作板默认尺寸'
                                                        : '手动覆盖'}
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
