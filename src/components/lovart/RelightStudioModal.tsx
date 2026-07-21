"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Loader2, RotateCcw } from "lucide-react";

export interface SingleLight {
  enabled: boolean;
  azimuth: number;
  elevation: number;
  intensity: number;
  color: string;
}

export interface RelightConfig {
  viewMode: "perspective" | "front";
  mainLight: SingleLight;
  fillLight: SingleLight;
}

interface RelightStudioPanelProps {
  imageUrl?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onApply: (config: RelightConfig) => void | Promise<void>;
  showCloseButton?: boolean;
  containerClassName?: string;
}

interface RelightStudioModalProps extends RelightStudioPanelProps {
  open: boolean;
}

const DEFAULT_MAIN: SingleLight = {
  enabled: true,
  azimuth: 0,
  elevation: 0,
  intensity: 30,
  color: "#FFFFFF",
};

const DEFAULT_FILL: SingleLight = {
  enabled: false,
  azimuth: -120,
  elevation: 10,
  intensity: 0,
  color: "#FFFFFF",
};

const QUICK_POSITIONS = [
  { label: "左侧", azimuth: -90, elevation: 0 },
  { label: "顶部", azimuth: 0, elevation: 90 },
  { label: "右侧", azimuth: 90, elevation: 0 },
  { label: "前方", azimuth: 0, elevation: 0 },
  { label: "底部", azimuth: 0, elevation: -90 },
  { label: "后方", azimuth: 180, elevation: 0 },
] as const;

const RELIGHT_MODEL_LABEL = "Nanobanana Pro";
const RELIGHT_RESOLUTION_LABEL = "2K";
const RELIGHT_CREDIT_COST = 5;
const RELIGHT_COLOR_PRESETS = ["#FFFFFF", "#FFE8B5", "#FFD36B", "#FFC8A2", "#FFD1DC", "#CFE8FF", "#B8D5FF", "#D7C7FF"] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lightToXY(azimuth: number, elevation: number, radius: number) {
  const el = clamp(elevation, -90, 90);
  const r = radius * (1 - (el + 90) / 180);
  const az = (azimuth * Math.PI) / 180;
  return {
    x: r * Math.sin(az),
    y: -r * Math.cos(az),
  };
}

function xyToLight(dx: number, dy: number, radius: number) {
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
  const elevation = 90 - (dist / radius) * 180;
  const azimuth = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return {
    azimuth: Math.round(azimuth),
    elevation: Math.round(elevation),
  };
}

function directionLabel(azimuth: number, elevation: number) {
  if (elevation >= 65) return "顶部";
  if (elevation <= -65) return "底部";
  const abs = ((azimuth % 360) + 360) % 360;
  if (abs < 45 || abs >= 315) return "前方";
  if (abs < 135) return "右侧";
  if (abs < 225) return "后方";
  return "左侧";
}

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, min, max, value, unit = "", onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-200">{label}</span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-white"
      />
    </div>
  );
}

interface LightBallPreviewProps {
  imageUrl?: string;
  viewMode: "perspective" | "front";
  light: SingleLight;
  onChange: (partial: Partial<SingleLight>) => void;
  onViewModeChange: (mode: "perspective" | "front") => void;
}

