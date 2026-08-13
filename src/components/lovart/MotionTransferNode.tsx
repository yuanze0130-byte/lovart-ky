"use client";

import { Check, Image as ImageIcon, Loader2, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';

type MotionModel = 'kling-2.6' | 'kling-3.0';
type MotionMode = 'std' | 'pro' | '4k';
type MotionOrientation = 'image' | 'video';

interface MotionTransferNodeProps {
  sourceImage?: string;
  sourceVideo?: string;
  connectedPrompt?: string;
  prompt: string;
  model: MotionModel;
  mode: MotionMode;
  keepAudio: boolean;
  orientation: MotionOrientation;
  watermark: boolean;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onComplete?: (videoUrl: string) => Promise<void> | void;
}

type MotionStartResponse = {
  taskId?: string;
  videoUrl?: string;
  status?: string;
  error?: string;
  details?: string;
  requestId?: string;
  recoverable?: boolean;
};

type MotionStatusResponse = MotionStartResponse & {
  jobStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number;
};

type MotionRunInputs = {
  sourceImage: string;
  sourceVideo: string;
  connectedPrompt?: string;
  prompt: string;
  model: MotionModel;
  mode: MotionMode;
  keepAudio: boolean;
  orientation: MotionOrientation;
  watermark: boolean;
};

type MotionRun = {
  id: number;
  controller: AbortController;
  inputs: MotionRunInputs;
};

type CanvasAssetUploadResponse = {
  error?: string;
  url?: string;
};

const POLL_DELAY_MS = 3000;

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function hasSameRunInputs(left: MotionRunInputs, right: MotionRunInputs) {
  return left.sourceImage === right.sourceImage
    && left.sourceVideo === right.sourceVideo
    && left.connectedPrompt === right.connectedPrompt
    && left.prompt === right.prompt
    && left.model === right.model
    && left.mode === right.mode
    && left.keepAudio === right.keepAudio
    && left.orientation === right.orientation
    && left.watermark === right.watermark;
}

async function uploadMotionAsset(asset: string, signal: AbortSignal) {
  if (!/^data:(?:image|video)\/[\w.+-]+;base64,/i.test(asset)) return asset;

  const blobResponse = await fetch(asset, { signal });
  if (!blobResponse.ok) throw new Error('无法读取画布素材');

  const blob = await blobResponse.blob();
  const response = await authedFetch('/api/canvas-assets', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
    signal,
  });
  const result = (await response.json().catch(() => ({}))) as CanvasAssetUploadResponse;

  if (!response.ok || !result.url) {
    throw new Error(result.error || '素材保存到服务器失败');
  }

  return result.url;
}

