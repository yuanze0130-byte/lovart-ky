"use client";

/* eslint-disable react-hooks/set-state-in-effect -- This panel mirrors persisted canvas node config into local form state when the selected generator node changes. */
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
    const [showAdvanced, setShowAdvanced] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const initializedElementIdRef = useRef<string | null>(null);
    const syncedReferenceImageIdRef = useRef<string | null>(null);

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
    const aspectRatioChips = useMemo<Array<{ label: string; ratio: StoryboardAspectRatio; defaultSize: VideoSize }>>(() => ([
        { label: '竖屏', ratio: '9:16', defaultSize: '720x1280' },
        { label: '横屏', ratio: '16:9', defaultSize: '1280x720' },
        { label: '方形', ratio: '1:1', defaultSize: '1024x1024' },
        { label: '分镜', ratio: sourceAspectRatio, defaultSize: boardFitSize },
    ]), [boardFitSize, sourceAspectRatio]);
    const handleAspectRatioSelect = useCallback((ratio: StoryboardAspectRatio, defaultSize: VideoSize) => {
        const ratioOptions = getStoryboardVideoSizeOptions(ratio) as VideoSize[];
        if (videoModelMode === 'fast') {
            const fastOptions = (FAST_MODEL_SIZE_OPTIONS[ratio] || []) as VideoSize[];
            if (fastOptions.length > 0) {
                setSize(fastOptions[0]);
                return;
            }
        }
        setSize(ratioOptions[0] || defaultSize);
    }, [videoModelMode]);


    // Initialize local panel state only when switching to a different generator node.
    useEffect(() => {
        if (!canvasElements || !currentElement) return;
        if (initializedElementIdRef.current === currentElement.id) return;

        initializedElementIdRef.current = currentElement.id;

        if (currentElement.referenceImageId) {
            const sourceImage = canvasElements.find(el => el.id === currentElement.referenceImageId);
            if (sourceImage?.content) {
                setReferenceImage(sourceImage.content);
                syncedReferenceImageIdRef.current = currentElement.referenceImageId;
            } else {
                setReferenceImage(null);
                syncedReferenceImageIdRef.current = null;
            }
        } else {
            setReferenceImage(null);
            syncedReferenceImageIdRef.current = null;
        }

        setPrompt(typeof currentElement.prompt === 'string' ? currentElement.prompt : '');

        if (currentElement.storyboardVideoSize) {
            setSize(currentElement.storyboardVideoSize);
        } else if (currentElement.content && sizes.includes(currentElement.content as VideoSize)) {
            setSize(currentElement.content as VideoSize);
        } else if (currentElement.prompt) {
            const promptText = currentElement.prompt;
            const inferredSize = STORYBOARD_SIZE_PRIORITY.find((candidate) => promptText.includes(candidate));
            setSize(inferredSize || '720x1280');
        } else {
            setSize('720x1280');
        }

        if (typeof currentElement.storyboardDurationSec === 'number') {
            const boundedSeconds = Math.min(15, Math.max(4, Math.round(currentElement.storyboardDurationSec))) as VideoSeconds;
            setSeconds(boundedSeconds);
        } else {
            setSeconds(10);
        }

        if (currentElement.videoModelMode === 'fast' || currentElement.videoModelMode === 'standard') {
            setVideoModelMode(currentElement.videoModelMode);
        } else {
            setVideoModelMode('standard');
        }
    }, [canvasElements, currentElement, sizes]);

    // Sync reference image only when the linked source image actually changes.
    useEffect(() => {
        if (!canvasElements || !currentElement?.referenceImageId) return;
        if (syncedReferenceImageIdRef.current === currentElement.referenceImageId) return;

        const sourceImage = canvasElements.find((el) => el.id === currentElement.referenceImageId);
        if (sourceImage?.content) {
            setReferenceImage(sourceImage.content);
            syncedReferenceImageIdRef.current = currentElement.referenceImageId;
        }
    }, [canvasElements, currentElement?.referenceImageId]);

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
            syncedReferenceImageIdRef.current = null;
            setShowReferenceMenu(false);
            e.target.value = '';
        }
    };

    const handleCanvasImageSelect = (imageId: string, imageContent: string) => {
        setReferenceImage(imageContent);
        syncedReferenceImageIdRef.current = imageId;
        setShowReferenceMenu(false);
    };

    const handleClearReferenceImage = () => {
        setReferenceImage(null);
        syncedReferenceImageIdRef.current = null;
    };

    const referenceSummary = referenceImage
        ? (typeof referenceImage === 'string' ? '已添加画布参考图' : referenceImage.name)
        : null;

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
            referenceImageId: typeof referenceImage === 'string' ? syncedReferenceImageIdRef.current || undefined : undefined,
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
        referenceImage,
        renderProfile,
        seconds,
        size,
        videoModelMode,
    ]);

    return (
        <div
            className="absolute z-50 w-[450px] overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-xl dark:border-white/10 dark:bg-black/80 dark:shadow-[0_28px_80px_rgba(0,0,0,0.5)] dark:backdrop-blur-2xl"
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

            <div className="space-y-4 p-4">
                <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">视频生成</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {currentElement?.storyboardTitle || currentElement?.storyboardShotLabel || '为当前分镜生成视频'}
                            </div>
                        </div>
                        <div className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                            {shotProgressLabel}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-white/8">{currentSizeMeta.aspectRatio}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-white/8">{seconds}s</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-white/8">{selectedVideoModelOption.label}</span>
                        {!isBoardFitSize && (
                            <button
                                type="button"
                                onClick={() => setSize(boardFitSize)}
                                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100 dark:hover:bg-sky-400/15"
                            >
                                跟随分镜推荐 {boardFitSize}
                            </button>
                        )}
                    </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                        描述视频
                    </div>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="描述主体动作、镜头运动、场景氛围、光线和节奏..."
                        className="h-28 w-full resize-none bg-transparent text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                        disabled={isGenerating}
                    />

                    {referenceSummary && (
                        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
                            <ImageIcon size={14} className="text-gray-500 dark:text-gray-300" />
                            <span className="flex-1 truncate text-xs text-gray-600 dark:text-gray-300">{referenceSummary}</span>
                            <button
                                type="button"
                                onClick={handleClearReferenceImage}
                                className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="space-y-3 rounded-3xl border border-gray-200 bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowReferenceMenu(!showReferenceMenu)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    referenceImage
                                        ? 'border-gray-300 bg-gray-100 text-gray-900 dark:border-white/15 dark:bg-white/10 dark:text-white'
                                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-black/20 dark:text-gray-200 dark:hover:bg-white/8'
                                }`}
                            >
                                <Upload size={14} />
                                <span>{referenceImage ? '更换参考图' : '添加参考图'}</span>
                            </button>
                            {showReferenceMenu && (
                                <div className="absolute left-0 top-full z-10 mt-2 min-w-[180px] rounded-2xl border border-gray-100 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            fileInputRef.current?.click();
                                            setShowReferenceMenu(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                                    >
                                        <Upload size={14} />
                                        上传图片
                                    </button>
                                    {imageElements.length > 0 && (
                                        <>
                                            <div className="my-1 border-t border-gray-100 dark:border-white/10" />
                                            <div className="px-3 py-1 text-[11px] text-gray-400 dark:text-gray-500">来自画布</div>
                                            <div className="max-h-[200px] overflow-y-auto">
                                                {imageElements.map((el, idx) => (
                                                    <button
                                                        type="button"
                                                        key={el.id}
                                                        onClick={() => handleCanvasImageSelect(el.id, el.content!)}
                                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                                                    >
                                                        <ImageIcon size={14} />
                                                        <span className="truncate">画布图片 {idx + 1}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {aspectRatioChips.map((chip) => {
                            const active = currentSizeMeta.aspectRatio === chip.ratio;
                            return (
                                <button
                                    key={`${chip.label}-${chip.ratio}`}
                                    type="button"
                                    onClick={() => handleAspectRatioSelect(chip.ratio, chip.defaultSize)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                        active
                                            ? 'bg-black text-white dark:bg-white dark:text-black'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/8 dark:text-gray-200 dark:hover:bg-white/12'
                                    }`}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowSecondsMenu(!showSecondsMenu)}
                                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/8 dark:text-gray-200 dark:hover:bg-white/12"
                            >
                                <span>{seconds}s</span>
                                <ChevronDown size={12} />
                            </button>
                            {showSecondsMenu && (
                                <div className="absolute left-0 top-full z-10 mt-2 min-w-[72px] rounded-2xl border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                                    {secondsOptions.map((sec) => (
                                        <button
                                            type="button"
                                            key={sec}
                                            onClick={() => {
                                                setSeconds(sec);
                                                setShowSecondsMenu(false);
                                            }}
                                            className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-white/8 ${
                                                seconds === sec ? 'font-medium text-black dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                            }`}
                                        >
                                            {sec}s
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowAdvanced((prev) => !prev)}
                            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-white/8 dark:text-gray-200 dark:hover:bg-white/12"
                        >
                            <span>高级</span>
                            <ChevronDown size={12} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {showAdvanced && (
                        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-black/20">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="relative">
                                    <div className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">模型</div>
                                    <button
                                        type="button"
                                        onClick={() => setShowModelMenu(!showModelMenu)}
                                        className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/8"
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <Video size={14} />
                                            {selectedVideoModelOption.label}
                                        </span>
                                        <ChevronDown size={14} />
                                    </button>
                                    {showModelMenu && (
                                        <div className="absolute left-0 top-full z-10 mt-2 min-w-full rounded-2xl border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                                            {VIDEO_MODEL_MODE_OPTIONS.map((option) => (
                                                <button
                                                    type="button"
                                                    key={option.value}
                                                    onClick={() => {
                                                        setVideoModelMode(option.value);
                                                        setShowModelMenu(false);
                                                    }}
                                                    className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/8 ${
                                                        videoModelMode === option.value ? 'font-medium text-black dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span>{option.label}</span>
                                                        {videoModelMode === option.value && (
                                                            <span className="rounded-full bg-black px-1.5 py-0.5 text-[10px] text-white dark:bg-white dark:text-black">当前</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{option.hint}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <div className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">尺寸</div>
                                    <button
                                        type="button"
                                        onClick={() => setShowSizeMenu(!showSizeMenu)}
                                        className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/8"
                                    >
                                        <span>{size}</span>
                                        <span className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            {currentSizeMeta.aspectRatio}
                                            <ChevronDown size={14} />
                                        </span>
                                    </button>
                                    {showSizeMenu && (
                                        <div className="absolute left-0 top-full z-10 mt-2 min-w-full rounded-2xl border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                                            {sizes.map((s) => {
                                                const sizeMeta = getSizeMeta(s);
                                                const isRecommended = availableSizeOptions.includes(s);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={s}
                                                        onClick={() => {
                                                            setSize(s);
                                                            setShowSizeMenu(false);
                                                        }}
                                                        className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/8 ${
                                                            size === s ? 'font-medium text-black dark:text-white' : 'text-gray-700 dark:text-gray-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span>{s}</span>
                                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">{sizeMeta.aspectRatio}</span>
                                                        </div>
                                                        {isRecommended && (
                                                            <div className="mt-1 text-[11px] text-blue-600 dark:text-sky-200">推荐尺寸</div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                                {!isBoardFitSize && <div>当前尺寸与分镜推荐不一致，可能会产生裁切或重构。</div>}
                                {frameDeltaLabel && <div>{frameDeltaLabel}</div>}
                                {frameAdaptationLabel && <div>{frameAdaptationLabel}</div>}
                                <div>{renderProfile === 'high' ? '当前为高细节输出。' : '当前为标准细节输出。'}</div>
                            </div>
                        </div>
                    )}
                </div>

                {isGenerating && taskId && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/5">
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
                )}

                <div className="flex items-center justify-end">
                    <button
                        onClick={() => prompt.trim() && !isGenerating && handleGenerate()}
                        disabled={!prompt.trim() || isGenerating}
                        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-all ${
                            prompt.trim() && !isGenerating
                                ? 'bg-black text-white shadow-md hover:bg-gray-800 dark:bg-gradient-to-r dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500 dark:shadow-[0_12px_30px_rgba(37,99,235,0.35)] dark:hover:brightness-110'
                                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/8 dark:text-slate-500'
                        }`}
                    >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="fill-current" />}
                        <span>{isGenerating ? `正在生成 ${progress}%` : '生成视频 · 80'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