function LightBallPreview({ imageUrl, viewMode, light, onChange, onViewModeChange }: LightBallPreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const RADIUS = 92;
  const CENTER = 116;

  const lightPos = useMemo(() => lightToXY(light.azimuth, light.elevation, RADIUS - 12), [light.azimuth, light.elevation]);

  const svgToLight = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = 232 / rect.width;
    const dx = (clientX - rect.left) * scale - CENTER;
    const dy = (clientY - rect.top) * scale - CENTER;
    return xyToLight(dx, dy, RADIUS - 12);
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const result = svgToLight(e.clientX, e.clientY);
      if (!result) return;
      onChange(result);
    };

    const handleUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onChange, svgToLight]);

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/8 bg-[#242426] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 inline-flex rounded-full border border-white/8 bg-black/25 p-1">
        {([
          ["perspective", "透视"],
          ["front", "正面"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`rounded-full px-3 py-1 text-xs transition-colors ${viewMode === mode ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
            onClick={() => onViewModeChange(mode)}
            data-view-mode={mode}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center">
        <svg
          ref={svgRef}
          viewBox="0 0 232 232"
          className="h-[200px] w-[200px] max-w-full cursor-crosshair select-none"
          onMouseDown={(e) => {
            draggingRef.current = true;
            const result = svgToLight(e.clientX, e.clientY);
            if (result) onChange(result);
          }}
        >
          <defs>
            <radialGradient id="relightSphereBg" cx="38%" cy="30%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="55%" stopColor="rgba(60,60,68,0.78)" />
              <stop offset="100%" stopColor="rgba(18,18,22,0.98)" />
            </radialGradient>
            <radialGradient id="relightGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={light.color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={light.color} stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#relightSphereBg)" stroke="rgba(255,255,255,0.08)" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 2} fill="none" stroke="rgba(255,255,255,0.05)" />
          <circle cx={CENTER + lightPos.x} cy={CENTER + lightPos.y} r="44" fill="url(#relightGlow)" />

          {Array.from({ length: 20 }).map((_, index) => {
            const angle = (index / 20) * Math.PI * 2;
            const rx = CENTER + Math.cos(angle) * (RADIUS - 28) * 0.74;
            const ry = CENTER + Math.sin(angle) * (RADIUS - 32) * 0.62;
            return <circle key={index} cx={rx} cy={ry} r="1.2" fill="rgba(255,255,255,0.16)" />;
          })}

          <ellipse
            cx={CENTER}
            cy={CENTER + (viewMode === "perspective" ? 8 : 0)}
            rx={viewMode === "perspective" ? 48 : 42}
            ry={viewMode === "perspective" ? 64 : 58}
            fill="rgba(255,255,255,0.02)"
            stroke="rgba(255,255,255,0.08)"
          />

          {imageUrl && (
            <foreignObject
              x={CENTER - 38}
              y={CENTER - 56}
              width="76"
              height="112"
              style={{ overflow: "visible" }}
            >
              <div
                style={{
                  width: 76,
                  height: 112,
                  borderRadius: 14,
                  overflow: "hidden",
                  transform: viewMode === "perspective" ? "perspective(320px) rotateY(-12deg) rotateX(4deg)" : "none",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="relight-preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </foreignObject>
          )}

          <line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + lightPos.x}
            y2={CENTER + lightPos.y}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="4 5"
          />
          <circle cx={CENTER + lightPos.x} cy={CENTER + lightPos.y} r="8" fill="#050505" stroke="rgba(255,255,255,0.28)" />
          <circle cx={CENTER + lightPos.x} cy={CENTER + lightPos.y} r="18" fill="none" stroke="rgba(255,255,255,0.1)" />
        </svg>
      </div>
    </div>
  );
}

export function RelightStudioPanel({
  imageUrl,
  isSubmitting = false,
  onClose,
  onApply,
  showCloseButton = true,
  containerClassName,
}: RelightStudioPanelProps) {
  const [viewMode, setViewMode] = useState<"perspective" | "front">("perspective");
  const [mainLight, setMainLight] = useState<SingleLight>({ ...DEFAULT_MAIN });
  const [fillLight, setFillLight] = useState<SingleLight>({ ...DEFAULT_FILL });
  const currentDirection = useMemo(() => directionLabel(mainLight.azimuth, mainLight.elevation), [mainLight.azimuth, mainLight.elevation]);

  const patchMain = useCallback((partial: Partial<SingleLight>) => {
    setMainLight((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetLights = useCallback(() => {
    setViewMode("perspective");
    setMainLight({ ...DEFAULT_MAIN });
    setFillLight({ ...DEFAULT_FILL });
  }, []);

  const handleApply = useCallback(async () => {
    const config: RelightConfig = { viewMode, mainLight, fillLight };
    await onApply(config);
    onClose();
  }, [fillLight, mainLight, onApply, onClose, viewMode]);

  return (
    <div className={containerClassName ?? "w-[960px] max-w-[96vw] rounded-[24px] border border-white/10 bg-[#17181C] shadow-[0_36px_96px_rgba(0,0,0,0.5)]"}>
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Relight</div>
            <h2 className="mt-1 text-base font-semibold text-zinc-100">AI 画布重打光</h2>
          </div>
          {showCloseButton ? (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              关闭
            </button>
          ) : <div />}
        </div>

        <div className="grid gap-3 p-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-[18px] border border-white/6 bg-[#232427] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <LightBallPreview imageUrl={imageUrl} viewMode={viewMode} light={mainLight} onChange={patchMain} onViewModeChange={setViewMode} />

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={resetLights}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/12 hover:bg-white/[0.07]"
              >
                <RotateCcw size={13} />
                重置
              </button>
              <div className="truncate text-[10px] text-zinc-500">拖动光点调方向</div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-[16px] border border-white/6 bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-[0.01em] text-zinc-100">主光源</h3>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
                  <span className="rounded-full border border-white/6 bg-white/[0.04] px-2.5 py-0.5">方向：{currentDirection}</span>
                  <span className="rounded-full border border-white/6 bg-white/[0.04] px-2.5 py-0.5">视图：{viewMode === "perspective" ? "透视" : "正面"}</span>
                  <span className="rounded-full border border-white/6 bg-white/[0.04] px-2.5 py-0.5">{RELIGHT_MODEL_LABEL} / {RELIGHT_RESOLUTION_LABEL}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/8 bg-[#1F2024] px-3 py-1.5">
                <span className="text-[10px] text-zinc-500">预计</span>
                <span className="text-xs font-semibold text-white">{RELIGHT_CREDIT_COST} 积分</span>
              </div>
            </div>

            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
              <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold tracking-[0.01em] text-zinc-100">快捷方向</h3>
                  <span className="text-[10px] text-zinc-600">也可以拖动左侧光点</span>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-1.5 max-lg:grid-cols-3">
                  {QUICK_POSITIONS.map((item) => {
                    const active = mainLight.azimuth === item.azimuth && mainLight.elevation === item.elevation;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => patchMain({ azimuth: item.azimuth, elevation: item.elevation })}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${active ? "border-white/30 bg-white/12 text-white" : "border-white/6 bg-white/[0.04] text-zinc-300 hover:border-white/10 hover:bg-white/[0.07]"}`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold tracking-[0.01em] text-zinc-100">灯光颜色</h3>
                  <label className="relative block h-7 w-7 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    <input
                      type="color"
                      value={mainLight.color}
                      onChange={(e) => patchMain({ color: e.target.value.toUpperCase() })}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="自定义灯光颜色"
                    />
                    <span className="absolute inset-1 rounded-md border border-white/10" style={{ backgroundColor: mainLight.color }} />
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-8 gap-1.5">
                  {RELIGHT_COLOR_PRESETS.map((color) => {
                    const active = mainLight.color.toUpperCase() === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => patchMain({ color })}
                        className={`h-7 rounded-lg border transition-colors ${active ? "border-white/45 ring-1 ring-white/25" : "border-white/8 hover:border-white/18"}`}
                        style={{ backgroundColor: color }}
                        title={color === "#FFFFFF" ? "白光" : color === "#FFE8B5" ? "暖白" : color === "#FFD36B" ? "日光" : color === "#FFC8A2" ? "夕照" : color === "#FFD1DC" ? "粉光" : color === "#CFE8FF" ? "冷白" : color === "#B8D5FF" ? "蓝调" : "紫调"}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px]">
              <div className="rounded-[16px] border border-white/6 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold tracking-[0.01em] text-zinc-100">精细微调</h3>
                  <span className="text-[10px] text-zinc-600">水平 / 高度 / 强度</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <SliderRow label="水平环绕" min={-180} max={180} value={mainLight.azimuth} unit="°" onChange={(value) => patchMain({ azimuth: value })} />
                  <SliderRow label="高度" min={-90} max={90} value={mainLight.elevation} unit="°" onChange={(value) => patchMain({ elevation: value })} />
                  <SliderRow label="强度" min={0} max={100} value={mainLight.intensity} unit="%" onChange={(value) => patchMain({ intensity: value })} />
                </div>
              </div>

              <div className="flex flex-col justify-end gap-2 rounded-[16px] border border-white/8 bg-[#1F2024] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-3 pr-1.5 text-xs font-semibold text-zinc-900 shadow-[0_6px_18px_rgba(255,255,255,0.08)] transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>生成重打光</span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white">
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

export function RelightStudioModal({ open, ...props }: RelightStudioModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 px-6 py-8" onClick={(e) => e.target === e.currentTarget && !props.isSubmitting && props.onClose()}>
      <RelightStudioPanel {...props} />
    </div>
  );
}
