'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { containsImageResult, imageResultContent } from '@/lib/image-versions';
import type { CanvasElement } from './CanvasArea';
import { ImageBatchQueue, imageBatchQuote, type ImageBatchRow } from '@/lib/image-batch-queue';
import { readImageBatch, saveImageBatch, type ImageBatchRecord } from '@/lib/image-batch-store';
import { withImageBatchLock } from '@/lib/image-batch-lock';
import { restoreImageBatch } from '@/lib/image-batch-queue';
import { IMAGE_MODEL_OPTIONS, type ImageModelId } from '@/lib/image-models';
import type { ImagePriceQuote } from '@/lib/image-pricing';
import { authedFetch } from '@/lib/authed-fetch';
import { requestImageGeneration, ImageGenerationRequestError } from '@/hooks/useCanvasGeneration';
import type { GenerationHistoryItem } from '@/lib/generation-history';

const labels = { queued: '等待提交', running: '生成中', succeeded: '完成', failed: '失败', unknown: '待核对', cancelled: '已取消' };
const models = IMAGE_MODEL_OPTIONS.filter(model => model.supportedResolutions.includes('1K') && !model.requiresReference);
type BatchLedgerRow={request_id:string;status:string;meta?:{billingState?:string}};
export type ImageBatchServices={
  quote:(model:ImageModelId,resolution:ImageBatchRecord['resolution'],referenceCount:number)=>Promise<ImagePriceQuote>;
  generate:(input:Parameters<typeof requestImageGeneration>[0])=>Promise<{imageData?:string;textResponse?:string}>;
  ledger:(projectId:string)=>Promise<BatchLedgerRow[]>;
};
const batchServices:ImageBatchServices={
  quote:async(modelId,resolution,referenceCount)=>{
    const response=await authedFetch('/api/image-price-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId,resolution,referenceCount})});
    const data=await response.json() as {quote?:ImagePriceQuote;error?:string};
    if(!response.ok || !data.quote)throw Error(data.error || '报价不可用');
    return data.quote;
  },
  generate:requestImageGeneration,
  ledger:async(projectId)=>{
    const response=await authedFetch(`/api/projects/image-runs?id=${encodeURIComponent(projectId)}&history=1`);
    if(!response.ok)throw Error('任务状态暂时无法核对');
    return response.json();
  },
};
export function CanvasImageBatch({ visible, userId, projectId, elements, onClose, onInsert, onWriteOutputs, services=batchServices }: {
  visible: boolean; userId?: string; projectId?: string | null; elements: CanvasElement[];
  onClose: () => void; onInsert: (item: GenerationHistoryItem) => Promise<void>;
  onWriteOutputs?:(batch:ImageBatchRecord)=>void;
  services?:ImageBatchServices;
}) {
  const key = `${userId || ''}:${projectId || ''}`;
  const [record, setRecord] = useState<ImageBatchRecord | null>(null), [rows, setRows] = useState<ImageBatchRow[]>([]);
  const [tableId, setTableId] = useState(''), [column, setColumn] = useState(0), [model, setModel] = useState<ImageModelId>('gemini-nano-banana-2.1');
  const [dependencyColumn, setDependencyColumn] = useState(-1), [referenceColumn, setReferenceColumn] = useState(-1);
  const [outputColumn,setOutputColumn]=useState(-1);
  const [error, setError] = useState(''), [loaded, setLoaded] = useState(false), [running, setRunning] = useState(false), [preparing, setPreparing] = useState(false);
  const queue = useRef<ImageBatchQueue | null>(null), mounted = useRef(true), lock = useRef(false), insertion = useRef(new Set<string>());
  const ownsRun = useRef(false);
  const queuedControllers = useRef(new Set<AbortController>());
  const tables = elements.filter(element => element.type === 'table-editor');
  const table = tables.find(element => element.id === tableId);
  const hasPendingBatch = rows.some(row => ['queued', 'running', 'unknown'].includes(row.status));
  const selectionLocked = running || preparing || hasPendingBatch;
  const hasRunnable=rows.some(row=>row.status==='queued' && (!row.dependsOn || rows.some(parent=>parent.id===row.dependsOn && parent.status==='succeeded' && parent.result)));
  const attach = (batch: ImageBatchRecord) => {
    const next = new ImageBatchQueue(batch.rows, async updated => {
      await saveImageBatch({ ...batch, rows: updated });
      if (mounted.current) setRows(updated);
    });
    queue.current = next; setRecord(batch); setRows(next.snapshot()); setModel(batch.model); setTableId(batch.generatorId);setColumn(batch.promptColumn ?? 0);setOutputColumn(batch.outputColumn ?? -1);setReferenceColumn(batch.referenceColumn ?? -1);setDependencyColumn(batch.dependencyColumn ?? -1);
  };
  useEffect(() => {
    mounted.current = true;
    const controllers = queuedControllers.current;
    let cancelled = false;
    if (userId && projectId) void readImageBatch(key).then(batch => { if (!cancelled) { if (batch) attach(batch); setLoaded(true); } }).catch(() => { if (!cancelled) setError('批次读取失败，请关闭项目后重试，暂不提交任务。'); });
    return () => { cancelled = true; mounted.current = false; controllers.forEach(controller => controller.abort()); if (ownsRun.current) void queue.current?.cancelUnsubmitted().catch(() => {}); };
    // Parent keys the component by account and project.
  }, [key, userId, projectId]);
  const prepare = async () => {
    if (!table || !userId || !projectId || lock.current || !loaded) return;
    const sourceRows = table.tableRows || [];
    const prompts = sourceRows.map(row => row[column]?.trim()).filter(Boolean);
    if (!prompts.length) { setError('所选列没有可生成的内容。'); return; }
    if (prompts.length > 100) { setError('每批最多 100 行，请拆分表格。'); return; }
    lock.current = true; setPreparing(true); setError('');
    try {
      if(outputColumn>=0 && [column,dependencyColumn,referenceColumn].includes(outputColumn))throw Error('输出列须与提示词、素材和前置行号列分开');
      const ids = sourceRows.map(()=>crypto.randomUUID());
      const planned: ImageBatchRow[] = sourceRows.flatMap((cells,index)=>{
        const prompt = cells[column]?.trim(); if (!prompt) return [];
        const dependency = dependencyColumn >= 0 ? cells[dependencyColumn]?.trim() : '';
        const parent = dependency ? Number(dependency)-1 : -1;
        if (dependency && (!Number.isInteger(parent) || parent<0 || parent>=index || !sourceRows[parent]?.[column]?.trim())) throw Error(`第 ${index+1} 行的前置行必须是前面有提示词的行号`);
        const referenceImage = referenceColumn>=0 ? cells[referenceColumn]?.trim() : undefined;
        if (referenceImage && !/^https:\/\//i.test(referenceImage)) throw Error(`第 ${index+1} 行素材请填写 HTTPS 图片地址`);
        return [{id:ids[index],requestId:crypto.randomUUID(),prompt,status:'queued',credits:0,dependsOn:parent>=0?ids[parent]:undefined,referenceImage:referenceImage || undefined,sourceRowIndex:index,outputBaseline:outputColumn>=0?cells[outputColumn] || '':undefined}];
      });
      const counts = [...new Set(planned.map(row=>Number(Boolean(row.dependsOn))+Number(Boolean(row.referenceImage))))];
      if (counts.some(count=>count>0) && !models.find(item=>item.id===model)?.supportsReferences) throw Error('此模型不支持参考图片，请更换模型');
      const quotes = new Map<number, ImagePriceQuote>();
      for (const referenceCount of counts) {
      quotes.set(referenceCount,await services.quote(model,'1K',referenceCount));
      }
      if (!mounted.current) return;
      const versions = new Set([...quotes.values()].map(quote=>quote.priceVersion));
      if (versions.size !== 1) throw Error('核算期间价格发生变化，请重新核算');
      const batch: ImageBatchRecord = { key, generatorId: table.id, model, resolution: '1K',promptColumn:column,outputColumn:outputColumn>=0?outputColumn:undefined,referenceColumn,dependencyColumn,tableColumns:[...(table.tableColumns || [])], priceVersion: [...quotes.values()][0].priceVersion, rows: planned.map(row=>({...row,credits:quotes.get(Number(Boolean(row.dependsOn))+Number(Boolean(row.referenceImage)))!.credits})) };
      await withImageBatchLock(key, async () => {
        const latest = await readImageBatch(key);
        if (latest?.rows.some(row => ['queued', 'running', 'unknown'].includes(row.status))) throw Error('已有未完成批次，请先处理或取消等待项。');
        await saveImageBatch(batch); if (mounted.current) attach(batch);
      });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '批次准备失败'); }
    finally { lock.current = false; if (mounted.current) setPreparing(false); }
  };
  const run = async () => {
    if (!queue.current || !record || !projectId || !userId || lock.current) return;
    lock.current = true; setRunning(true); setError('');
    try {
      await withImageBatchLock(key, async () => {
      const latest = await readImageBatch(key);
      if (!mounted.current) return;
      if (!latest || JSON.stringify(restoreImageBatch(latest.rows)) !== JSON.stringify(queue.current!.snapshot())) {
        if (latest && mounted.current) attach(latest);
        throw Error('批次状态已变化，已重新载入，请核对后操作。');
      }
      ownsRun.current = true;
      try { await queue.current!.run(async (row, referenceImages) => {
        if (!mounted.current) return { status: 'failed', error: '项目已切换，此项尚未提交，未扣费' };
        const controller = new AbortController(); queuedControllers.current.add(controller);
        try {
        const result = await services.generate({ signal: controller.signal, requestId: row.requestId, projectId, taskSource: 'table', generatorId: record.generatorId, prompt: row.prompt, referenceImages, modelVariant: record.model, resolution: record.resolution, aspectRatio: 'auto', expectedPrice: { credits: row.credits, priceVersion: record.priceVersion } });
        return result.imageData ? { status: 'succeeded', result: result.imageData } : { status: 'unknown', error: result.textResponse || '结果待核对' };
        } catch (reason) {
          if (reason instanceof ImageGenerationRequestError && reason.code === 'IMAGE_NOT_SUBMITTED') return {status:'cancelled',error:reason.message};
          if (reason instanceof ImageGenerationRequestError && reason.code === 'IMAGE_PRICE_CHANGED') return { status: 'failed', error: reason.message };
          if (reason instanceof ImageGenerationRequestError && reason.code !== 'IMAGE_UPSTREAM_OUTCOME_UNKNOWN' && (reason.code === 'IMAGE_GENERATION_FAILED' || reason.outcome === 'failed') && ['not_charged', 'refunded'].includes(reason.billingState || '')) return { status: 'failed', error: `${reason.message}（${reason.billingState === 'refunded' ? '已退款' : '未扣费'}）` };
          throw reason;
        } finally { queuedControllers.current.delete(controller); }
      }, 2); } finally { ownsRun.current = false; }
      });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '批次运行中断'); }
    finally { lock.current = false; if (mounted.current) setRunning(false); }
  };
  const mutateLatest = async (action: (queue: ImageBatchQueue) => Promise<void>) => {
    await withImageBatchLock(key, async () => {
      const latest = await readImageBatch(key);
      if (!latest || !mounted.current) throw Error('批次不可用');
      attach(latest);
      await action(queue.current!);
    });
  };
  const cancel = async () => {
    try {
      if (ownsRun.current) { queuedControllers.current.forEach(controller => controller.abort()); await queue.current?.cancelUnsubmitted(); }
      else await mutateLatest(current => current.cancelUnsubmitted());
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '取消失败'); }
  };
  const retry = async () => {
    if (lock.current) return;
    lock.current = true; setPreparing(true); setError('');
    try {
      await withImageBatchLock(key, async () => {
        const latest = await readImageBatch(key);
        if (!latest || !mounted.current) throw Error('批次不可用');
        const quotes = new Map<number,ImagePriceQuote>();
        for (const referenceCount of new Set(latest.rows.filter(row=>row.status==='failed' || row.status==='queued').map(row=>Number(Boolean(row.dependsOn))+Number(Boolean(row.referenceImage))))) {
        quotes.set(referenceCount,await services.quote(latest.model,latest.resolution,referenceCount));
        }
        if (new Set([...quotes.values()].map(quote=>quote.priceVersion)).size !== 1) throw Error('价格发生变化，请重新核算');
        const creditsFor = (row:ImageBatchRow)=>quotes.get(Number(Boolean(row.dependsOn))+Number(Boolean(row.referenceImage)))!.credits;
        const updated: ImageBatchRecord = { ...latest, priceVersion: [...quotes.values()][0].priceVersion, rows: restoreImageBatch(latest.rows).map(row => row.status === 'failed' ? { ...row, status: 'queued', requestId: crypto.randomUUID(), credits: creditsFor(row), error: undefined } : row.status === 'queued' ? { ...row, credits: creditsFor(row) } : row) };
        await saveImageBatch(updated); if (mounted.current) attach(updated);
      });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '重试报价失败'); }
    finally { lock.current = false; if (mounted.current) setPreparing(false); }
  };
  const verify = async () => {
    if (!queue.current || !projectId || lock.current) return;
    lock.current = true; setPreparing(true); setError('');
    try {
      await mutateLatest(async current => {
      const ledger = await services.ledger(projectId);
      for (const row of current.snapshot().filter(item => item.status === 'unknown')) {
        const remote = ledger.find(item => item.request_id === row.requestId);
        if (remote?.status === 'failed' && ['not_charged', 'refunded'].includes(remote.meta?.billingState || '')) await current.reconcile(row.requestId, { status: 'failed', error: '已确认失败，未扣费或已退款' });
        else if (remote?.status === 'succeeded') {
          const result = elements.find(element => containsImageResult(element,row.requestId));
          const content = result ? imageResultContent(result,row.requestId) : undefined;
          if (content) await current.reconcile(row.requestId, { status: 'succeeded', result: content });
        }
      }
      });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '核对失败'); }
    finally { lock.current = false; if (mounted.current) setPreparing(false); }
  };
  const insert = async (row: ImageBatchRow) => {
    if (!row.result || insertion.current.has(row.id) || elements.some(element => containsImageResult(element,row.requestId))) return;
    insertion.current.add(row.id);
    try { await onInsert({ id: row.requestId, kind: 'image', content: row.result, prompt: row.prompt, model: record?.model, createdAt: new Date().toISOString(), origin:{ownerId:userId,projectId:projectId || undefined,nodeId:row.requestId,sourceNodeId:record?.generatorId}, metadata: { recoveryRequestId: row.requestId, generatorElementId: record?.generatorId } }); }
    catch { setError('放入画布失败，请重试。'); }
    finally { insertion.current.delete(row.id); }
  };
  return <section hidden={!visible} style={!visible ? { display: 'none' } : undefined} aria-label="表格批量生图" className="absolute right-4 top-20 bottom-4 z-[65] flex w-[min(520px,calc(100vw-32px))] flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-slate-950">
    <header className="mb-4 flex justify-between"><h2 className="text-sm font-semibold">表格批量生图</h2><button type="button" aria-label="关闭批量生图" onClick={onClose}><X size={18} /></button></header>
    <div className="space-y-2 text-xs"><p>选择提示词列，每行生成一张 1K 图片；最多同时生成两张。</p><select aria-label="来源表格" disabled={selectionLocked} value={tableId} onChange={event => { setTableId(event.target.value); setColumn(0);setReferenceColumn(-1);setDependencyColumn(-1);setOutputColumn(-1); }} className="w-full rounded border p-2 dark:bg-slate-900"><option value="">选择画布中的表格</option>{tables.map((item, index) => <option key={item.id} value={item.id}>表格 {index + 1} · {item.tableRows?.length || 0} 行</option>)}</select>
      {table && <select aria-label="提示词列" value={column} disabled={selectionLocked} onChange={event => setColumn(Number(event.target.value))} className="w-full rounded border p-2 dark:bg-slate-900">{table.tableColumns?.map((name, index) => <option key={index} value={index}>{name || `第 ${index + 1} 列`}</option>)}</select>}
      {table && <>{([{label:'素材地址列',value:referenceColumn,set:setReferenceColumn},{label:'前置行号列',value:dependencyColumn,set:setDependencyColumn},{label:'结果输出列',value:outputColumn,set:setOutputColumn}]).map(field=><label key={field.label} className="block">{field.label}<select aria-label={field.label} disabled={selectionLocked} value={field.value} onChange={event=>field.set(Number(event.target.value))} className="w-full rounded border p-2 dark:bg-slate-900"><option value={-1}>不使用</option>{table.tableColumns?.map((name,index)=><option key={index} value={index}>{name || `第 ${index+1} 列`}</option>)}</select></label>)}<p>前置行号从 1 开始；仅在前置行成功后使用其图片继续生成。失败或待核对时下游等待。</p></>}
      <select aria-label="批量生图模型" disabled={selectionLocked} value={model} onChange={event => setModel(event.target.value as ImageModelId)} className="w-full rounded border p-2 dark:bg-slate-900">{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <button type="button" disabled={!loaded || !table || running || preparing || rows.some(row => ['queued', 'running', 'unknown'].includes(row.status))} onClick={() => void prepare()} className="rounded border px-3 py-2 disabled:opacity-40">核算新批次费用</button>
    </div>
    {record && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">当前批次：{models.find(item => item.id === record.model)?.label || record.model} · {record.resolution} · {rows.length} 行。按下方已核算的描述生成；修改表格不会改变本批次。</p>}
    {record && record.outputColumn!==undefined && onWriteOutputs && <button type="button" disabled={running || preparing || !rows.some(row=>row.status==='succeeded')} className="mt-2 text-xs text-sky-600 disabled:opacity-40" onClick={()=>{try{onWriteOutputs({...record,rows});setError('');}catch(reason){setError(reason instanceof Error?reason.message:'写回表格失败');}}}>将成功图片写入输出列</button>}
    {error && <p role="alert" className="my-2 text-xs text-amber-600">{error}</p>}
    {(!userId || !projectId) && <p className="my-2 text-xs text-amber-600">请先登录并保存项目，再核算批次费用。</p>}
    {!tables.length && <p className="my-2 text-xs text-gray-500">请先在画布添加表格，并填写每行的图片描述。</p>}
    <div className="my-3 flex-1 space-y-2 overflow-auto">{rows.map((row,index)=>{
      const parent=rows.find(item=>item.id===row.dependsOn);
      const inserted=elements.some(element=>containsImageResult(element,row.requestId));
      return <article key={row.id} className="rounded-lg border p-2 text-xs dark:border-white/10">
        <p className="line-clamp-2">{(row.sourceRowIndex ?? index)+1}. {row.prompt}</p>
        {parent && <p className="text-gray-500">依赖第 {(parent.sourceRowIndex ?? rows.indexOf(parent))+1} 行{row.status==='queued' && parent.status!=='succeeded'?' · 等待前置成功，尚未提交':''}</p>}
        <p className="my-1 text-gray-500">{labels[row.status]} · {row.credits} 积分</p>
        {row.error && <p className="text-amber-600">{row.error}</p>}
        {row.status==='succeeded' && <button type="button" onClick={()=>void insert(row)} disabled={inserted}>{inserted?'已在画布中':'放入画布'}</button>}
      </article>;
    })}</div>
    <div className="space-y-2 text-xs"><p>待提交 {rows.filter(row => row.status === 'queued').length} 张 · 合计 {imageBatchQuote(rows)} 积分</p><div className="flex flex-wrap gap-2"><button type="button" disabled={running || preparing || !hasRunnable} onClick={() => void run()} className="rounded-lg bg-sky-600 px-3 py-2 text-white disabled:opacity-40">确认费用并开始</button><button type="button" disabled={!rows.some(row => row.status === 'queued')} onClick={() => void cancel()}>取消未提交项</button><button type="button" disabled={running || preparing} onClick={() => void verify()}>核对待确认结果</button><button type="button" disabled={running || preparing || !rows.some(row => row.status === 'failed')} onClick={() => void retry()}>准备重试失败项</button></div><p className="text-gray-500">关闭面板不取消任务；离开项目将停止未提交项。待核对项不会自动重试。</p></div>
  </section>;
}
