'use client';

import { ArrowLeftRight, FileText, Film, Music2, Plus, Search, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { CanvasImageMedia } from './CanvasMedia';
import { replaceCanvasAssetReference } from '@/lib/canvas-asset-references';

export type CanvasReferenceAssetKind = 'text' | 'image' | 'video' | 'audio';

export interface CanvasReferenceAsset {
  id: string;
  kind: CanvasReferenceAssetKind;
  label: string;
  content: string;
  previewUrl?: string;
}

const KIND_LABEL: Record<CanvasReferenceAssetKind, string> = {
  text: '文字', image: '图片', video: '视频', audio: '音频',
};

function AssetPreview({ asset }: { asset: CanvasReferenceAsset }) {
  if (asset.kind === 'image') {
    return <CanvasImageMedia source={asset.content} previewUrl={asset.previewUrl} thumbnailUrl={asset.previewUrl} lowDetail />;
  }
  const Icon = asset.kind === 'video' ? Film : asset.kind === 'audio' ? Music2 : FileText;
  return <span className="grid h-full w-full place-items-center bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Icon size={18} /></span>;
}

export function CanvasAssetReferencePicker({ assets, excludedId, acceptedKinds, selectedIds, open, onOpenChange, onChange }: {
  assets: CanvasReferenceAsset[];
  excludedId: string;
  acceptedKinds: CanvasReferenceAssetKind[];
  selectedIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const availableAssets = assets.filter((asset) => asset.id !== excludedId && acceptedKinds.includes(asset.kind));
  const visibleAssets = availableAssets.filter((asset) => (!deferredQuery
    || `${asset.label} ${KIND_LABEL[asset.kind]}`.toLowerCase().includes(deferredQuery)));
  const selectedSet = new Set(selectedIds);
  const availableAssetById = new Map(availableAssets.map((asset) => [asset.id, asset]));
  const selectedAssets = selectedIds.flatMap((id) => {
    const asset = availableAssetById.get(id);
    return asset ? [asset] : [];
  });
  const missingIds = selectedIds.filter((id) => !assets.some((asset) => asset.id === id));
  const replacingAsset = replacingId ? availableAssetById.get(replacingId) : undefined;

  const closePicker = () => {
    setReplacingId(null);
    onOpenChange(false);
  };

  const handleAssetClick = (assetId: string) => {
    if (replacingId) {
      onChange(replaceCanvasAssetReference(selectedIds, replacingId, assetId));
      setReplacingId(null);
      return;
    }
    onChange(selectedSet.has(assetId) ? selectedIds.filter((id) => id !== assetId) : [...selectedIds, assetId]);
  };

  return <div className="absolute right-2 top-2 z-[85]" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    <button type="button" aria-label="快捷引用素材" title="快捷引用素材（也可在输入框输入 @）" onClick={() => open ? closePicker() : onOpenChange(true)} className={`grid h-7 w-7 place-items-center rounded-full border shadow-md backdrop-blur transition ${open || selectedIds.length > 0 ? 'border-violet-300 bg-violet-600 text-white' : 'border-white/40 bg-slate-950/65 text-white opacity-0 group-hover:opacity-100'}`}>
      <Plus size={15} />
    </button>
    {selectedIds.length > 0 && !open ? <span className="absolute -bottom-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">{selectedIds.length}</span> : null}
    {selectedAssets.length > 0 && !open ? <div className="pointer-events-none absolute right-8 top-0 flex max-w-52 justify-end gap-1 overflow-hidden">
      {selectedAssets.slice(0, 2).map((asset) => <span key={asset.id} className="max-w-24 truncate rounded-full border border-violet-200 bg-white/95 px-2 py-1 text-[9px] font-medium text-violet-700 shadow-sm dark:border-violet-400/25 dark:bg-slate-950/95 dark:text-violet-200">@{asset.label}</span>)}
    </div> : null}
    {open ? <div role="dialog" aria-label="选择快捷引用素材" className="absolute right-0 top-9 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-950 dark:text-white">
      <div className="flex items-center gap-2 border-b border-slate-100 p-2 dark:border-white/10">
        <Search size={14} className="text-slate-400" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索画布素材…" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        <button type="button" aria-label="关闭素材选择" onClick={closePicker} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X size={14} /></button>
      </div>
      {replacingAsset ? <div className="flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-3 py-2 text-[10px] text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200">
        <ArrowLeftRight size={12} /><span className="min-w-0 flex-1 truncate">正在替换 @{replacingAsset.label}，请选择新素材</span>
        <button type="button" onClick={() => setReplacingId(null)} className="shrink-0 font-medium hover:text-violet-900 dark:hover:text-white">取消</button>
      </div> : null}
      {selectedAssets.length > 0 ? <div className="border-b border-slate-100 px-2.5 py-2 dark:border-white/10">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
          <span>已选引用</span>
          <button type="button" onClick={() => { setReplacingId(null); onChange([]); }} className="text-violet-600 hover:text-violet-700 dark:text-violet-300">取消全部</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {selectedAssets.map((asset) => <span key={asset.id} className={`inline-flex max-w-full items-center gap-0.5 rounded-full border bg-violet-50 pl-2 text-[10px] text-violet-700 dark:bg-violet-400/10 dark:text-violet-200 ${replacingId === asset.id ? 'border-violet-500 ring-1 ring-violet-300' : 'border-violet-200 dark:border-violet-400/30'}`}>
            <span className="max-w-28 truncate py-1">@{asset.label}</span>
            <button type="button" aria-label={`替换 @${asset.label}`} title={`替换 @${asset.label}`} onClick={() => setReplacingId(asset.id)} className="rounded-full p-1 hover:bg-violet-100 dark:hover:bg-violet-400/20"><ArrowLeftRight size={11} /></button>
            <button type="button" aria-label={`移除 @${asset.label}`} title={`移除 @${asset.label}`} onClick={() => { if (replacingId === asset.id) setReplacingId(null); onChange(selectedIds.filter((id) => id !== asset.id)); }} className="rounded-full p-1 hover:bg-violet-100 dark:hover:bg-violet-400/20"><X size={11} /></button>
          </span>)}
        </div>
      </div> : null}
      <div className="max-h-72 space-y-1 overflow-y-auto p-2">
        {visibleAssets.map((asset) => {
          const selected = selectedSet.has(asset.id);
          return <button key={asset.id} type="button" onClick={() => handleAssetClick(asset.id)} className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left transition ${replacingId === asset.id ? 'border-violet-500 bg-violet-100 dark:border-violet-300 dark:bg-violet-400/20' : selected ? 'border-violet-300 bg-violet-50 dark:border-violet-400/40 dark:bg-violet-400/10' : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'}`}>
            <span className="h-10 w-12 shrink-0 overflow-hidden rounded-lg"><AssetPreview asset={asset} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{asset.label}</span><span className="mt-0.5 block text-[10px] text-slate-400">{KIND_LABEL[asset.kind]}</span></span>
            {replacingId ? <span className="shrink-0 text-[9px] font-medium text-violet-600 dark:text-violet-200">选择替换</span> : <span className={`h-4 w-4 rounded-full border ${selected ? 'border-violet-500 bg-violet-500 shadow-[inset_0_0_0_3px_white]' : 'border-slate-300'}`} />}
          </button>;
        })}
        {visibleAssets.length === 0 ? <div className="px-3 py-8 text-center text-xs text-slate-400">没有可引用的画布素材</div> : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400 dark:border-white/10"><span>已选择 {selectedAssets.length} 项 · 无需连线</span>{missingIds.length > 0 ? <button type="button" onClick={() => onChange(selectedIds.filter((id) => !missingIds.includes(id)))} className="text-amber-600">清理 {missingIds.length} 个失效引用</button> : null}</div>
    </div> : null}
  </div>;
}
