'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Volume2 } from 'lucide-react';
import type { CanvasElement } from './CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import { importRemoteCanvasAsset } from '@/lib/canvas-asset-upload';
import { countSpeechCharacters, quoteSpeechCredits } from '@/lib/speech-pricing';
import { CANVAS_TASK_RETRY_EVENT, type CanvasTaskLogUpdate, type CanvasTaskRetryEventDetail } from '@/lib/canvas-task-log';

type SpeechModel = { id: string; label: string; priceUnitsPer10kCharacters: number };

export function SpeechNode({ element, connectedText, referenceLabels = [], onConfigChange, onRunningChange, onTaskUpdate }: { element: CanvasElement; connectedText: string; referenceLabels?: string[]; onConfigChange: (updates: Partial<CanvasElement>) => void; onRunningChange: (running: boolean) => void; onTaskUpdate?: (update: CanvasTaskLogUpdate) => void }) {
  const [models, setModels] = useState<SpeechModel[]>([]);
  const [model, setModel] = useState(element.speechModel || 'minimax/speech-02-turbo');
  const [voiceId, setVoiceId] = useState(element.speechVoiceId || 'female-shaonv');
  const [speed, setSpeed] = useState(element.speechSpeed ?? 1);
  const [pitch, setPitch] = useState(element.speechPitch ?? 0);
  const [format, setFormat] = useState<'mp3' | 'wav' | 'flac'>(element.speechAudioFormat || 'mp3');
  const [text, setText] = useState(element.prompt || '');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void authedFetch('/api/generate-speech', { signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { configured?: boolean; models?: SpeechModel[]; error?: string };
      if (!response.ok) throw new Error(data.error || '无法读取语音模型');
      setModels(Array.isArray(data.models) ? data.models : []);
      setCatalogError(data.configured === false ? '服务器尚未配置 Comfly 密钥' : '');
    }).catch((cause) => {
      if (!controller.signal.aborted) setCatalogError(cause instanceof Error ? cause.message : '无法读取语音模型');
    });
    return () => controller.abort();
  }, []);
  const selected = useMemo(() => models.find((item) => item.id === model) || models.find((item) => item.id === 'minimax/speech-02-turbo') || models[0], [model, models]);
  const sourceText = (connectedText || text).trim();
  const characterCount = countSpeechCharacters(sourceText);
  const quote = useMemo(() => {
    if (!selected || characterCount === 0) return undefined;
    try { return quoteSpeechCredits(selected.id, characterCount); } catch { return undefined; }
  }, [characterCount, selected]);
  const run = useCallback(async () => {
    const source = sourceText;
    if (!source) { setError('请输入文字或连接上游文字节点'); return; }
    if (!selected || !quote) { setError('暂时无法核算该语音模型的积分'); return; }
    const logId = `audio-${element.id}-${crypto.randomUUID()}`;
    setRunning(true); onRunningChange(true); setError('');
    onTaskUpdate?.({ id: logId, nodeId: element.id, kind: 'audio', status: 'queued', progress: 0, message: '语音任务等待上游接收', provider: 'Comfly · MiniMax', model: selected.id, promptPreview: source, referenceCount: referenceLabels.length, referenceLabels });
    try {
      onTaskUpdate?.({ id: logId, nodeId: element.id, kind: 'audio', status: 'running', progress: 15, message: '正在生成语音', provider: 'Comfly · MiniMax', model: selected.id });
      const response = await authedFetch('/api/generate-speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: source, model: selected.id, expectedCredits: quote.credits, voiceId, speed, pitch, format }) });
      const data = await response.json().catch(() => ({})) as { audioUrl?: string; error?: string; billing?: { requestId?: string } };
      if (!response.ok || !data.audioUrl) throw new Error(data.error || '语音生成失败');
      window.dispatchEvent(new Event('credits-updated'));
      let persisted = data.audioUrl;
      let persistenceFailed = false;
      try { persisted = await importRemoteCanvasAsset(data.audioUrl, 'audio'); }
      catch { persistenceFailed = true; setError('语音已生成，但云端素材保存失败；当前先使用上游临时地址'); }
      onConfigChange({ content: persisted, prompt: source, speechModel: selected.id, speechVoiceId: voiceId, speechSpeed: speed, speechPitch: pitch, speechAudioFormat: format });
      onTaskUpdate?.({ id: logId, nodeId: element.id, taskId: data.billing?.requestId, kind: 'audio', status: 'succeeded', level: persistenceFailed ? 'warning' : 'info', progress: 100, message: persistenceFailed ? '语音生成成功，云端素材保存失败' : '语音生成并保存成功', provider: 'Comfly · MiniMax', model: selected.id });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '语音生成失败';
      setError(message);
      onTaskUpdate?.({ id: logId, nodeId: element.id, kind: 'audio', status: 'failed', progress: 100, message: '语音生成失败', provider: 'Comfly · MiniMax', model: selected.id, error: message });
    }
    finally { setRunning(false); onRunningChange(false); }
  }, [element.id, format, onConfigChange, onRunningChange, onTaskUpdate, pitch, quote, referenceLabels, selected, sourceText, speed, voiceId]);
  useEffect(() => {
    const handleRetry = (event: Event) => {
      const detail = (event as CustomEvent<CanvasTaskRetryEventDetail>).detail;
      if (detail?.nodeId === element.id && !running) void run();
    };
    window.addEventListener(CANVAS_TASK_RETRY_EVENT, handleRetry);
    return () => window.removeEventListener(CANVAS_TASK_RETRY_EVENT, handleRetry);
  }, [element.id, run, running]);
  return <div className="flex h-full flex-col gap-3 rounded-2xl border border-fuchsia-200/80 bg-white/90 p-4 text-slate-900 shadow-sm dark:border-fuchsia-400/20 dark:bg-slate-950/80 dark:text-white">
    <div className="flex items-center gap-2"><Volume2 size={16} className="text-fuchsia-500" /><span className="font-semibold">语音生成</span><span className="ml-auto text-[10px] text-slate-500">MiniMax T2A</span></div>
    <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={connectedText ? '已连接上游文字' : '输入要朗读的文字'} className="min-h-24 resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none dark:border-white/10 dark:bg-white/5" />
    <div className="grid grid-cols-2 gap-2 text-[11px]"><label>模型<select value={selected?.id || model} onChange={(event) => setModel(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-1.5">{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>音色<input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-1.5" /></label></div>
    <div className="text-[10px] text-slate-500">{characterCount} 字符{selected ? ` · 上游价 ฿${selected.priceUnitsPer10kCharacters}/万字符` : ''}{quote ? ` · 本次 ${quote.credits} 积分` : ''}</div>
    <div className="grid grid-cols-3 gap-2 text-[11px]"><label>语速<input type="number" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="mt-1 w-full rounded-lg border bg-transparent p-1.5" /></label><label>音调<input type="number" min="-12" max="12" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} className="mt-1 w-full rounded-lg border bg-transparent p-1.5" /></label><label>格式<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="mt-1 w-full rounded-lg border bg-transparent p-1.5"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="flac">FLAC</option></select></label></div>
    {element.content && <audio src={element.content} controls preload="metadata" className="w-full" />}
    {(catalogError || error) && <div className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-600 dark:bg-rose-400/10 dark:text-rose-200">{catalogError || error}</div>}
    <button type="button" disabled={running || !quote} onClick={run} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{running && <Loader2 size={14} className="animate-spin" />} {running ? '生成中…' : quote ? `生成语音 · ${quote.credits}积分` : '输入文字后计价'}</button>
  </div>;
}