export function MotionTransferNode({
  sourceImage,
  sourceVideo,
  connectedPrompt,
  prompt,
  model,
  mode,
  keepAudio,
  orientation,
  watermark,
  onConfigChange,
  onComplete,
}: MotionTransferNodeProps) {
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunRef = useRef<MotionRun | null>(null);
  const nextRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const latestInputsRef = useRef<MotionRunInputs | null>(null);
  const onCompleteRef = useRef(onComplete);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const latestInputs = sourceImage && sourceVideo
    ? {
        sourceImage,
        sourceVideo,
        connectedPrompt,
        prompt,
        model,
        mode,
        keepAudio,
        orientation,
        watermark,
      }
    : null;
  latestInputsRef.current = latestInputs;
  onCompleteRef.current = onComplete;

  const clearPollTimer = () => {
    if (!pollTimerRef.current) return;
    clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  };

  const isCurrentRun = (run: MotionRun) => {
    const currentInputs = latestInputsRef.current;
    return mountedRef.current
      && activeRunRef.current === run
      && !run.controller.signal.aborted
      && currentInputs !== null
      && hasSameRunInputs(run.inputs, currentInputs);
  };

  const stopCurrentRun = (run: MotionRun) => {
    if (!isCurrentRun(run)) return;
    clearPollTimer();
    activeRunRef.current = null;
    setIsGenerating(false);
  };

  const failCurrentRun = (run: MotionRun, failure: unknown, fallback: string) => {
    if (!isCurrentRun(run) || isAbortError(failure)) return;
    run.controller.abort();
    clearPollTimer();
    activeRunRef.current = null;
    setError(failure instanceof Error ? failure.message : fallback);
    setIsGenerating(false);
    setProgress(0);
  };

  const finishCurrentRun = async (run: MotionRun, videoUrl: string) => {
    if (!isCurrentRun(run)) return;
    clearPollTimer();
    setProgress(100);

    await onCompleteRef.current?.(videoUrl);
    if (!isCurrentRun(run)) return;
    stopCurrentRun(run);
  };

  const pollStatus = async (run: MotionRun, taskId: string, requestId?: string) => {
    if (!isCurrentRun(run)) return;

    try {
      const query = new URLSearchParams({ taskId });
      if (requestId) query.set('requestId', requestId);
      const response = await authedFetch(`/api/motion-transfer/status?${query.toString()}`, {
        signal: run.controller.signal,
      });
      const result = await response.json() as MotionStatusResponse;
      if (!isCurrentRun(run)) return;
      if (!response.ok) throw new Error(result.details || result.error || '查询动作迁移状态失败');

      setProgress(Math.max(0, Math.min(100, Number(result.progress) || 0)));
      if (result.videoUrl) {
        await finishCurrentRun(run, result.videoUrl);
        return;
      }
      if (result.jobStatus === 'failed' || result.jobStatus === 'cancelled') {
        throw new Error(result.error || '动作迁移失败');
      }

      if (!isCurrentRun(run)) return;
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        void pollStatus(run, taskId, requestId);
      }, POLL_DELAY_MS);
    } catch (pollError) {
      failCurrentRun(run, pollError, '动作迁移失败');
    }
  };

  useEffect(() => {
    const activeRun = activeRunRef.current;
    if (!activeRun) return;

    activeRun.controller.abort();
    activeRunRef.current = null;
    clearPollTimer();
    setIsGenerating(false);
    setProgress(0);
    setError(null);
  }, [sourceImage, sourceVideo, connectedPrompt, prompt, model, mode, keepAudio, orientation, watermark]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRunRef.current?.controller.abort();
      activeRunRef.current = null;
      clearPollTimer();
    };
  }, []);

  const startTransfer = async () => {
    const inputs = latestInputsRef.current;
    if (!inputs || activeRunRef.current) return;

    const run: MotionRun = {
      id: ++nextRunIdRef.current,
      controller: new AbortController(),
      inputs,
    };
    activeRunRef.current = run;
    setError(null);
    setProgress(2);
    setIsGenerating(true);

    try {
      const [imageUrl, videoUrl] = await Promise.all([
        uploadMotionAsset(inputs.sourceImage, run.controller.signal),
        uploadMotionAsset(inputs.sourceVideo, run.controller.signal),
      ]);
      if (!isCurrentRun(run)) return;

      const response = await authedFetch('/api/motion-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          videoUrl,
          prompt: inputs.connectedPrompt?.trim() || inputs.prompt.trim(),
          model: inputs.model,
          mode: inputs.mode,
          keepAudio: inputs.keepAudio,
          orientation: inputs.orientation,
          watermark: inputs.watermark,
        }),
        signal: run.controller.signal,
      });
      const result = await response.json() as MotionStartResponse;
      const recoveryTaskId = response.headers.get('X-Doodleverse-Recoverable-Task-Id');
      if (!isCurrentRun(run)) return;
      if (!response.ok && !recoveryTaskId) throw new Error(result.details || result.error || '启动动作迁移失败');
      if (result.videoUrl) {
        await finishCurrentRun(run, result.videoUrl);
        return;
      }
      const taskId = result.taskId || recoveryTaskId;
      if (!taskId) throw new Error('上游服务未返回任务 ID');
      setProgress(5);
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        void pollStatus(run, taskId, result.requestId);
      }, POLL_DELAY_MS);
    } catch (startError) {
      failCurrentRun(run, startError, '启动动作迁移失败');
    }
  };

  const ready = Boolean(sourceImage && sourceVideo);
  const buttonClass = (active: boolean) => `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${active
    ? 'border-white bg-white text-black'
    : 'border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/10 hover:text-white'}`;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1d1d20] p-3 text-white shadow-2xl"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, textarea, input, select, a, [role="button"]')) {
          event.stopPropagation();
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">动作迁移</div>
          <div className="mt-0.5 text-[10px] text-white/45">参考图 + 参考视频驱动角色动作</div>
        </div>
        <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2 py-1 text-[9px] text-violet-100">Kling</span>
      </div>

      <div className="space-y-2 text-[10px] text-white/50">
        <div>
          <div className="mb-1">模型</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([['kling-2.6', 'Kling v2.6'], ['kling-3.0', 'Kling 3.0']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => onConfigChange({ motionModel: value })} className={buttonClass(model === value)}>{label}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1">模式</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['std', 'pro', '4k'] as const).map((value) => (
              <button key={value} type="button" onClick={() => onConfigChange({ motionMode: value })} className={buttonClass(mode === value)}>{value.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block">动作迁移提示词</span>
          <textarea
            value={connectedPrompt?.trim() || prompt}
            readOnly={Boolean(connectedPrompt?.trim())}
            onChange={(event) => onConfigChange({ prompt: event.target.value })}
            placeholder="描述你希望角色/场景如何发生动作迁移..."
            className="h-[72px] w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-lg border p-2 ${sourceImage ? 'border-emerald-300/20 bg-emerald-400/10' : 'border-white/10 bg-black/15'}`}>
            <div className="flex items-center gap-1.5 font-medium text-white/75"><ImageIcon size={12} />参考图</div>
            <div className="mt-1 truncate text-[9px]">{sourceImage ? '已连接图片输入端' : '未连接图片输入端'}</div>
          </div>
          <div className={`rounded-lg border p-2 ${sourceVideo ? 'border-violet-300/20 bg-violet-400/10' : 'border-white/10 bg-black/15'}`}>
            <div className="flex items-center gap-1.5 font-medium text-white/75"><Video size={12} />参考视频</div>
            <div className="mt-1 truncate text-[9px]">{sourceVideo ? '已连接视频输入端' : '未连接视频输入端'}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-black/15 p-2">
            <div className="mb-1">保留原声</div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => onConfigChange({ motionKeepAudio: true })} className={buttonClass(keepAudio)}>开</button>
              <button type="button" onClick={() => onConfigChange({ motionKeepAudio: false })} className={buttonClass(!keepAudio)}>关</button>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/15 p-2">
            <div className="mb-1">朝向来源</div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => onConfigChange({ motionOrientation: 'image' })} className={buttonClass(orientation === 'image')}>图</button>
              <button type="button" onClick={() => onConfigChange({ motionOrientation: 'video' })} className={buttonClass(orientation === 'video')}>视频</button>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/15 p-2">
            <div className="mb-1">水印</div>
            <button type="button" onClick={() => onConfigChange({ motionWatermark: !watermark })} className={`${buttonClass(watermark)} w-full`}>{watermark ? '启用' : '关闭'}</button>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3">
        {error && <div className="mb-2 rounded-lg border border-red-300/20 bg-red-500/15 px-2.5 py-2 text-[10px] leading-4 text-red-100">{error}</div>}
        {isGenerating && (
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-400 transition-all" style={{ width: `${Math.max(4, progress)}%` }} /></div>
        )}
        <button
          type="button"
          disabled={!ready || isGenerating}
          onClick={() => void startTransfer()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/35 disabled:text-black/55"
        >
          {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {isGenerating ? `动作迁移中 ${Math.round(progress)}%` : '开始动作迁移'}
        </button>
      </div>
    </div>
  );
}
