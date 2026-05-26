"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, RotateCcw, X } from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface AngleConfig {
  rotation: number;  // 水平旋转 0–360°
  tilt: number;      // 倾斜角  -45–90°
  zoom: number;      // 缩放倍率 1.0–10.0
}

const DEFAULT_CONFIG: AngleConfig = {
  rotation: 44,
  tilt: 32,
  zoom: 5,
};

export interface AngleAdjustPanelProps {
  /** 当前画布中被编辑的图片 URL（用于方块顶面预览） */
  imageUrl?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onApply: (config: AngleConfig, promptPatch: string) => void | Promise<void>;
}

// ─────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────
export function buildAnglePromptFromConfig(config: AngleConfig): string {
  const rotationDir =
    config.rotation < 90
      ? "略偏右前方"
      : config.rotation < 180
        ? "右后方"
        : config.rotation < 270
          ? "略偏左后方"
          : "左前方";

  const tiltLabel =
    config.tilt >= 70
      ? "鸟瞰（正上方）"
      : config.tilt >= 45
        ? "高角度俯视"
        : config.tilt >= 20
          ? "中等俯视"
          : config.tilt >= 0
            ? "平视略俯"
            : "仰视";

  return [
    "[可视化角度调整]",
    `水平旋转：${config.rotation}°（朝向 ${rotationDir}）`,
    `俯仰倾斜：${config.tilt}°（${tiltLabel}）`,
    `画面缩放：${config.zoom.toFixed(1)}×`,
    "要求：严格保留主体的身份特征、材质、品牌标志和关键视觉细节，仅重构相机视角、透视关系与可见面，保持高质量输出。",
  ].join("；");
}

