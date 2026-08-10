"use client";

import { Camera, Grid2X2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasElement } from './CanvasArea';

interface GlobalViewNodeProps {
  sourceImage?: string;
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  onConfigChange: (updates: Partial<CanvasElement>) => void;
  onCapture?: (images: Array<{ content: string; label: string }>) => void;
}

type ViewState = Pick<GlobalViewNodeProps, 'zoom' | 'offsetX' | 'offsetY' | 'rotation'>;

function loadImage(source: string, anonymous = true) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (anonymous) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = source;
  });
}

function drawView(canvas: HTMLCanvasElement, image: HTMLImageElement, state: ViewState) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const width = canvas.width;
  const height = canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#575b61';
  context.fillRect(0, 0, width, height);

  const radians = (state.rotation * Math.PI) / 180;
  const fit = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const scale = fit * state.zoom;
  const horizontalPerspective = Math.max(0.68, Math.cos(radians) * 0.3 + 0.7);
  const shear = Math.sin(radians) * 0.22;

  context.save();
  context.translate(
    width / 2 + state.offsetX * width,
    height / 2 + state.offsetY * height,
  );
  context.transform(horizontalPerspective, 0, shear, 1, 0, 0);
  context.scale(scale, scale);
  context.shadowColor = 'rgba(0,0,0,0.35)';
  context.shadowBlur = 28 / Math.max(scale, 0.01);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

export function GlobalViewNode({
  sourceImage,
  width,
  height,
  zoom,
  offsetX,
  offsetY,
  rotation,
  onConfigChange,
  onCapture,
}: GlobalViewNodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewStateRef = useRef<ViewState>({ zoom, offsetX, offsetY, rotation });
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  viewStateRef.current = { zoom, offsetX, offsetY, rotation };

  const renderPreview = useCallback((state: ViewState) => {
    if (!canvasRef.current || !imageRef.current) return;
    drawView(canvasRef.current, imageRef.current, state);
  }, []);

  useEffect(() => {
    imageRef.current = null;
    setLoadError(null);
    if (!sourceImage) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (canvas && context) {
        context.fillStyle = '#575b61';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let cancelled = false;
    void loadImage(sourceImage)
      .catch(() => loadImage(sourceImage, false))
      .then((image) => {
        if (cancelled) return;
        imageRef.current = image;
        renderPreview(viewStateRef.current);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '图片加载失败');
      });
    return () => { cancelled = true; };
  }, [renderPreview, sourceImage]);

  useEffect(() => {
    renderPreview({ zoom, offsetX, offsetY, rotation });
  }, [offsetX, offsetY, renderPreview, rotation, zoom]);

  const createCapture = useCallback((state: ViewState) => {
    if (!imageRef.current) throw new Error('请先连接参考图');
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    drawView(canvas, imageRef.current, state);
    try {
      return canvas.toDataURL('image/png');
    } catch {
      throw new Error('该图片不允许跨域取景，请先将图片保存到画布资产后重试');
    }
  }, []);

  const captureCurrent = async () => {
    if (!onCapture || isCapturing) return;
    setIsCapturing(true);
    try {
      onCapture([{ content: createCapture({ zoom, offsetX, offsetY, rotation }), label: '全局视角' }]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '取景失败');
    } finally {
      setIsCapturing(false);
    }
  };

  const captureGrid = async () => {
    if (!onCapture || isCapturing) return;
    setIsCapturing(true);
    try {
      const rotations = [-30, -10, 10, 30];
      onCapture(rotations.map((nextRotation, index) => ({
        content: createCapture({
          zoom: Math.max(1.08, zoom),
          offsetX: offsetX + (index - 1.5) * 0.055,
          offsetY,
          rotation: nextRotation,
        }),
        label: `全景角${index + 1}`,
      })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '角度图生成失败');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1d1d20] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <div className="text-xs font-semibold">全局视角</div>
          <div className="mt-0.5 text-[10px] text-white/45">拖动移动 · 滚轮缩放 · 滑杆调整角度</div>
        </div>
        <button
          type="button"
          title="重置视角"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => onConfigChange({ globalViewZoom: 1, globalViewOffsetX: 0, globalViewOffsetY: 0, globalViewRotation: 0 })}
          className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-[#575b61]"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = { x: event.clientX, y: event.clientY, offsetX, offsetY };
        }}
        onMouseMove={(event) => {
          if (!dragRef.current) return;
          event.stopPropagation();
          onConfigChange({
            globalViewOffsetX: dragRef.current.offsetX + (event.clientX - dragRef.current.x) / Math.max(width, 1),
            globalViewOffsetY: dragRef.current.offsetY + (event.clientY - dragRef.current.y) / Math.max(height, 1),
          });
        }}
        onMouseUp={(event) => { event.stopPropagation(); dragRef.current = null; }}
        onMouseLeave={() => { dragRef.current = null; }}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onConfigChange({ globalViewZoom: Math.min(3, Math.max(0.6, zoom - event.deltaY * 0.0015)) });
        }}
      >
        <canvas ref={canvasRef} width={840} height={520} className="h-full w-full" />
        {!sourceImage && (
          <div className="absolute inset-0 grid place-items-center bg-black/20 px-8 text-center">
            <div>
              <div className="text-sm font-medium">连接画布图片</div>
              <div className="mt-1 text-[11px] leading-5 text-white/55">从图片节点拖出连线，接入左侧“参考图”端口</div>
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-x-3 top-3 rounded-lg border border-red-300/20 bg-red-500/20 px-3 py-2 text-[11px] text-red-50 backdrop-blur">{loadError}</div>
        )}
        {sourceImage && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            <button
              type="button"
              title="截取当前视角"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void captureCurrent()}
              disabled={isCapturing}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75 disabled:opacity-50"
            >
              <Camera size={16} />
            </button>
            <button
              type="button"
              title="生成 4 张角度图"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void captureGrid()}
              disabled={isCapturing}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur hover:bg-black/75 disabled:opacity-50"
            >
              <Grid2X2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-[10px] text-white/55">
        <span className="shrink-0">视角 {Math.round(rotation)}°</span>
        <input
          aria-label="视角角度"
          type="range"
          min="-45"
          max="45"
          value={rotation}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => onConfigChange({ globalViewRotation: Number(event.target.value) })}
          className="min-w-0 flex-1 accent-sky-400"
        />
        <span className="shrink-0">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
