"use client";

import { Check, Image as ImageIcon, Loader2, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { uploadInlineCanvasAsset } from '@/lib/canvas-asset-upload';

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
};

type MotionStatusResponse = MotionStartResponse & {
  jobStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number;
};

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
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  const finish = async (videoUrl: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    setProgress(100);
    await onComplete?.(videoUrl);
    setIsGenerating(false);
  };

  const pollStatus = (taskId: string) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const response = await authedFetch(`/api/motion-transfer/status?taskId=${encodeURIComponent(taskId)}`);
        const result = await response.json() as MotionStatusResponse;
        if (!response.ok) throw new Error(result.details || result.error || '查询动作迁移状态失败');
        setProgress(Math.max(0, Math.min(100, Number(result.progress) || 0)));
        if (result.videoUrl) {
          await finish(result.videoUrl);
        } else if (result.jobStatus === 'failed' || result.jobStatus === 'cancelled') {
          throw new Error(result.error || '动作迁移失败');
        }
      } catch (pollError) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setError(pollError instanceof Error ? pollError.message : '动作迁移失败');
        setIsGenerating(false);
      }
    }, 3000);
  };

  const startTransfer = async () => {
    if (!sourceImage || !sourceVideo || isGenerating) return;
    setError(null);
    setProgress(2);
    setIsGenerating(true);
    try {
      const [imageUrl, videoUrl] = await Promise.all([
        uploadInlineCanvasAsset(sourceImage),
        uploadInlineCanvasAsset(sourceVideo),
      ]);
      const response = await authedFetch('/api/motion-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          videoUrl,
          prompt: connectedPrompt?.trim() || prompt.trim(),
          model,
          mode,
          keepAudio,
          orientation,
          watermark,
        }),
      });
      const result = await response.json() as MotionStartResponse;
      if (!response.ok) throw new Error(result.details || result.error || '启动动作迁移失败');
      if (result.videoUrl) {
        await finish(result.videoUrl);
        return;
      }
      if (!result.taskId) throw new Error('上游服务未返回任务 ID');
      setProgress(5);
      pollStatus(result.taskId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '启动动作迁移失败');
      setIsGenerating(false);
      setProgress(0);
    }
  };

  const ready = Boolean(sourceImage && sourceVideo);
  const buttonClass = (active: boolean) => `rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${active
    ? 'border-white bg-white text-black'
    : 'border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1d1d20] p-3 text-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
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