// ─────────────────────────────────────────────
// Slider Row  (same visual style as RelightStudioModal)
// ─────────────────────────────────────────────
interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  displayValue: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, min, max, step, value, displayValue, onChange }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="w-8 shrink-0 text-right text-[13px] text-zinc-400">{label}</span>
      <div className="relative flex-1">
        {/* Track */}
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-75"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Native range for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          style={{ zIndex: 2 }}
        />
        {/* Thumb dot */}
        <div
          className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] border-zinc-900 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          style={{ left: `calc(${pct}% - 9px)`, zIndex: 1 }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[13px] font-medium text-zinc-200">{displayValue}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 3D Cube SVG Preview
// ─────────────────────────────────────────────
interface CubePreviewProps {
  config: AngleConfig;
  imageUrl?: string;
}

function CubePreview({ config, imageUrl }: CubePreviewProps) {
  // Convert rotation (0-360°) and tilt (−45 to 90°) to 3D CSS transform
  const rotY = config.rotation;
  const rotX = -config.tilt; // negative = tilt up
  const scale = Math.max(0.5, Math.min(2.0, config.zoom / 5));

  // cube size in px
  const SIZE = 110;
  const HALF = SIZE / 2;

  const containerStyle: React.CSSProperties = {
    width: SIZE * 2,
    height: SIZE * 2,
    perspective: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const cubeStyle: React.CSSProperties = {
    width: SIZE,
    height: SIZE,
    position: "relative",
    transformStyle: "preserve-3d",
    transform: `scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
    transition: "transform 0.05s linear",
  };

  const face = (transform: string, background: string, borderColor = "rgba(255,255,255,0.12)"): React.CSSProperties => ({
    position: "absolute",
    width: SIZE,
    height: SIZE,
    transform,
    backfaceVisibility: "hidden",
    background,
    border: `1px solid ${borderColor}`,
    borderRadius: 10,
    overflow: "hidden",
  });

  return (
    <div style={containerStyle}>
      <div style={cubeStyle}>
        {/* Front */}
        <div style={face(`translateZ(${HALF}px)`, "rgba(52,52,62,0.95)")}>
          <div className="flex h-full w-full items-end justify-end p-2.5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 17L9 11M9 11H5M9 11V15" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {/* Back */}
        <div style={face(`rotateY(180deg) translateZ(${HALF}px)`, "rgba(38,38,46,0.95)")} />
        {/* Left */}
        <div style={face(`rotateY(-90deg) translateZ(${HALF}px)`, "rgba(44,44,54,0.95)")}>
          <div className="flex h-full w-full items-start justify-start p-3">
            <div
              className="h-3 w-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.18)" }}
            />
          </div>
        </div>
        {/* Right */}
        <div style={face(`rotateY(90deg) translateZ(${HALF}px)`, "rgba(44,44,54,0.95)")} />
        {/* Top */}
        <div style={face(`rotateX(90deg) translateZ(${HALF}px)`, "rgba(56,56,68,0.95)")}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="angle-preview"
              className="h-full w-full object-cover"
              style={{ opacity: 0.85 }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="10" width="24" height="18" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
                <circle cx="11" cy="16.5" r="3" fill="rgba(255,255,255,0.22)" />
                <path d="M4 22l7-5 5 4 4-3 8 6" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
              </svg>
            </div>
          )}
        </div>
        {/* Bottom */}
        <div style={face(`rotateX(-90deg) translateZ(${HALF}px)`, "rgba(28,28,36,0.95)")} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AngleAdjustPanel
// ─────────────────────────────────────────────
const ANGLE_CREDIT_COST = 5;

export function AngleAdjustPanel({
  imageUrl,
  isSubmitting = false,
  onClose,
  onApply,
}: AngleAdjustPanelProps) {
  const [config, setConfig] = useState<AngleConfig>({ ...DEFAULT_CONFIG });

  const patch = useCallback((partial: Partial<AngleConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG });
  }, []);

  const promptPreview = useMemo(() => buildAnglePromptFromConfig(config), [config]);

  const handleApply = useCallback(async () => {
    await onApply(config, promptPreview);
    onClose();
  }, [config, onApply, onClose, promptPreview]);

  return (
    <div
      className="w-[520px] max-w-[96vw] rounded-[22px] border border-white/10 bg-[#17181C] shadow-[0_36px_96px_rgba(0,0,0,0.55)]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Angle</div>
          <h2 className="mt-0.5 text-base font-semibold text-zinc-100">拖拽方块调整角度</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded-full border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex gap-4 p-4">

        {/* Left: 3D Cube + Reset */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center rounded-[18px] border border-white/8 bg-[#232427]"
            style={{ width: 168, height: 168 }}
          >
            <CubePreview config={config} imageUrl={imageUrl} />
          </div>

          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/14 hover:bg-white/[0.08]"
          >
            <RotateCcw size={12} />
            重置
          </button>
        </div>

        {/* Right: Sliders + Prompt + Button */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">

          {/* Sliders */}
          <div className="flex flex-col gap-4 rounded-[16px] border border-white/6 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <SliderRow
              label="旋转"
              min={0}
              max={360}
              step={1}
              value={config.rotation}
              displayValue={`${config.rotation}°`}
              onChange={(v) => patch({ rotation: v })}
            />
            <SliderRow
              label="倾斜"
              min={-45}
              max={90}
              step={1}
              value={config.tilt}
              displayValue={`${config.tilt}°`}
              onChange={(v) => patch({ tilt: v })}
            />
            <SliderRow
              label="缩放"
              min={1}
              max={10}
              step={0.1}
              value={config.zoom}
              displayValue={config.zoom.toFixed(1)}
              onChange={(v) => patch({ zoom: v })}
            />
          </div>

          {/* Prompt preview + Apply */}
          <div className="flex flex-col justify-between gap-2 rounded-[16px] border border-white/8 bg-[#1F2024] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Prompt</div>
              <div className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-zinc-400">{promptPreview}</div>
            </div>

            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={isSubmitting}
              className="mt-1 inline-flex w-full items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-3 pr-1.5 text-xs font-semibold text-zinc-900 shadow-[0_6px_18px_rgba(255,255,255,0.07)] transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>生成角度调整 · {ANGLE_CREDIT_COST} 积分</span>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white">
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
