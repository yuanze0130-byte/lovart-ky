'use client';

import { useEffect, useRef, useState } from 'react';
import { Grid3X3, RotateCcw } from 'lucide-react';
import type { CanvasFeatureSettings } from '@/lib/canvas-feature-settings';

interface CanvasFeaturesMenuProps {
  settings: CanvasFeatureSettings;
  onChange: <K extends keyof CanvasFeatureSettings>(key: K, value: CanvasFeatureSettings[K]) => void;
  onReset: () => void;
  onClear: () => void;
}

const FEATURE_BUTTONS: Array<{ key: keyof Pick<CanvasFeatureSettings, 'hideImages' | 'tilt3d' | 'flowAnimation' | 'stopwatch' | 'snap' | 'crosses' | 'follow' | 'marquee' | 'generationAnimation' | 'grid' | 'navigator' | 'groupMode'>; label: string; title: string }> = [
  { key: 'hideImages', label: '隐图', title: '隐藏画布图片内容，只保留节点结构' },
  { key: 'follow', label: '跟随', title: '显示跟随鼠标移动的画布光标光晕' },
  { key: 'tilt3d', label: '3D倾斜', title: '节点悬停时启用 3D 倾斜效果' },
  { key: 'marquee', label: '跑马灯', title: '选中节点显示动态跑马灯边框' },
  { key: 'flowAnimation', label: '流光动画', title: '连线显示流动光效' },
  { key: 'generationAnimation', label: '生成动画', title: '生成器节点显示动态光带' },
  { key: 'stopwatch', label: '秒表', title: '显示本次画布会话计时' },
  { key: 'grid', label: '网格', title: '显示或隐藏点阵网格' },
  { key: 'snap', label: '吸附', title: '移动节点时吸附到当前网格' },
  { key: 'navigator', label: '导航', title: '显示或隐藏画布小地图' },
  { key: 'crosses', label: '叉叉', title: '在节点右上角显示快速删除叉号' },
  { key: 'groupMode', label: '开始组', title: '框选多个节点后自动建立分组' },
];

const SLIDERS: Array<{ key: 'gridGap' | 'gridDotSize' | 'connectorWidth' | 'connectorOpacity'; label: string; min: number; max: number; step: number; suffix: string }> = [
  { key: 'gridGap', label: '网格间隙', min: 8, max: 80, step: 1, suffix: 'px' },
  { key: 'gridDotSize', label: '网格点', min: 0.2, max: 3, step: 0.1, suffix: 'px' },
  { key: 'connectorWidth', label: '连线粗细', min: 1, max: 8, step: 0.5, suffix: 'px' },
  { key: 'connectorOpacity', label: '连线透明', min: 10, max: 100, step: 5, suffix: '%' },
];

export function CanvasFeaturesMenu({ settings, onChange, onReset, onClear }: CanvasFeaturesMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors ${open ? 'bg-gray-900 text-white dark:bg-white dark:text-slate-950' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'}`}
        aria-expanded={open}
        aria-haspopup="menu"
        title="画布功能"
      >
        <Grid3X3 size={15} />
        <span>功能</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[180] w-[250px] overflow-hidden rounded-2xl border border-gray-200 bg-[#191A1F]/98 text-white shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-2xl dark:border-white/12" role="menu">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3">
            {FEATURE_BUTTONS.map((feature) => {
              const enabled = settings[feature.key];
              return (
                <button
                  key={feature.key}
                  type="button"
                  onClick={() => onChange(feature.key, !enabled)}
                  className={`rounded-lg px-2 py-1 text-left text-xs font-medium transition ${enabled ? 'bg-blue-500/16 text-blue-400' : 'text-slate-300 hover:bg-white/7 hover:text-blue-300'}`}
                  title={feature.title}
                  role="menuitemcheckbox"
                  aria-checked={enabled}
                >
                  {feature.label}
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/12 px-3 py-3">
            <div className="space-y-2.5">
              {SLIDERS.map((slider) => (
                <label key={slider.key} className="grid grid-cols-[62px_1fr_38px] items-center gap-2 text-[11px] text-slate-200">
                  <span>{slider.label}</span>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={settings[slider.key]}
                    onChange={(event) => onChange(slider.key, Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-blue-500"
                  />
                  <span className="text-right text-white">{settings[slider.key]}{slider.suffix}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/12 px-3 py-2.5">
            <button type="button" onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/7 hover:text-white" title="恢复默认设置">
              <RotateCcw size={12} />
              默认
            </button>
            <button type="button" onClick={() => { onClear(); setOpen(false); }} className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300">清空</button>
          </div>
        </div>
      )}
    </div>
  );
}
