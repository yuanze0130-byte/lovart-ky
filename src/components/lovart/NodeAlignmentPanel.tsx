'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  X,
} from 'lucide-react';
import type { NodeAlignmentAction } from '@/lib/node-alignment';

interface NodeAlignmentPanelProps {
  selectedCount: number;
  onApply: (action: NodeAlignmentAction) => void;
  onClose: () => void;
}

const BASIC_ACTIONS: Array<{ action: NodeAlignmentAction; label: string; icon: typeof AlignStartVertical }> = [
  { action: 'left', label: '左对齐', icon: AlignStartVertical },
  { action: 'horizontal-center', label: '水平居中', icon: AlignCenterVertical },
  { action: 'right', label: '右对齐', icon: AlignEndVertical },
  { action: 'top', label: '顶对齐', icon: AlignStartHorizontal },
  { action: 'vertical-center', label: '垂直居中', icon: AlignCenterHorizontal },
  { action: 'bottom', label: '底对齐', icon: AlignEndHorizontal },
];

const DISTRIBUTION_ACTIONS: Array<{ action: NodeAlignmentAction; label: string; icon: typeof AlignStartVertical }> = [
  { action: 'distribute-horizontal', label: '水平等间距', icon: AlignHorizontalDistributeCenter },
  { action: 'distribute-vertical', label: '垂直等间距', icon: AlignVerticalDistributeCenter },
  { action: 'distribute-horizontal-top', label: '水平分布 + 顶对齐', icon: AlignHorizontalDistributeCenter },
  { action: 'distribute-horizontal-center', label: '水平分布 + 垂直居中', icon: AlignHorizontalDistributeCenter },
  { action: 'distribute-horizontal-bottom', label: '水平分布 + 底对齐', icon: AlignHorizontalDistributeCenter },
  { action: 'distribute-vertical-left', label: '垂直分布 + 左对齐', icon: AlignVerticalDistributeCenter },
  { action: 'distribute-vertical-center', label: '垂直分布 + 水平居中', icon: AlignVerticalDistributeCenter },
  { action: 'distribute-vertical-right', label: '垂直分布 + 右对齐', icon: AlignVerticalDistributeCenter },
];

export function NodeAlignmentPanel({ selectedCount, onApply, onClose }: NodeAlignmentPanelProps) {
  const renderButton = ({ action, label, icon: Icon }: (typeof BASIC_ACTIONS)[number]) => {
    const disabled = action.startsWith('distribute-') ? selectedCount < 3 : selectedCount < 2;
    return (
    <button
      key={action}
      type="button"
      disabled={disabled}
      onClick={() => onApply(action)}
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      title={disabled ? `请先框选至少 ${action.startsWith('distribute-') ? 3 : 2} 个节点` : label}
    >
      <Icon size={14} className="text-sky-400" />
      <span>{label}</span>
    </button>
    );
  };

  return (
    <aside className="absolute right-4 top-20 z-[145] w-[330px] overflow-hidden rounded-2xl border border-white/12 bg-[#191A1F]/98 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">节点对齐</div>
          <div className="mt-0.5 text-[10px] text-white/45">已选择 {selectedCount} 个节点</div>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-white/55 hover:bg-white/8 hover:text-white" aria-label="关闭节点对齐">
          <X size={15} />
        </button>
      </div>
      <div className="p-3">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">基础对齐</div>
        <div className="grid grid-cols-2 gap-1">{BASIC_ACTIONS.map(renderButton)}</div>
        <div className="my-3 h-px bg-white/10" />
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">分布对齐</div>
        <div className="grid grid-cols-2 gap-1">{DISTRIBUTION_ACTIONS.map(renderButton)}</div>
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-[10px] leading-5 text-white/45">
        Ctrl + 拖动框选 ≥ 2 个节点后可对齐 · 按 Esc 或菜单关闭
      </div>
    </aside>
  );
}
