"use client";

/* eslint-disable @next/next/no-img-element -- History thumbnails are generated data URLs. */
import { ImagePlus, Play, Search, Star, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { deleteGenerationHistoryItem, listGenerationHistoryItems, setGenerationHistoryFavorite, type GenerationHistoryItem } from '@/lib/generation-history';

interface GenerationHistoryPanelProps {
  onClose: () => void;
  onInsert: (item: GenerationHistoryItem) => void;
}

export function GenerationHistoryPanel({ onClose, onInsert }: GenerationHistoryPanelProps) {
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useEffect(() => {
    const load = () => void listGenerationHistoryItems().then(setItems);
    load();
    window.addEventListener('lovart-generation-history-changed', load);
    return () => window.removeEventListener('lovart-generation-history-changed', load);
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (favoritesOnly && !item.favorite) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || `${item.prompt || ''} ${item.model || ''}`.toLowerCase().includes(normalized);
  }), [favoritesOnly, items, kind, query]);

  return (
    <div className="absolute right-4 top-20 bottom-4 z-[65] flex w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/96 shadow-[0_24px_80px_rgba(15,23,42,0.2)] backdrop-blur-xl dark:border-white/10 dark:bg-black/88">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <div><div className="text-sm font-semibold">生成历史</div><div className="text-[11px] text-gray-500">跨项目保存在当前浏览器</div></div>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" title="关闭"><X size={16} /></button>
      </div>
      <div className="space-y-3 border-b border-gray-200 p-3 dark:border-white/10">
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10"><Search size={14} className="text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词或模型" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
        <div className="flex gap-2"><div className="flex min-w-0 flex-1 rounded-lg bg-gray-100 p-1 dark:bg-white/5">{(['all', 'image', 'video'] as const).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={`flex-1 rounded-md py-1.5 text-xs ${kind === value ? 'bg-white font-medium shadow-sm dark:bg-white dark:text-black' : 'text-gray-500'}`}>{value === 'all' ? '全部' : value === 'image' ? '图片' : '视频'}</button>)}</div><button type="button" onClick={() => setFavoritesOnly((value) => !value)} className={`flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs ${favoritesOnly ? 'border-amber-300 bg-amber-50 text-amber-600 dark:bg-amber-400/10' : 'border-gray-200 text-gray-500 dark:border-white/10'}`}><Star size={13} fill={favoritesOnly ? 'currentColor' : 'none'} />收藏</button></div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3">
        {filtered.map((item) => (
          <div key={item.id} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
            <div className="relative aspect-square bg-slate-950">
              {item.kind === 'image' ? (
                <img
                  src={item.thumbnailUrl || item.previewUrl || item.content}
                  alt="历史图片"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              ) : item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt="历史视频封面"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_center,rgba(71,85,105,0.55),rgba(2,6,23,0.96))]" />
              )}
              {item.kind === 'video' && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-xl">
                  <Play size={17} fill="currentColor" className="ml-0.5" />
                </span>
              )}
            </div>
            <div className="p-2"><div className="line-clamp-2 text-[11px] text-gray-700 dark:text-gray-200">{item.prompt || '未记录提示词'}</div><div className="mt-1 truncate text-[10px] text-gray-400">{item.model || item.kind} · {new Date(item.createdAt).toLocaleString()}</div></div>
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
              <button type="button" onClick={() => void setGenerationHistoryFavorite(item.id, !item.favorite)} className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/92 shadow ${item.favorite ? 'text-amber-500' : 'text-gray-500'}`} title={item.favorite ? '取消收藏' : '收藏'}><Star size={14} fill={item.favorite ? 'currentColor' : 'none'} /></button>
              <button type="button" onClick={() => onInsert(item)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/92 text-gray-700 shadow" title="放回画布"><ImagePlus size={14} /></button>
              <button type="button" onClick={() => void deleteGenerationHistoryItem(item.id)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/92 text-red-500 shadow" title="删除"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-2 py-16 text-center text-xs text-gray-400">还没有符合条件的生成记录</div>}
      </div>
    </div>
  );
}
