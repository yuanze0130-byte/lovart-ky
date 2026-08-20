"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ChevronRight,
  Columns2,
  FileText,
  Film,
  Globe2,
  ImagePlus,
  Library,
  Paintbrush,
  Pencil,
  PersonStanding,
  ScanSearch,
  Sparkles,
  Table2,
  Type,
  Upload,
  Video,
} from 'lucide-react';

export type CanvasQuickCreateAction =
  | 'text'
  | 'draw'
  | 'image-generator'
  | 'video-generator'
  | 'image-compare'
  | 'global-view'
  | 'motion-transfer'
  | 'table-editor'
  | 'video-frames'
  | 'video-breakdown'
  | 'script-writer'
  | 'inpaint'
  | 'agent'
  | 'rhai-library';

interface CanvasNodeCreateMenuProps {
  left: number;
  top: number;
  hasReferenceSource: boolean;
  onSelect: (action: CanvasQuickCreateAction) => void;
  onUploadImages: (files: File[]) => void;
  onClose: () => void;
}

interface MenuAction {
  action: CanvasQuickCreateAction;
  label: string;
  description?: string;
  icon: React.ReactNode;
}

const PRIMARY_ACTIONS: MenuAction[] = [
  { action: 'text', label: '文本', description: '编写脚本、文案与提示词', icon: <Type size={21} /> },
  { action: 'image-generator', label: '图像生成', description: '生成图片或使用参考图编辑', icon: <Sparkles size={21} /> },
  { action: 'table-editor', label: '分镜表', description: '整理镜头与结构化内容', icon: <Table2 size={21} /> },
  { action: 'draw', label: '绘画', description: '切换到画笔工具', icon: <Pencil size={21} /> },
  { action: 'rhai-library', label: '自定义常用', description: '打开工作流与常用应用库', icon: <Library size={21} /> },
];

const MORE_ACTIONS: MenuAction[] = [
  { action: 'video-generator', label: '视频生成', icon: <Video size={21} /> },
  { action: 'image-compare', label: '图片对比', icon: <Columns2 size={21} /> },
  { action: 'global-view', label: '全局视角', icon: <Globe2 size={21} /> },
  { action: 'motion-transfer', label: '动作迁移', icon: <PersonStanding size={21} /> },
  { action: 'video-frames', label: '视频抽帧', icon: <Film size={21} /> },
  { action: 'video-breakdown', label: '视频拆解', icon: <ScanSearch size={21} /> },
  { action: 'script-writer', label: '剧本创作', icon: <FileText size={21} /> },
  { action: 'inpaint', label: '局部重绘', icon: <Paintbrush size={21} /> },
  { action: 'agent', label: 'Agent', icon: <Bot size={21} /> },
];

export function CanvasNodeCreateMenu({
  left,
  top,
  hasReferenceSource,
  onSelect,
  onUploadImages,
  onClose,
}: CanvasNodeCreateMenuProps) {
  const [showMore, setShowMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const renderAction = (item: MenuAction) => (
    <button
      key={item.action}
      type="button"
      role="menuitem"
      onClick={() => onSelect(item.action)}
      className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/7 text-slate-200 transition-colors group-hover:bg-white/12 group-hover:text-white">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-5">{item.label}</span>
        {item.description && <span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span>}
      </span>
    </button>
  );

  return (
    <div
      data-canvas-create-menu="true"
      role="menu"
      aria-label="创建画布节点"
      className="absolute z-[220] max-h-[calc(100vh-80px)] w-[320px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[22px] border border-white/10 bg-[#202124]/98 p-2.5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {hasReferenceSource && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/8 px-3 py-2 text-xs text-emerald-300">
          <ImagePlus size={15} />
          <span>已带入参考图，创建兼容节点后将自动连线</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) onUploadImages(files);
          event.target.value = '';
        }}
      />

      <button
        type="button"
        role="menuitem"
        onClick={() => inputRef.current?.click()}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/7 text-slate-200 group-hover:bg-white/12 group-hover:text-white">
          <Upload size={21} />
        </span>
        <span className="text-[15px] font-medium">上传图片</span>
      </button>

      {PRIMARY_ACTIONS.map(renderAction)}

      <button
        type="button"
        role="menuitem"
        aria-expanded={showMore}
        onClick={() => setShowMore((current) => !current)}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/7 text-slate-200 group-hover:bg-white/12 group-hover:text-white">
          <ChevronRight size={21} className={`transition-transform ${showMore ? 'rotate-90' : ''}`} />
        </span>
        <span className="flex-1 text-[15px] font-medium">{showMore ? '收起更多选项' : '显示更多选项'}</span>
      </button>

      {showMore && (
        <div className="mt-1 border-t border-white/10 pt-1">
          {MORE_ACTIONS.map(renderAction)}
        </div>
      )}
    </div>
  );
}
