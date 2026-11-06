'use client';

/* eslint-disable @next/next/no-img-element -- Display the existing canvas asset without proxying signed URLs. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface MediaPreviewAsset {
  source: string;
  kind: 'image' | 'video' | 'audio';
  title: string;
  poster?: string;
  nodeId?: string;
  sourceNodeId?: string;
  prompt?: string;
  model?: string;
  projectLabel?: string;
  originalSource?: string;
  originHref?: string;
  originNodeLabel?: string;
}

export function CanvasMediaPreview({ asset, onClose, onLocate, onReuse }: {
  asset: MediaPreviewAsset; onClose: () => void; onLocate?: (nodeId: string) => void; onReuse?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const locate = (id: string) => { onClose(); onLocate?.(id); };
  return createPortal(<dialog ref={dialog} aria-label="素材预览" onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 m-auto max-h-[92vh] w-[min(1100px,94vw)] max-w-none overflow-auto rounded-2xl border border-white/15 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/75">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><h2 className="truncate text-sm">{asset.title}</h2><button type="button" aria-label="关闭素材预览" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X size={18} /></button></div>
    <div className="flex min-h-48 items-center justify-center p-4">
      {failed ? <p role="alert" className="py-12 text-sm text-amber-200">素材暂时无法加载，请关闭预览并重新打开项目刷新素材地址。</p> : asset.kind === 'image' ? <div className="relative">
        <img src={asset.source} alt={asset.title} onError={() => setFailed(true)} className="max-h-[60vh] max-w-full object-contain" />
        {compare && asset.originalSource && <><img src={asset.originalSource} alt="来源版本" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain" style={{clipPath:`inset(0 ${100-split}% 0 0)`}} /><div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{left:`${split}%`}} /></>}
      </div> : asset.kind === 'video' ? <video src={asset.source} poster={asset.poster} controls playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-[70vh] max-w-full" /> : <audio src={asset.source} controls preload="metadata" onError={() => setFailed(true)} />}
    </div>
    {asset.kind === 'image' && asset.originalSource && <div className="px-4 pb-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={compare} onChange={event=>setCompare(event.target.checked)} />与来源版本对比（左侧来源，右侧当前）</label>{compare && <input aria-label="版本对比分界位置" type="range" min={0} max={100} value={split} onChange={event=>setSplit(Number(event.target.value))} className="mt-3 w-full" />}</div>}
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-t border-white/10 px-4 py-3 text-xs">
      <dt className="text-slate-400">来源项目</dt><dd>{asset.projectLabel || '未记录'}</dd>
      <dt className="text-slate-400">来源节点</dt><dd className="break-all">{asset.originNodeLabel || asset.sourceNodeId || asset.nodeId || '未记录'}</dd>
      <dt className="text-slate-400">模型</dt><dd>{asset.model || '未记录'}</dd>
      <dt className="text-slate-400">提示词</dt><dd className="max-h-28 overflow-auto whitespace-pre-wrap break-words">{asset.prompt || '未记录'}</dd>
    </dl>
    {onReuse && <div className="px-4 pb-3"><button type="button" onClick={onReuse} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-900">再次放入当前画布</button></div>}
    {asset.originHref && <div className="px-4 pb-3"><a href={asset.originHref} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-300 underline">打开来源项目与节点</a></div>}
    {onLocate && (asset.nodeId || asset.sourceNodeId) && <div className="flex flex-wrap justify-end gap-3 border-t border-white/10 p-3 text-xs">
      {asset.sourceNodeId && <button type="button" className="rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10" onClick={() => locate(asset.sourceNodeId!)}>回到来源节点</button>}
      {asset.nodeId && <button type="button" className="rounded-lg bg-white px-3 py-2 text-slate-900" onClick={() => locate(asset.nodeId!)}>定位画布结果</button>}
    </div>}
  </dialog>, document.body);
}
