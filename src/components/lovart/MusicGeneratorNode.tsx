'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Music2 } from 'lucide-react';
import type { CanvasElement, MusicTrack } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { importRemoteCanvasAsset } from '@/lib/canvas-asset-upload';
import { quoteMusicCredits } from '@/lib/music-pricing';
import { CANVAS_TASK_RETRY_EVENT, type CanvasTaskLogUpdate, type CanvasTaskRetryEventDetail } from '@/lib/canvas-task-log';

type MusicVersion = { id: string; label: string; promptLimit: number; styleLimit: number };

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, milliseconds);
  signal.addEventListener('abort', () => {
    window.clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

export function MusicGeneratorNode({ element, connectedText, referenceLabels = [], onConfigChange, onRunningChange, onTaskUpdate }: {
  element: CanvasElement;
  connectedText: string;
  referenceLabels?: string[];
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onRunningChange: (running: boolean) => void;
  onTaskUpdate?: (update: CanvasTaskLogUpdate) => void;
}) {
  const [versions, setVersions] = useState<MusicVersion[]>([]);
  const [version, setVersion] = useState(element.musicVersion || 'chirp-fenix');
  const [mode, setMode] = useState<'inspiration' | 'custom'>(element.musicMode || 'inspiration');
  const [prompt, setPrompt] = useState(element.prompt || '');
  const [title, setTitle] = useState(element.musicTitle || '');
  const [style, setStyle] = useState(element.musicStyle || '');
  const [instrumental, setInstrumental] = useState(element.musicInstrumental || false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const runControllerRef = useRef<AbortController | null>(null);
  const quote = useMemo(() => quoteMusicCredits(), []);
  const sourceText = (connectedText || prompt).trim();
  const selectedVersion = versions.find((item) => item.id === version) || versions[0];

  useEffect(() => {
    const controller = new AbortController();
    void authedFetch('/api/generate-music', { signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { configured?: boolean; versions?: MusicVersion[]; error?: string };
      if (!response.ok) throw new Error(data.error || '无法读取音乐模型');
      setVersions(Array.isArray(data.versions) ? data.versions : []);
      setCatalogError(data.configured === false ? '服务器尚未配置 Comfly 密钥' : '');
    }).catch((cause) => {
      if (!controller.signal.aborted) setCatalogError(cause instanceof Error ? cause.message : '无法读取音乐模型');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => () => runControllerRef.current?.abort(), []);

  const run = useCallback(async () => {
    if (!sourceText) { setError(mode === 'custom' ? '请输入歌词或连接上游文字节点' : '请输入音乐灵感描述'); return; }
    if (mode === 'custom' && !title.trim()) { setError('自定义模式需要填写歌名'); return; }
    if (!selectedVersion) { setError('暂时无法读取 Suno 版本'); return; }
    const controller = new AbortController();
    runControllerRef.current?.abort();
    runControllerRef.current = controller;
    const logId = `music-${element.id}-${crypto.randomUUID()}`;
    const resumableTaskId = !element.content ? element.musicTaskId : undefined;
    let terminalFailure = false;
    setRunning(true); setProgress(5); setError(''); onRunningChange(true);
    onTaskUpdate?.({ id: logId, nodeId: element.id, taskId: resumableTaskId, kind: 'audio', status: 'queued', progress: 5, message: resumableTaskId ? '继续查询已有音乐任务' : '音乐任务等待上游接收', provider: 'Comfly · Suno', model: `suno_music/${selectedVersion.id}`, promptPreview: sourceText, referenceCount: referenceLabels.length, referenceLabels });
    try {
      let taskId = resumableTaskId;
      if (!taskId) {
        const response = await authedFetch('/api/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, prompt: sourceText, title: title.trim(), style: style.trim(), instrumental, version: selectedVersion.id, expectedCredits: quote.credits }),
          signal: controller.signal,
        });
        const submission = await response.json().catch(() => ({})) as { taskId?: string; error?: string };
        if (!response.ok || !submission.taskId) throw new Error(submission.error || '音乐任务提交失败');
        taskId = submission.taskId;
        onConfigChange({ musicTaskId: taskId, prompt: sourceText, musicMode: mode, musicTitle: title.trim(), musicStyle: style.trim(), musicInstrumental: instrumental, musicVersion: selectedVersion.id });
        window.dispatchEvent(new Event('credits-updated'));
      }
      setProgress(15);
      onTaskUpdate?.({ id: logId, nodeId: element.id, taskId, kind: 'audio', status: 'running', progress: 15, message: resumableTaskId ? '正在恢复音乐任务状态' : 'Suno 正在创作两首候选音乐', provider: 'Comfly · Suno', model: `suno_music/${selectedVersion.id}` });

      let completedTracks: MusicTrack[] = [];
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await wait(attempt === 0 ? 2_000 : 5_000, controller.signal);
        const statusResponse = await authedFetch(`/api/generate-music/status?taskId=${encodeURIComponent(taskId)}`, { signal: controller.signal });
        const status = await statusResponse.json().catch(() => ({})) as { status?: string; progress?: number; tracks?: MusicTrack[]; error?: string; refundedCredits?: number };
        if (!statusResponse.ok) throw new Error(status.error || '查询音乐任务失败');
        const nextProgress = Math.max(15, Math.min(95, status.progress || 15 + Math.round((attempt / 120) * 75)));
        setProgress(nextProgress);
        onTaskUpdate?.({ id: logId, nodeId: element.id, taskId, kind: 'audio', status: 'running', progress: nextProgress, message: 'Suno 正在编曲与合成', provider: 'Comfly · Suno', model: `suno_music/${selectedVersion.id}` });
        if (status.status === 'failed' || status.status === 'cancelled') {
          terminalFailure = true;
          onConfigChange({ musicTaskId: undefined });
          window.dispatchEvent(new Event('credits-updated'));
          throw new Error(status.error || `音乐生成失败${status.refundedCredits ? '，积分已退回' : ''}`);
        }
        if (status.status === 'succeeded' && Array.isArray(status.tracks) && status.tracks.length > 0) {
          completedTracks = status.tracks;
          break;
        }
      }
      if (completedTracks.length === 0) throw new Error('音乐生成时间较长，请稍后从任务日志重试查询');
      let persistenceFailed = false;
      const tracks = await Promise.all(completedTracks.map(async (track) => {
        try { return { ...track, audioUrl: await importRemoteCanvasAsset(track.audioUrl, 'audio') }; }
        catch { persistenceFailed = true; return track; }
      }));
      onConfigChange({
        content: tracks[0].audioUrl,
        musicTracks: tracks,
        prompt: sourceText,
        musicMode: mode,
        musicTitle: title.trim(),
        musicStyle: style.trim(),
        musicInstrumental: instrumental,
        musicVersion: selectedVersion.id,
        musicTaskId: taskId,
      });
      setProgress(100);
      onTaskUpdate?.({ id: logId, nodeId: element.id, taskId, kind: 'audio', status: 'succeeded', level: persistenceFailed ? 'warning' : 'info', progress: 100, message: persistenceFailed ? `已生成 ${tracks.length} 首音乐，部分云端保存失败` : `已生成并保存 ${tracks.length} 首音乐`, provider: 'Comfly · Suno', model: `suno_music/${selectedVersion.id}` });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : '音乐生成失败';
      if (terminalFailure) onConfigChange({ musicTaskId: undefined });
      setError(message);
      onTaskUpdate?.({ id: logId, nodeId: element.id, kind: 'audio', status: 'failed', progress: 100, message: '音乐生成失败', provider: 'Comfly · Suno', model: `suno_music/${selectedVersion.id}`, error: message });
    } finally {
      if (runControllerRef.current === controller) {
        runControllerRef.current = null;
        setRunning(false); onRunningChange(false);
      }
    }
  }, [element.content, element.id, element.musicTaskId, instrumental, mode, onConfigChange, onRunningChange, onTaskUpdate, quote.credits, referenceLabels, selectedVersion, sourceText, style, title]);

  useEffect(() => {
    const handleRetry = (event: Event) => {
      const detail = (event as CustomEvent<CanvasTaskRetryEventDetail>).detail;
      if (detail?.nodeId === element.id && !running) void run();
    };
    window.addEventListener(CANVAS_TASK_RETRY_EVENT, handleRetry);
    return () => window.removeEventListener(CANVAS_TASK_RETRY_EVENT, handleRetry);
  }, [element.id, run, running]);

  const tracks = element.musicTracks || [];
  return <div className="flex h-full flex-col gap-3 overflow-auto rounded-2xl border border-violet-200/80 bg-white/92 p-4 text-slate-900 shadow-sm dark:border-violet-400/20 dark:bg-slate-950/85 dark:text-white">
    <div className="flex items-center gap-2"><Music2 size={17} className="text-violet-500" /><span className="font-semibold">音乐生成</span><span className="ml-auto text-[10px] text-slate-500">Suno · 每次两首</span></div>
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs dark:bg-white/5">
      {(['inspiration', 'custom'] as const).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-lg px-2 py-1.5 ${mode === item ? 'bg-white font-semibold shadow-sm dark:bg-white/10' : 'text-slate-500'}`}>{item === 'inspiration' ? '灵感模式' : '自定义歌词'}</button>)}
    </div>
    <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={connectedText ? '已连接上游文字' : mode === 'custom' ? '输入歌词，支持 [Verse] / [Chorus] 等结构' : '描述想要的歌曲、情绪、场景与风格'} className="min-h-24 resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none dark:border-white/10 dark:bg-white/5" />
    {mode === 'custom' && <div className="grid grid-cols-2 gap-2 text-[11px]"><label>歌名<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-1.5" /></label><label>风格标签<input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="pop, cinematic" className="mt-1 w-full rounded-lg border bg-transparent p-1.5" /></label></div>}
    <div className="flex items-end gap-2 text-[11px]"><label className="flex-1">版本<select value={selectedVersion?.id || version} onChange={(event) => setVersion(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-1.5">{versions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={instrumental} onChange={(event) => setInstrumental(event.target.checked)} />纯音乐</label></div>
    <div className="text-[10px] text-slate-500">上游价 ฿0.5/次 · 本次 {quote.credits} 积分 · 通常返回 2 首</div>
    {running && <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>}
    {tracks.map((track, index) => <div key={track.id || index} className="rounded-xl border border-slate-200 p-2 dark:border-white/10"><div className="mb-1 truncate text-[11px] font-medium">{track.title || `候选 ${index + 1}`}</div><audio src={track.audioUrl} controls preload="metadata" className="w-full" /></div>)}
    {(catalogError || error) && <div className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-600 dark:bg-rose-400/10 dark:text-rose-200">{catalogError || error}</div>}
    <button type="button" disabled={running || !selectedVersion} onClick={run} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{running && <Loader2 size={14} className="animate-spin" />}{running ? `生成中 ${progress}%` : `生成音乐 · ${quote.credits}积分`}</button>
  </div>;
}
