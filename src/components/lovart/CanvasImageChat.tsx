'use client';
/* eslint-disable @next/next/no-img-element -- Existing canvas and generated image URLs. */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { CanvasElement } from './CanvasArea';
import { IMAGE_MODEL_OPTIONS, type ImageModelId } from '@/lib/image-models';
import type { ImagePriceQuote } from '@/lib/image-pricing';
import { authedFetch } from '@/lib/authed-fetch';
import { requestImageGeneration, ImageGenerationRequestError } from '@/hooks/useCanvasGeneration';
import { addGenerationHistoryItem, type GenerationHistoryItem } from '@/lib/generation-history';

type Turn = { id: string; prompt: string; quote: number; status: 'running' | 'done' | 'unknown' | 'not-submitted' | 'failed-refunded' | 'failed-not-charged'; item?: GenerationHistoryItem; error?: string; inserted?: boolean };
const models = IMAGE_MODEL_OPTIONS.filter(model => model.supportedResolutions.includes('1K') && !model.requiresReference);
export function CanvasImageChat({ visible, projectId, userId, elements, selectedIds, onClose, onInsert }: {
  visible: boolean; projectId?: string | null; userId?: string; elements: CanvasElement[]; selectedIds: string[];
  onClose: () => void; onInsert: (item: GenerationHistoryItem) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModelId>('gemini-nano-banana-2.1');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('1K');
  const [references, setReferences] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [quote, setQuote] = useState<{ key: string; value: ImagePriceQuote } | null>(null);
  const [error, setError] = useState('');
  const [quoteRevision, setQuoteRevision] = useState(0);
  const busy = useRef(false), mounted = useRef(true), inserting = useRef(new Set<string>());
  const [pending, setPending] = useState(false);
  const quoteKey = `${model}:${resolution}:${references.length}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!visible || !userId) return;
    const controller = new AbortController();
    setQuote(null);
    setError('');
    void authedFetch('/api/image-price-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: model, resolution, referenceCount: references.length }), signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.quote) throw Error(data.error || '报价暂时不可用');
        if (!controller.signal.aborted) setQuote({ key: quoteKey, value: data.quote });
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '报价读取失败'); });
    return () => controller.abort();
  }, [visible, userId, model, resolution, references.length, quoteKey, quoteRevision]);
  const currentQuote = quote?.key === quoteKey ? quote.value : null;
  const acceptsReferences = models.find(item => item.id === model)?.supportsReferences;
  const send = async () => {
    if (busy.current || !prompt.trim() || !currentQuote || !projectId || !userId || (references.length > 0 && !acceptsReferences)) return;
    busy.current = true; setPending(true); setError('');
    const id = crypto.randomUUID(), submitted = prompt.trim();
    setTurns(previous => [...previous, { id, prompt: submitted, quote: currentQuote.credits, status: 'running' }]);
    setPrompt('');
    try {
      const result = await requestImageGeneration({ requestId: id, projectId, taskSource: 'chat', expectedPrice: { credits: currentQuote.credits, priceVersion: currentQuote.priceVersion }, prompt: submitted, modelVariant: model, resolution, aspectRatio: 'auto', referenceImages: references });
      if (!result.imageData) throw Error(result.textResponse || '结果尚未返回，请在任务中心核对，勿重复提交。');
      const item: GenerationHistoryItem = { id, kind: 'image', content: result.imageData, prompt: submitted, model: result.returnedModel || model, createdAt: new Date().toISOString(), origin:{ownerId:userId,projectId,nodeId:id}, metadata: { ...result.generationMetadata, taskId: result.returnedTaskId, projectId, ownerId:userId } };
      await addGenerationHistoryItem(item).catch(() => { if (mounted.current) setError('图片已生成，但本机素材保存失败，请及时放入画布。'); });
      if (mounted.current) setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, status: 'done', item } : turn));
    } catch (reason) {
      if (mounted.current) {
        const notSubmitted = reason instanceof ImageGenerationRequestError && reason.code === 'IMAGE_PRICE_CHANGED';
        const failureBilling = reason instanceof ImageGenerationRequestError && reason.code !== 'IMAGE_UPSTREAM_OUTCOME_UNKNOWN' && (reason.code === 'IMAGE_GENERATION_FAILED' || reason.outcome === 'failed') ? reason.billingState : undefined;
        const status: Turn['status'] = notSubmitted ? 'not-submitted' : failureBilling === 'refunded' ? 'failed-refunded' : failureBilling === 'not_charged' ? 'failed-not-charged' : 'unknown';
        setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, status, error: reason instanceof Error ? reason.message : '请求未完成' } : turn));
        if (status !== 'unknown') { setPrompt(submitted); setQuote(null); setQuoteRevision(value => value + 1); }
      }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const insert = async (turn: Turn) => {
    if (!turn.item || turn.inserted || inserting.current.has(turn.id)) return;
    if (elements.some(element => element.generationMetadata?.recoveryRequestId === turn.id)) {
      setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, inserted: true } : item));
      return;
    }
    inserting.current.add(turn.id);
    try { await onInsert(turn.item); if (mounted.current) setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, inserted: true } : item)); }
    catch { if (mounted.current) setError('放入画布失败，请重试。图片不会重新生成。'); }
    finally { inserting.current.delete(turn.id); }
  };
  return <section hidden={!visible} aria-label="对话生图" className="absolute right-4 top-20 bottom-4 z-[65] flex w-[min(420px,calc(100vw-32px))] flex-col rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-950" style={!visible ? { display: 'none' } : undefined}>
    <header className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-white/10"><div><h2 className="text-sm font-semibold">对话生图</h2><p className="text-xs text-gray-500">描述画面，或引用图片继续修改</p></div><button type="button" aria-label="关闭对话生图" onClick={onClose}><X size={18} /></button></header>
    <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
      {!turns.length && <p className="text-sm text-gray-500">输入想要的画面。每次发送生成一张图片，结果可以一键放入画布。</p>}
      {turns.map(turn => <article key={turn.id} className="space-y-2"><p className="rounded-xl bg-sky-50 p-3 text-sm text-slate-900">{turn.prompt}</p><p className="text-xs text-gray-500">本次报价 {turn.quote} 积分 · {turn.status === 'running' ? '生成中，请勿重复提交' : turn.status === 'done' ? '已返回图片' : turn.status === 'not-submitted' ? '未提交 · 未扣费' : turn.status === 'failed-refunded' ? '生成失败 · 已退款' : turn.status === 'failed-not-charged' ? '生成失败 · 未扣费' : '结果待核对'}</p>
        {turn.item && <><img src={turn.item.content} alt={turn.prompt} className="max-h-64 w-full rounded-xl object-contain" /><div className="flex gap-3 text-xs"><button type="button" disabled={turn.inserted} onClick={() => void insert(turn)}>{turn.inserted ? '已放入画布' : '放入画布'}</button><button type="button" disabled={pending} onClick={() => setReferences([turn.item!.content])}>引用这张图继续修改</button></div></>}
        {turn.error && <p role="alert" className="text-xs text-amber-600">{turn.error} {turn.status === 'unknown' ? '请先在任务中心核对结果和扣费。' : '请检查失败原因并核对新报价，重新点击生成会提交新任务。'}</p>}
      </article>)}
    </div>
    <div className="space-y-3 border-t border-gray-200 p-4 dark:border-white/10">
      <div className="flex gap-2"><select aria-label="生图模型" disabled={pending} value={model} onChange={event => { setModel(event.target.value as ImageModelId); setResolution('1K'); }} className="min-w-0 flex-1 rounded-lg border p-2 text-xs dark:bg-slate-900">{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select aria-label="生图分辨率" disabled={pending} value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)} className="rounded-lg border p-2 text-xs dark:bg-slate-900">{models.find(item => item.id === model)?.supportedResolutions.filter(value => value !== '3K').map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="flex gap-3 text-xs"><button type="button" disabled={pending} onClick={() => setReferences(elements.filter(element => selectedIds.includes(element.id) && element.type === 'image' && element.content).map(element => element.content!).slice(0, 8))}>引用选中的图片</button>{references.length > 0 && <button type="button" disabled={pending} onClick={() => setReferences([])}>清除 {references.length} 张引用</button>}</div>
      <textarea aria-label="图片描述" disabled={pending} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={references.length ? '描述如何修改引用图片…' : '描述想要生成的画面…'} rows={3} className="w-full resize-none rounded-xl border p-3 text-sm dark:bg-slate-900" />
      {error && <p role="alert" className="text-xs text-amber-600">{error}</p>}
      {!userId || !projectId ? <p className="text-xs text-amber-600">请先登录并保存项目。</p> : null}
      {references.length > 0 && !acceptsReferences && <p className="text-xs text-amber-600">当前模型不支持参考图，请清除引用或更换模型。</p>}
      <button type="button" disabled={pending || !currentQuote || !prompt.trim() || !userId || !projectId || (references.length > 0 && !acceptsReferences)} onClick={() => void send()} className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-40">{!userId || !projectId ? '请先登录并保存项目' : pending ? '生成中…' : currentQuote ? `生成一张 · ${currentQuote.credits} 积分` : '正在核对报价…'}</button>
      <p className="text-[10px] text-gray-500">点击生成会提交付费任务。关闭面板不会取消已提交任务。</p>
    </div>
  </section>;
}
