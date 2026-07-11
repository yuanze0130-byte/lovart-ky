"use client";

/* eslint-disable @next/next/no-img-element -- Canvas nodes render user-provided data URLs. */
import { Eraser, Loader2, Paintbrush, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';

interface InpaintNodeProps {
  sourceImage?: string;
  width: number;
  height: number;
  prompt: string;
  brushSize: number;
  feather: number;
  mask?: string;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onGenerate?: (input: { image: string; mask: string; prompt: string }) => Promise<void>;
}

export function InpaintNode({ sourceImage, width, height, prompt, brushSize, feather, mask, onConfigChange, onGenerate }: InpaintNodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'paint' | 'erase'>('paint');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    const previous = document.createElement('canvas');
    previous.width = canvas.width || nextWidth;
    previous.height = canvas.height || nextHeight;
    previous.getContext('2d')?.drawImage(canvas, 0, 0);
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.getContext('2d')?.drawImage(previous, 0, 0, nextWidth, nextHeight);
  }, [height, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!mask) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = mask;
  }, [height, mask, width]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawTo = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const last = lastPointRef.current;
    if (!canvas || !last) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    context.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
    context.strokeStyle = 'rgba(255,255,255,0.78)';
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
    lastPointRef.current = point;
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    onConfigChange({ inpaintMask: undefined });
  };

  const persistMask = () => {
    const canvas = canvasRef.current;
    onConfigChange({ inpaintMask: canvas?.toDataURL('image/png') });
  };

  const createMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext('2d');
    if (!context) return '';
    context.fillStyle = '#000000';
    context.fillRect(0, 0, output.width, output.height);
    context.save();
    context.filter = feather > 0 ? `blur(${feather}px)` : 'none';
    context.drawImage(canvas, 0, 0);
    context.restore();
    return output.toDataURL('image/png');
  };

  const handleGenerate = async () => {
    if (!sourceImage || !prompt.trim() || !onGenerate) return;
    setIsGenerating(true);
    try {
      await onGenerate({ image: sourceImage, mask: createMask(), prompt: prompt.trim() });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-rose-300/40 bg-slate-950 text-white">
      {sourceImage ? (
        <img src={sourceImage} alt="局部重绘原图" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white/55">连接一张原图开始绘制蒙版</div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
        onPointerDown={(event) => {
          event.stopPropagation();
          drawingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          lastPointRef.current = pointFromEvent(event);
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          event.stopPropagation();
          const point = pointFromEvent(event);
          if (point) drawTo(point);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          drawingRef.current = false;
          lastPointRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          persistMask();
        }}
      />
      <div onMouseDown={(event) => event.stopPropagation()} className="absolute inset-x-3 top-3 z-20 flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/72 p-2 backdrop-blur-md">
        <button type="button" onClick={() => setMode('paint')} className={`flex h-8 w-8 items-center justify-center rounded-lg ${mode === 'paint' ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10'}`} title="画笔"><Paintbrush size={15} /></button>
        <button type="button" onClick={() => setMode('erase')} className={`flex h-8 w-8 items-center justify-center rounded-lg ${mode === 'erase' ? 'bg-white text-black' : 'text-white/75 hover:bg-white/10'}`} title="擦除"><Eraser size={15} /></button>
        <button type="button" onClick={clearMask} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/75 hover:bg-white/10" title="清空蒙版"><RotateCcw size={15} /></button>
        <label className="ml-1 flex min-w-0 flex-1 items-center gap-2 text-[10px] text-white/65">
          笔刷
          <input type="range" min="8" max="120" value={brushSize} onChange={(event) => onConfigChange({ inpaintBrushSize: Number(event.target.value) })} className="min-w-0 flex-1 accent-white" />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-white/65">
          羽化
          <input type="range" min="0" max="20" value={feather} onChange={(event) => onConfigChange({ inpaintFeather: Number(event.target.value) })} className="min-w-0 flex-1 accent-white" />
        </label>
      </div>
      <div onMouseDown={(event) => event.stopPropagation()} className="absolute inset-x-3 bottom-3 z-20 flex gap-2 rounded-xl border border-white/15 bg-slate-950/78 p-2 backdrop-blur-md">
        <input
          value={prompt}
          onChange={(event) => onConfigChange({ prompt: event.target.value })}
          placeholder="描述蒙版区域要变成什么"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs text-white outline-none placeholder:text-white/45 focus:border-rose-300/50"
        />
        <button type="button" onClick={() => void handleGenerate()} disabled={!sourceImage || !prompt.trim() || isGenerating} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45">
          {isGenerating && <Loader2 size={13} className="animate-spin" />}
          重绘
        </button>
      </div>
    </div>
  );
}
