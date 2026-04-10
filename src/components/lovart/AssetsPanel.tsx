'use client';

import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Video, LocateFixed, PlusSquare, PanelRightClose, PanelRightOpen, Wand2, Clapperboard, ArrowUp, ArrowDown, X, Sparkles } from 'lucide-react';
import type { ProjectAsset, StoryboardItem } from '@/hooks/useProjectAssets';

interface AssetsPanelProps {
  assets: ProjectAsset[];
  storyboard: StoryboardItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onInsertAsset: (asset: ProjectAsset) => void;
  onLocateAsset: (asset: ProjectAsset) => void;
  onUseAsImageReference: (asset: ProjectAsset) => void;
  onUseAsVideoReference: (asset: ProjectAsset) => void;
  onAddToStoryboard: (asset: ProjectAsset) => void;
  onLocateStoryboardItem: (item: StoryboardItem) => void;
  onMoveStoryboardItem: (itemId: string, direction: 'up' | 'down') => void;
  onRemoveStoryboardItem: (itemId: string) => void;
  onRenameStoryboardItem: (itemId: string, title: string) => void;
  onUpdateStoryboardBrief: (itemId: string, brief: string) => void;
  onCreateVideoFromStoryboard: (item: StoryboardItem) => void;
  onCreateStoryboardFlow: () => void;
}

