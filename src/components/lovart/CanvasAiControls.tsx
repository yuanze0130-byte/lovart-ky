'use client';

import { useEffect, useRef, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { prepareCanvasAiMedia } from '@/lib/canvas-ai-media';
import { loadCanvasAiCatalog } from '@/lib/canvas-ai-catalog-client';
import type { CanvasAiMode, CanvasAiModel } from '@/lib/canvas-ai';
import type { CanvasElement } from './CanvasArea';

interface Props {
  mode: CanvasAiMode;
  model?: string;
  instruction?: string;
  systemPrompt?: string;
  source: string;
  images?: string[];
  video?: string;
  outputKey?: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onResult: (result: { text: string; table?: { columns: string[]; rows: string[][] } }) => void;
  onRunningChange?: (running: boolean) => void;
}

const INPUT = 'w-full rounded-lg border border-white/15 bg-black/20 p-2 text-xs text-white outline-none disabled:opacity-50';

export function CanvasAiControls(props: Props) {
  const [models, setModels] = useState<CanvasAiModel[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const latestRef = useRef(props);
  latestRef.current = props;
  const selected = models.find((item) => item.id === props.model) || (!props.model ? models[0] : undefined);
  const inputKey = JSON.stringify([props.mode, props.model, props.instruction, props.systemPrompt, props.source, props.images, props.video, props.outputKey]);
  const inputKeyRef = useRef(inputKey);
  inputKeyRef.current = inputKey;
  useEffect(() => {
    let active = true;
    void loadCanvasAiCatalog().then((models) => {
      if (active) { setModels(models); setError(''); }
    }).catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : '模型列表读取失败'); });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    // A deleted or culled node must never write a late result back into the canvas.
    return () => { requestRef.current?.abort(); requestRef.current = null; latestRef.current.onRunningChange?.(false); };
  }, []);

  const run = async () => {
    if (requestRef.current || !selected) return;
    if (!props.instruction?.trim() && !props.source.trim() && !props.images?.length && !props.video) { setError('请输入要求或连接上游素材'); return; }
    if ((props.images?.length || props.video) && !selected.vision) { setError('当前模型不支持图片，请选择视觉模型'); return; }
    const controller = new AbortController();
    requestRef.current = controller;
    const startedKey = inputKey;
    setRunning(true); setError(''); setNotice('');
    latestRef.current.onRunningChange?.(true);
    const timeout = setTimeout(() => controller.abort(), 240000);
    try {
      const images = await prepareCanvasAiMedia(props.images || [], props.video, controller.signal);
      controller.signal.throwIfAborted();
      const response = await authedFetch('/api/canvas-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ mode: props.mode, model: selected.id, expectedCredits: selected.credits, instruction: props.instruction || '', source: props.source, systemPrompt: props.systemPrompt || '', images }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.text !== 'string' || !result.text.trim()) throw new Error(result.error || '模型没有返回有效内容');
      if (controller.signal.aborted) return;
      if (startedKey !== inputKeyRef.current) { setNotice('输入或结果已被修改，本次返回未覆盖现有内容。'); return; }
      latestRef.current.onResult(result);
      setNotice('已生成，输出端口已更新；下游生成需手动点击。');
      window.dispatchEvent(new Event('credits-updated'));
    } catch (error) {
      if (requestRef.current === controller) setError(controller.signal.aborted ? '任务已取消或超时，原结果已保留。' : error instanceof Error ? error.message : '生成失败');
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null; setRunning(false); latestRef.current.onRunningChange?.(false);
      }
    }
  };

  return <div className="space-y-2 border-b border-white/10 p-3" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="flex gap-2">
      <select aria-label="AI 模型" className={INPUT} disabled={running} value={selected?.id || props.model || ''} onChange={(event) => props.onConfigChange({ aiModel: event.target.value })}>
        {!selected && <option value={props.model || ''}>{props.model ? '原模型未开放，请重选' : error ? '模型不可用，请刷新' : '正在读取模型…'}</option>}
        {models.map((model) => <option key={model.id} value={model.id}>{model.label}{model.vision ? ' · 视觉' : ''} · {model.credits} 积分</option>)}
      </select>
      <button type="button" title="刷新模型" disabled={running} onClick={() => setReload((value) => value + 1)} className="shrink-0 whitespace-nowrap px-1 text-xs text-white/60">刷新</button>
    </div>
    {props.mode === 'agent' && <textarea aria-label="Agent 角色设定" className={INPUT} rows={2} maxLength={4000} disabled={running} value={props.systemPrompt || ''} onChange={(event) => props.onConfigChange({ aiSystemPrompt: event.target.value })} placeholder="角色设定，例如：你是分镜审核员，请检查画面连续性…" />}
    <textarea aria-label="AI 任务要求" className={INPUT} rows={2} maxLength={8000} disabled={running} value={props.instruction || ''} onChange={(event) => props.onConfigChange({ aiInstruction: event.target.value })} placeholder={props.mode === 'table' ? '整理要求，例如：按镜号、画面、台词、运镜分列' : '任务要求，例如：分析参考图片，生成详细绘画提示词'} />
    <div className="text-[10px] text-white/50">上游文字 {props.source.length} 字 · 图片 {props.images?.length || 0} 张{props.video ? ' · 视频抽取 4 帧，不含音频' : ''}</div>
    <button type="button" disabled={!running && !selected} onClick={() => running ? requestRef.current?.abort() : void run()} className="w-full rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
      {running ? '取消任务' : `${props.mode === 'table' ? 'AI 整理为表格' : '生成文字'}${selected ? ` · ${selected.credits} 积分` : ''}`}
    </button>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
  </div>;
}
