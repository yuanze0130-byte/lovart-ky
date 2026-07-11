"use client";

/* eslint-disable @next/next/no-img-element -- Canvas comparison uses user-provided data URLs. */
import { ArrowLeftRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CanvasElement } from './CanvasArea';

interface ImageCompareNodeProps {
  firstImage?: string;
  secondImage?: string;
  split: number;
  swapped: boolean;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = source;
  });
}

export function ImageCompareNode({ firstImage, secondImage, split, swapped, onConfigChange }: ImageCompareNodeProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [first, second] = useMemo(
    () => (swapped ? [secondImage, firstImage] : [firstImage, secondImage]),
    [firstImage, secondImage, swapped]
  );

  const exportSnapshot = async () => {
    if (!first || !second || isExporting) return;
    setIsExporting(true);
    try {
      const [firstSource, secondSource] = await Promise.all([loadImage(first), loadImage(second)]);
      const width = Math.max(firstSource.naturalWidth, secondSource.naturalWidth);
      const height = Math.max(firstSource.naturalHeight, secondSource.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      const drawContained = (image: HTMLImageElement) => {
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      };
      context.fillStyle = '#020617';
      context.fillRect(0, 0, width, height);
      drawContained(secondSource);
      context.save();
      context.beginPath();
      context.rect(0, 0, width * (split / 100), height);
      context.clip();
      drawContained(firstSource);
      context.restore();
      context.fillStyle = 'rgba(255,255,255,0.95)';
      context.fillRect(Math.max(0, width * (split / 100) - 1), 0, 2, height);
      const anchor = document.createElement('a');
      anchor.href = canvas.toDataURL('image/png');
      anchor.download = `image-compare-${Date.now()}.png`;
      anchor.click();
    } catch (error) {
      alert(error instanceof Error ? error.message : '导出对比图失败');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-slate-950 text-white">
      {second ? (
        <img src={second} alt="图片 B" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/55">连接第二张图片</div>
      )}
      {first && (
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `polygon(0 0, ${split}% 0, ${split}% 100%, 0 100%)` }}>
          <img src={first} alt="图片 A" className="h-full w-full object-contain" draggable={false} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `calc(${split}% - 1px)` }}>
        <div className="h-full w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.3),0_0_16px_rgba(255,255,255,0.7)]" />
        <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-slate-950/75 shadow-lg">
          <ArrowLeftRight size={14} />
        </div>
      </div>
      <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
        <span className="rounded-full bg-black/45 px-2.5 py-1 backdrop-blur-sm">A</span>
        <span className="rounded-full bg-black/45 px-2.5 py-1 backdrop-blur-sm">B</span>
      </div>
      <div onMouseDown={(event) => event.stopPropagation()} className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 backdrop-blur-md">
        <input
          aria-label="对比滑杆"
          type="range"
          min="0"
          max="100"
          value={split}
          onChange={(event) => onConfigChange({ imageCompareSplit: Number(event.target.value) })}
          className="min-w-0 flex-1 accent-white"
        />
        <span className="w-10 text-right text-[10px] text-white/75">{split}%</span>
        <button
          type="button"
          onClick={() => onConfigChange({ imageCompareSwapped: !swapped })}
          className="rounded-lg border border-white/15 px-2 py-1 text-[10px] text-white/80 transition hover:bg-white/10"
          title="交换 A/B 图片"
        >
          交换
        </button>
        <button
          type="button"
          onClick={() => void exportSnapshot()}
          disabled={!first || !second || isExporting}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          title="导出对比快照"
        >
          <Download size={13} />
        </button>
      </div>
    </div>
  );
}
