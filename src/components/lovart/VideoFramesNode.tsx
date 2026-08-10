'use client';

import { Film, Loader2, Play, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';
import { importRemoteCanvasVideo } from '@/lib/canvas-asset-upload';
import { extractVideoFrames, type ExtractedVideoFrame } from '@/lib/video-frame-extraction';

interface VideoFramesNodeProps {
  sourceVideo?: string;
  frameCount: number;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onComplete?: (frames: ExtractedVideoFrame[]) => void;
  onRunningChange?: (running: boolean) => void;
}

export function VideoFramesNode({ sourceVideo, frameCount, onConfigChange, onComplete, onRunningChange }: VideoFramesNodeProps) {
  const [frames, setFrames] = useState<ExtractedVideoFrame[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const runningChangeRef = useRef(onRunningChange);
  const inputKey = `${sourceVideo || ''}\u0000${frameCount}`;
  const inputKeyRef = useRef(inputKey);
  inputKeyRef.current = inputKey;

  useEffect(() => {
    runningChangeRef.current = onRunningChange;
  }, [onRunningChange]);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsExtracting(false);
    runningChangeRef.current?.(false);
    setFrames([]);
    setError(null);
  }, [frameCount, sourceVideo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      runningChangeRef.current?.(false);
    };
  }, []);

  const run = async () => {
    if (!sourceVideo || isExtracting) return;
    const controller = new AbortController();
    const runInputKey = inputKey;
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsExtracting(true);
    runningChangeRef.current?.(true);
    setError(null);
    try {
      const localVideo = await importRemoteCanvasVideo(sourceVideo, controller.signal);
      const extracted = await extractVideoFrames(localVideo, frameCount, controller.signal);
      if (controller.signal.aborted || inputKeyRef.current !== runInputKey) return;
      setFrames(extracted);
      onConfigChange({ videoFrameCount: frameCount, content: extracted[0]?.dataUrl });
      onComplete?.(extracted);
    } catch (runError) {
      if (controller.signal.aborted) return;
      setError(runError instanceof Error ? runError.message : '抽帧失败');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mountedRef.current) {
          setIsExtracting(false);
          runningChangeRef.current?.(false);
        }
      }
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1d1d20] p-3 text-white shadow-2xl"
      onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,select')) event.stopPropagation(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold"><Film size={13} />视频抽帧</div>
          <div className="mt-0.5 text-[10px] text-white/40">均匀抽取关键帧，生成独立图片节点</div>
        </div>
        <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2 py-1 text-[9px] text-violet-100">{frames.length} 张</span>
      </div>

      <div className={`mt-3 rounded-xl border p-3 ${sourceVideo ? 'border-violet-300/20 bg-violet-400/8' : 'border-dashed border-white/14 bg-black/15'}`}>
        <div className="flex items-center gap-2 text-[11px] font-medium text-white/75"><Video size={14} />{sourceVideo ? '已连接视频输入' : '请连接一个视频输入节点'}</div>
        <div className="mt-1 text-[9px] text-white/35">从视频节点拖出连线，接入左侧视频端口</div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] text-white/45">抽帧数量</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[4, 6, 8, 12].map((count) => (
            <button key={count} type="button" onClick={() => onConfigChange({ videoFrameCount: count })} className={`rounded-lg border px-2 py-1.5 text-[10px] ${frameCount === count ? 'border-white bg-white text-black' : 'border-white/10 text-white/60 hover:bg-white/8'}`}>{count} 张</button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
        {frames.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">{frames.map((frame, index) => (
            <div key={`${frame.seconds}-${index}`} className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.dataUrl} alt={`抽帧 ${index + 1}`} className="aspect-video w-full object-cover" />
              <div className="px-1.5 py-1 text-[9px] text-white/45">{frame.label}</div>
            </div>
          ))}</div>
        ) : (
          <div className="grid h-full min-h-28 place-items-center px-6 text-center text-[10px] leading-5 text-white/30">点击「自动抽帧」后生成缩略图</div>
        )}
      </div>

      {error && <div className="mt-2 rounded-lg border border-red-300/20 bg-red-500/12 px-2.5 py-2 text-[10px] text-red-100">{error}</div>}
      <button type="button" disabled={!sourceVideo || isExtracting} onClick={() => void run()} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40">
        {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {isExtracting ? '正在抽帧...' : '自动抽帧'}
      </button>
    </div>
  );
}
