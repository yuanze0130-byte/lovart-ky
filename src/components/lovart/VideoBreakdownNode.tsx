'use client';

import { Link2, Loader2, ScanSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement, VideoBreakdownRow } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { importRemoteCanvasVideo } from '@/lib/canvas-asset-upload';
import { extractVideoFrames } from '@/lib/video-frame-extraction';
import { tableToMarkdown } from '@/lib/table-editor';
import { AI_TOOL_CREDIT_COSTS } from '@/lib/ai-tool-pricing';

interface VideoBreakdownNodeProps {
  sourceVideo?: string;
  connectedPrompt?: string;
  prompt: string;
  rows: VideoBreakdownRow[];
  summary?: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onRunningChange?: (running: boolean) => void;
}

function secondsToTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}

export function VideoBreakdownNode({ sourceVideo, connectedPrompt, prompt, rows, summary, onConfigChange, onRunningChange }: VideoBreakdownNodeProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const runningChangeRef = useRef(onRunningChange);
  const inputKey = JSON.stringify([sourceVideo || '', connectedPrompt || '', prompt]);
  const inputKeyRef = useRef(inputKey);
  inputKeyRef.current = inputKey;

  useEffect(() => {
    runningChangeRef.current = onRunningChange;
  }, [onRunningChange]);

  useEffect(() => {
    controllerRef.current?.abort();
  }, [connectedPrompt, prompt, sourceVideo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      runningChangeRef.current?.(false);
    };
  }, []);

  const run = async () => {
    if (!sourceVideo || isAnalyzing) return;
    const controller = new AbortController();
    const runInputKey = inputKey;
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setIsAnalyzing(true);
    runningChangeRef.current?.(true);
    setError(null);
    try {
      const localVideo = await importRemoteCanvasVideo(sourceVideo, controller.signal);
      const frames = await extractVideoFrames(localVideo, 6, controller.signal);
      if (controller.signal.aborted) return;
      let analyzedRows: VideoBreakdownRow[];
      let analyzedSummary = '已按时间线抽取 6 个关键镜头。';
      try {
        const response = await authedFetch('/api/video-breakdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            frames: frames.map((frame) => ({ dataUrl: frame.dataUrl, label: frame.label })),
            duration: frames.at(-1)?.seconds || 0,
            prompt: connectedPrompt?.trim() || prompt.trim(),
          }),
        });
        const result = await response.json() as { rows?: VideoBreakdownRow[]; summary?: string; error?: string; details?: string };
        if (!response.ok || !Array.isArray(result.rows)) throw new Error(result.details || result.error || '智能拆解失败');
        analyzedRows = result.rows;
        analyzedSummary = result.summary || analyzedSummary;
      } catch (analysisError) {
        if (controller.signal.aborted) return;
        analyzedRows = frames.map((frame, index) => ({
          timestamp: secondsToTimestamp(frame.seconds),
          shot: `镜头 ${index + 1}`,
          visual: '关键帧已提取，可在表格编辑节点中继续补充画面描述。',
          camera: '待补充',
          narration: '',
        }));
        setError(`${analysisError instanceof Error ? analysisError.message : '智能分析不可用'}，已保留本地时间线拆解。`);
      }

      const markdown = tableToMarkdown(
        ['时间', '镜头', '画面', '运镜', '旁白/台词'],
        analyzedRows.map((row) => [row.timestamp, row.shot, row.visual, row.camera, row.narration]),
      );
      if (controller.signal.aborted || inputKeyRef.current !== runInputKey) return;
      onConfigChange({ videoBreakdownRows: analyzedRows, videoBreakdownSummary: analyzedSummary, content: `${analyzedSummary}\n\n${markdown}` });
    } catch (runError) {
      if (controller.signal.aborted) return;
      setError(runError instanceof Error ? runError.message : '视频拆解失败');
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mountedRef.current) {
          setIsAnalyzing(false);
          runningChangeRef.current?.(false);
        }
      }
    }
  };

  if (!sourceVideo) {
    return (
      <div className="grid h-full w-full place-items-center rounded-xl border border-white/12 bg-[#1d1d20] p-8 text-center text-white shadow-2xl" onWheel={(event) => event.stopPropagation()}>
        <div>
          <Link2 size={28} className="mx-auto text-white/35" />
          <div className="mt-3 text-sm font-medium">请连接一个视频输入节点</div>
          <div className="mt-1 text-[10px] text-white/35">视频拆解会自动抽取关键帧并分析镜头</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1d1d20] p-3 text-white shadow-2xl"
      onMouseDown={(event) => { if ((event.target as HTMLElement).closest('button,input,textarea,select')) event.stopPropagation(); }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold"><ScanSearch size={13} />视频拆解</div>
          <div className="mt-0.5 text-[10px] text-white/40">内容、镜头、画面、运镜与旁白</div>
        </div>
        <span className="rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-1 text-[9px] text-emerald-100">视频已连接</span>
      </div>

      <textarea
        value={connectedPrompt?.trim() || prompt}
        readOnly={Boolean(connectedPrompt?.trim())}
        onChange={(event) => onConfigChange({ prompt: event.target.value })}
        placeholder="可选：输入关注方向，例如「重点拆解镜头语言和广告节奏」"
        className="mt-3 h-16 resize-none rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] leading-5 text-white outline-none placeholder:text-white/25"
      />

      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-black/18">
        {summary && <div className="border-b border-white/10 px-3 py-2 text-[10px] leading-4 text-white/55">{summary}</div>}
        {rows.length > 0 ? (
          <div className="divide-y divide-white/8">{rows.map((row, index) => (
            <div key={`${row.timestamp}-${index}`} className="grid grid-cols-[58px_72px_1fr] gap-2 px-3 py-2 text-[10px]">
              <span className="font-mono text-sky-300">{row.timestamp}</span>
              <span className="font-medium text-white/75">{row.shot}</span>
              <div><div className="text-white/65">{row.visual}</div><div className="mt-1 text-white/35">{row.camera}{row.narration ? ` · ${row.narration}` : ''}</div></div>
            </div>
          ))}</div>
        ) : (
          <div className="grid h-full min-h-36 place-items-center px-8 text-center text-[10px] leading-5 text-white/30">点击开始拆解，结果可继续连接到表格或剧本节点</div>
        )}
      </div>

      {error && <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-100">{error}</div>}
      <button type="button" onClick={() => void run()} disabled={isAnalyzing} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-40">
        {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
        {isAnalyzing ? '正在抽帧并分析...' : rows.length > 0 ? `重新拆解 · ${AI_TOOL_CREDIT_COSTS.videoBreakdown}积分` : `开始视频拆解 · ${AI_TOOL_CREDIT_COSTS.videoBreakdown}积分`}
      </button>
    </div>
  );
}
