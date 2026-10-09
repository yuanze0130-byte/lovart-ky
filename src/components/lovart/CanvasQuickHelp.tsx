"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';
import { IMAGE_MODEL_OPTIONS, type ImageModelResolution } from '@/lib/image-models';
import { quoteImageCredits } from '@/lib/image-pricing';

const RESOLUTIONS: ImageModelResolution[] = ['1K', '2K', '4K'];
const IMAGE_PRICES = IMAGE_MODEL_OPTIONS.map((model) => ({
  id: model.id,
  label: model.label,
  prices: Object.fromEntries(RESOLUTIONS.map((resolution) => {
    const upstreamModel = model.upstreamModels[resolution];
    return [resolution, upstreamModel
      ? quoteImageCredits({ modelId: model.id, upstreamModel, resolution }).credits
      : null];
  })) as Record<ImageModelResolution, number | null>,
}));

const SHORTCUTS = [
  { label: '缩放画布', keys: '鼠标滚轮 / 右下角 −、＋' },
  { label: '移动画布', keys: '选择工具下拖动空白处 / 鼠标中键拖动' },
  { label: '添加节点', keys: '双击画布空白处' },
  { label: '多选节点', keys: 'Shift / Ctrl / ⌘ + 点击' },
  { label: '删除选中节点', keys: 'Delete / Backspace' },
  { label: '复制选中节点', keys: 'Ctrl / ⌘ + C' },
  { label: '粘贴节点', keys: 'Ctrl / ⌘ + V' },
  { label: '撤销', keys: 'Ctrl / ⌘ + Z' },
  { label: '重做', keys: 'Ctrl + Y / ⌘ + Shift + Z' },
  { label: '保存项目', keys: 'Ctrl / ⌘ + S' },
];

export function CanvasQuickHelp() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-white/10" />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-sky-200"
        aria-label="查看生图报价和画布快捷键"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="生图报价与快捷键"
      >
        <CircleHelp size={17} />
      </button>

      {open ? createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[3px] sm:p-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="canvas-quick-help-title"
            className="flex max-h-[min(86vh,860px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10 sm:px-7">
              <div>
                <h2 id="canvas-quick-help-title" className="text-lg font-semibold text-gray-900 dark:text-white">生图报价与画布快捷键</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">积分按每张图片计算；多张生成按数量累加。</p>
              </div>
              <button ref={closeButtonRef} type="button" onClick={close} aria-label="关闭帮助" className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="grid min-h-0 gap-6 overflow-y-auto p-5 sm:p-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]">
              <div className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">生图模型报价 <span className="font-normal text-gray-500 dark:text-slate-400">积分 / 张</span></h3>
                <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-white/10">
                  <table className="w-full min-w-[430px] text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-slate-400">
                      <tr><th scope="col" className="px-3 py-3 font-medium">模型</th>{RESOLUTIONS.map((resolution) => <th key={resolution} scope="col" className="px-3 py-3 text-center font-medium">{resolution}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                      {IMAGE_PRICES.map((model) => (
                        <tr key={model.id} className="text-gray-700 dark:text-slate-200">
                          <th scope="row" className="px-3 py-2.5 font-medium">{model.label}</th>
                          {RESOLUTIONS.map((resolution) => <td key={resolution} className="px-3 py-2.5 text-center tabular-nums">{model.prices[resolution] ?? '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">“—”表示当前不提供该分辨率。提交前，生成面板会再次显示本次实际积分价。</p>
              </div>

              <div className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">快捷键与常用操作</h3>
                <div className="space-y-1 rounded-2xl border border-gray-200 p-2 dark:border-white/10">
                  {SHORTCUTS.map((shortcut) => (
                    <div key={shortcut.label} className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 text-xs hover:bg-gray-50 dark:hover:bg-white/5">
                      <span className="shrink-0 text-gray-700 dark:text-slate-200">{shortcut.label}</span>
                      <span className="text-right font-medium text-gray-500 dark:text-slate-400">{shortcut.keys}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-slate-400">Ctrl 适用于 Windows；⌘ 适用于 Mac。输入框内的复制、粘贴与撤销由输入框处理。</p>
              </div>
            </div>
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}