export function AssetsPanel({
  assets,
  storyboard,
  collapsed,
  onToggleCollapse,
  onInsertAsset,
  onLocateAsset,
  onUseAsImageReference,
  onUseAsVideoReference,
  onAddToStoryboard,
  onLocateStoryboardItem,
  onMoveStoryboardItem,
  onRemoveStoryboardItem,
  onRenameStoryboardItem,
  onUpdateStoryboardBrief,
  onCreateVideoFromStoryboard,
  onCreateStoryboardFlow,
}: AssetsPanelProps) {
  const [activeTab, setActiveTab] = useState<'assets' | 'storyboard'>('assets');

  const grouped = useMemo(() => ({
    image: assets.filter((asset) => asset.type === 'image'),
    video: assets.filter((asset) => asset.type === 'video'),
  }), [assets]);

  if (collapsed) {
    return (
      <div className="absolute right-4 top-20 z-40">
        <button
          onClick={onToggleCollapse}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors hover:bg-gray-100 dark:border-white/10 dark:bg-black/72 dark:hover:bg-white/8"
          title="展开资产面板"
        >
          <PanelRightOpen size={18} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute right-4 top-20 bottom-4 z-40 w-[340px] rounded-3xl border border-gray-200 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-black/78 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">资产与结果</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">当前项目素材与生成结果</div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-100"
          title="收起资产面板"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-white/10">
        <button
          onClick={() => setActiveTab('assets')}
          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
            activeTab === 'assets'
              ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8'
          }`}
        >
          资产
        </button>
        <button
          onClick={() => setActiveTab('storyboard')}
          className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
            activeTab === 'storyboard'
              ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8'
          }`}
        >
          分镜
        </button>
      </div>

      <div className="h-[calc(100%-108px)] overflow-y-auto px-3 py-3">
        {activeTab === 'assets' ? (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <ImageIcon size={14} />
                图片资产 · {grouped.image.length}
              </div>
              <div className="space-y-2">
                {grouped.image.length > 0 ? grouped.image.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onInsert={onInsertAsset}
                    onLocate={onLocateAsset}
                    onUseAsImageReference={onUseAsImageReference}
                    onUseAsVideoReference={onUseAsVideoReference}
                    onAddToStoryboard={onAddToStoryboard}
                  />
                )) : <EmptyHint text="还没有图片资产" />}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Video size={14} />
                视频资产 · {grouped.video.length}
              </div>
              <div className="space-y-2">
                {grouped.video.length > 0 ? grouped.video.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onInsert={onInsertAsset}
                    onLocate={onLocateAsset}
                    onUseAsImageReference={onUseAsImageReference}
                    onUseAsVideoReference={onUseAsVideoReference}
                    onAddToStoryboard={onAddToStoryboard}
                  />
                )) : <EmptyHint text="还没有视频资产" />}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            {storyboard.length > 0 && (
              <button
                onClick={onCreateStoryboardFlow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gradient-to-r dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500 dark:hover:brightness-110"
              >
                <Sparkles size={15} />
                批量生成镜头流
              </button>
            )}
            {storyboard.length > 0 ? storyboard.map((item, index) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5"
              >
                <button
                  onClick={() => onLocateStoryboardItem(item)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/8"
                >
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-black">
                    {item.type === 'image' ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <video src={item.thumbnailUrl} className="h-full w-full object-cover" muted playsInline />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <span>镜头 {index + 1}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-white/10 dark:text-gray-300">
                        {item.type === 'image' ? 'Image' : 'Video'}
                      </span>
                    </div>
                    <input
                      value={item.title}
                      onChange={(e) => onRenameStoryboardItem(item.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded-md bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:bg-gray-50 dark:text-gray-100 dark:focus:bg-white/8"
                      placeholder={`Shot ${String(index + 1).padStart(2, '0')}`}
                    />
                    <textarea
                      value={item.sourcePrompt || ''}
                      onChange={(e) => onUpdateStoryboardBrief(item.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-md bg-transparent text-xs text-gray-500 outline-none placeholder:text-gray-400 focus:bg-gray-50 dark:text-gray-400 dark:focus:bg-white/8"
                      placeholder="写这个镜头的 brief：主体动作、镜头运动、风格、节奏、构图…"
                    />
                  </div>
                </button>
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 p-3 dark:border-white/10">
                  <button
                    onClick={() => onCreateVideoFromStoryboard(item)}
                    className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-100 dark:bg-sky-400/14 dark:text-sky-200 dark:hover:bg-sky-400/22"
                  >
                    <Sparkles size={14} />
                    生成视频节点
                  </button>
                  <button
                    onClick={() => onMoveStoryboardItem(item.id, 'up')}
                    disabled={index === 0}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
                  >
                    <ArrowUp size={14} />
                    上移
                  </button>
                  <button
                    onClick={() => onMoveStoryboardItem(item.id, 'down')}
                    disabled={index === storyboard.length - 1}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
                  >
                    <ArrowDown size={14} />
                    下移
                  </button>
                  <button
                    onClick={() => onRemoveStoryboardItem(item.id)}
                    className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    <X size={14} />
                    移除
                  </button>
                </div>
              </div>
            )) : <EmptyHint text="还没有分镜内容" />}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  onInsert,
  onLocate,
  onUseAsImageReference,
  onUseAsVideoReference,
  onAddToStoryboard,
}: {
  asset: ProjectAsset;
  onInsert: (asset: ProjectAsset) => void;
  onLocate: (asset: ProjectAsset) => void;
  onUseAsImageReference: (asset: ProjectAsset) => void;
  onUseAsVideoReference: (asset: ProjectAsset) => void;
  onAddToStoryboard: (asset: ProjectAsset) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <div className="aspect-[16/10] overflow-hidden bg-gray-100 dark:bg-black">
        {asset.type === 'image' ? (
          <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" />
        ) : (
          <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          {asset.type === 'image' ? (
            <ImageIcon size={14} className="text-blue-500 dark:text-sky-300" />
          ) : (
            <Video size={14} className="text-purple-500 dark:text-purple-300" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{asset.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {asset.width && asset.height ? `${Math.round(asset.width)} × ${Math.round(asset.height)}` : asset.type === 'video' ? '视频结果' : '图片结果'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onInsert(asset)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-100 dark:bg-sky-400/14 dark:text-sky-200 dark:hover:bg-sky-400/22"
          >
            <PlusSquare size={14} />
            插入画布
          </button>
          <button
            onClick={() => onLocate(asset)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            title="定位到来源节点"
          >
            <LocateFixed size={14} />
            定位
          </button>
          {asset.type === 'image' && (
            <button
              onClick={() => onUseAsImageReference(asset)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <Wand2 size={14} />
              图像参考
            </button>
          )}
          {asset.type === 'image' && (
            <button
              onClick={() => onUseAsVideoReference(asset)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8"
            >
              <Video size={14} />
              视频参考
            </button>
          )}
          <button
            onClick={() => onAddToStoryboard(asset)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/8 ${asset.type === 'image' ? '' : 'col-span-2'}`}
          >
            <Clapperboard size={14} />
            加入分镜
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
      {text}
    </div>
  );
}
