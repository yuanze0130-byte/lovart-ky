'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Film, Loader2, Play, Volume2, VolumeX } from 'lucide-react';
import type { CanvasElement } from './CanvasArea';
import { getVideoGenerationStatus, isVideoGenerationFailed, isVideoGenerationReady, startVideoGeneration } from './VideoGeneratorPanel';
import {
  DEFAULT_VIDEO_MODEL_ID,
  VIDEO_MODELS,
  getVideoModelDefinition,
  normalizeVideoGenerationConfig,
  type VideoAspectRatio,
  type VideoAudioMode,
} from '@/lib/video-models';

interface VideoGeneratorNodeProps {
  element: CanvasElement;
  connectedPrompt: string;
  referenceImages: string[];
  firstFrame?: string;
  lastFrame?: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onComplete?: (videoUrl: string) => Promise<void> | void;
}

function SelectControl({ value, title, options, onChange, className = '' }: {
  value: string;
  title: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`relative min-w-0 ${className}`} title={title}>
      <select
        aria-label={title}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-6 text-[11px] font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-4 w-4 text-slate-400" />
    </label>
  );
}

function ToggleChip({ checked, label, disabled, onChange }: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onMouseDown={(event) => event.stopPropagation()}
      className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition ${checked
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-sky-400/60 dark:bg-sky-400/10 dark:text-sky-200'
        : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'}`}>
        {checked && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

export function VideoGeneratorNode({
  element,
  connectedPrompt,
  referenceImages,
  firstFrame,
  lastFrame,
  onConfigChange,
  onComplete,
}: VideoGeneratorNodeProps) {
  const [localPrompt, setLocalPrompt] = useState(element.prompt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runTokenRef = useRef(0);

  useEffect(() => setLocalPrompt(element.prompt || ''), [element.prompt]);
  useEffect(() => () => { runTokenRef.current += 1; }, []);

  const legacyModel = element.videoModelMode === 'fast' ? 'jimeng-cli-seedance2.0fast' : DEFAULT_VIDEO_MODEL_ID;
  const config = normalizeVideoGenerationConfig({
    modelId: element.videoModelId || legacyModel,
    aspectRatio: element.videoAspectRatio || element.storyboardAspectRatio || '16:9',
    duration: element.videoDuration || element.storyboardDurationSec || 8,
    resolution: element.videoResolution || '1080p',
    hd: element.videoHd === true,
    useStartEndFrames: element.videoUseStartEndFrames === true,
    audioMode: element.videoAudioMode || 'none',
    generateAudio: element.videoGenerateAudio === true,
    multiShot: element.videoMultiShot === true,
    cameraFixed: element.videoCameraFixed === true,
  });
  const definition = getVideoModelDefinition(config.modelId);
  const effectivePrompt = connectedPrompt.trim() || localPrompt.trim();
  const connectedCount = referenceImages.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0);

  const groupedModels = useMemo(() => {
    const groups = new Map<string, typeof VIDEO_MODELS[number][]>();
    VIDEO_MODELS.forEach((entry) => groups.set(entry.provider, [...(groups.get(entry.provider) || []), entry]));
    return Array.from(groups.entries());
  }, []);

  const updateModel = (modelId: string) => {
    const next = normalizeVideoGenerationConfig({ modelId });
    onConfigChange({
      videoModelId: next.modelId,
      videoAspectRatio: next.aspectRatio,
      videoDuration: next.duration,
      videoResolution: next.resolution,
      videoHd: false,
      videoUseStartEndFrames: false,
      videoAudioMode: 'none',
      videoGenerateAudio: false,
      videoMultiShot: false,
      videoCameraFixed: false,
      videoModelMode: next.modelId.includes('fast') ? 'fast' : 'standard',
    });
  };

  const generate = async () => {
    if (!effectivePrompt || isGenerating) return;
    const runToken = ++runTokenRef.current;
    setIsGenerating(true);
    setProgress(0);
    setError(null);
    onConfigChange({ prompt: localPrompt, generationMetadata: { ...(element.generationMetadata || {}), taskStatus: 'queued', model: config.modelId } });
    try {
      const result = await startVideoGeneration({
        prompt: effectivePrompt,
        modelId: config.modelId,
        aspectRatio: config.aspectRatio,
        duration: config.duration,
        resolution: config.resolution,
        hd: config.hd,
        useStartEndFrames: config.useStartEndFrames,
        audioMode: config.audioMode,
        generateAudio: config.generateAudio,
        multiShot: config.multiShot,
        cameraFixed: config.cameraFixed,
        referenceImages: definition.supportsReferenceImages ? referenceImages.slice(0, definition.maxReferenceImages || 1) : [],
        firstFrame,
        lastFrame: config.useStartEndFrames ? lastFrame : undefined,
      });
      onConfigChange({ generationMetadata: { ...(element.generationMetadata || {}), taskId: result.taskId, taskStatus: result.status || 'queued', model: result.model || config.modelId } });
      const startedAt = Date.now();
      while (runToken === runTokenRef.current) {
        if (Date.now() - startedAt > 12 * 60 * 1000) throw new Error('视频生成超时，请稍后重试');
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await getVideoGenerationStatus(result.taskId);
        if (runToken !== runTokenRef.current) return;
        setProgress(status.progress || 0);
        onConfigChange({ generationMetadata: { ...(element.generationMetadata || {}), taskId: result.taskId, taskStatus: status.status || 'processing', model: status.model || result.model || config.modelId } });
        if (isVideoGenerationFailed(status.status)) throw new Error(status.error || '视频生成失败');
        if (isVideoGenerationReady(status) && status.videoUrl) {
          await onComplete?.(status.videoUrl);
          return;
        }
      }
    } catch (caught) {
      if (runToken === runTokenRef.current) setError(caught instanceof Error ? caught.message : '视频生成失败');
    } finally {
      if (runToken === runTokenRef.current) setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_14px_40px_rgba(15,23,42,0.13)] dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/8">
        <div className="flex items-center gap-2 text-xs font-semibold"><Film className="h-4 w-4 text-blue-500" />生成视频</div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-white/8 dark:text-slate-400">Comfly</span>
      </div>

      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.10),transparent_65%)] p-3">
        <textarea
          value={localPrompt}
          placeholder={connectedPrompt ? '已使用连线提示词' : '描述视频内容、镜头运动、动作与声音…'}
          onChange={(event) => setLocalPrompt(event.target.value)}
          onBlur={() => onConfigChange({ prompt: localPrompt })}
          onMouseDown={(event) => event.stopPropagation()}
          className="h-full min-h-20 w-full resize-none bg-transparent text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        {connectedPrompt && <div className="pointer-events-none absolute bottom-2 left-3 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">已连接提示词</div>}
      </div>

      {connectedCount > 0 && (
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-white/8">
          {[firstFrame, ...referenceImages, lastFrame].filter(Boolean).slice(0, 5).map((image, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- canvas assets may be local data URLs.
            <img key={`${String(image).slice(-24)}-${index}`} src={image} alt="视频参考" className="h-8 w-8 rounded-md border border-emerald-300 object-cover" />
          ))}
          <span className="text-[10px] text-emerald-700 dark:text-emerald-300">已连接 {connectedCount} 个参考</span>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 p-3 dark:border-white/8">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_64px] gap-2">
          <label className="relative min-w-0">
            <select aria-label="视频模型" value={config.modelId} onChange={(event) => updateModel(event.target.value)} onMouseDown={(event) => event.stopPropagation()} className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-white px-2 pr-6 text-[11px] font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
              {groupedModels.map(([provider, entries]) => <optgroup key={provider} label={provider}>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-4 w-4 text-slate-400" />
          </label>
          <SelectControl title="比例" value={config.aspectRatio} options={definition.ratios.map((ratio) => ({ value: ratio, label: ratio === 'auto' ? '智能' : ratio }))} onChange={(value) => onConfigChange({ videoAspectRatio: value as VideoAspectRatio })} />
          <SelectControl title="时长" value={String(config.duration)} options={definition.durations.map((duration) => ({ value: String(duration), label: `${duration}s` }))} onChange={(value) => onConfigChange({ videoDuration: Number(value) })} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {definition.resolutions && <SelectControl className="w-20" title="分辨率" value={config.resolution || definition.resolutions[0]} options={definition.resolutions.map((resolution) => ({ value: resolution, label: resolution }))} onChange={(value) => onConfigChange({ videoResolution: value })} />}
          {definition.supportsHd && <ToggleChip checked={config.hd} disabled={Boolean(definition.hdDurations && !definition.hdDurations.includes(config.duration))} label="HD" onChange={(checked) => onConfigChange({ videoHd: checked })} />}
          {definition.supportsStartEndFrames && <ToggleChip checked={config.useStartEndFrames} label="首尾帧" onChange={(checked) => onConfigChange({ videoUseStartEndFrames: checked })} />}
          {definition.supportsGenerateAudio && <button type="button" onClick={() => onConfigChange({ videoGenerateAudio: !config.generateAudio })} onMouseDown={(event) => event.stopPropagation()} className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] ${config.generateAudio ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300'}`}>{config.generateAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}音频</button>}
          {definition.supportsAudioMode && <SelectControl className="w-24" title="音频" value={config.audioMode} options={[{ value: 'none', label: '无音频' }, { value: 'auto', label: '自动配音' }, { value: 'custom', label: '自定义音频' }]} onChange={(value) => onConfigChange({ videoAudioMode: value as VideoAudioMode })} />}
          {definition.supportsMultiShot && <ToggleChip checked={config.multiShot} label="多镜头" onChange={(checked) => onConfigChange({ videoMultiShot: checked })} />}
          {definition.supportsCameraFixed && <ToggleChip checked={config.cameraFixed} label="固定镜头" onChange={(checked) => onConfigChange({ videoCameraFixed: checked })} />}
        </div>

        {error && <div className="line-clamp-2 text-[10px] text-red-500">{error}</div>}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-[10px] text-slate-500"><span className="font-medium text-slate-700 dark:text-slate-300">{definition.label}</span>{isGenerating ? ` · ${progress}%` : ` · ${definition.hint}`}</div>
          <button type="button" disabled={!effectivePrompt || isGenerating} onClick={generate} onMouseDown={(event) => event.stopPropagation()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-black px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}{isGenerating ? '生成中' : '生成'}
          </button>
        </div>
      </div>
    </div>
  );
}
