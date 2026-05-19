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

interface RelightStudioModalProps {
  open: boolean;
  imageUrl?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onApply: (config: RelightConfig, promptPatch: string) => void | Promise<void>;
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

export function buildRelightPromptFromConfig(config: RelightConfig): string {
  const main = config.mainLight;
  const intensity = Math.max(0, Math.min(1, main.intensity / 100)).toFixed(2);
  return [
    "[可视化重打光]",
    `视图模式：${config.viewMode === "perspective" ? "透视" : "正面"}`,
    `主光方向：${directionLabel(main.azimuth, main.elevation)}`,
    `水平环绕 ${main.azimuth}°`,
    `高度 ${main.elevation}°`,
    `强度 ${main.intensity}%`,
    `灯光颜色 ${main.color}`,
    `后端参数建议：azimuth=${main.azimuth}, elevation=${main.elevation}, intensity=${intensity}, color=${main.color}`,
    "要求：保持主体和构图稳定，仅重设画面光线方向、明暗层次、受光面、阴影与氛围，输出高级、自然、写实的重新布光结果。",
  ].join("；");
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
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-200">{label}</span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-zinc-300">
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
  const RADIUS = 112;
  const CENTER = 140;

  const lightPos = useMemo(() => lightToXY(light.azimuth, light.elevation, RADIUS - 12), [light.azimuth, light.elevation]);

  const svgToLight = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = 280 / rect.width;
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
    <div className="relative overflow-hidden rounded-[24px] border border-white/8 bg-[#242426] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 inline-flex rounded-full border border-white/8 bg-black/25 p-1">
        {([
          ["perspective", "透视"],
          ["front", "正面"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${viewMode === mode ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
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
          viewBox="0 0 280 280"
          className="h-[360px] w-[360px] max-w-full cursor-crosshair select-none"
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

export function RelightStudioModal({ open, imageUrl, isSubmitting = false, onClose, onApply }: RelightStudioModalProps) {
  const [viewMode, setViewMode] = useState<"perspective" | "front">("perspective");
  const [mainLight, setMainLight] = useState<SingleLight>({ ...DEFAULT_MAIN });
  const [fillLight, setFillLight] = useState<SingleLight>({ ...DEFAULT_FILL });

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
    const promptPatch = buildRelightPromptFromConfig(config);
    await onApply(config, promptPatch);
    onClose();
  }, [fillLight, mainLight, onApply, onClose, viewMode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 px-6 py-8" onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
      <div className="w-[1080px] max-w-[96vw] rounded-[28px] border border-white/10 bg-[#17181C] shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Relight</div>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">AI 画布重打光</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            关闭
          </button>
        </div>

        <div className="grid grid-cols-[460px_minmax(0,1fr)] gap-6 p-6">
          <div className="rounded-[24px] bg-[#242426] p-4">
            <LightBallPreview imageUrl={imageUrl} viewMode={viewMode} light={mainLight} onChange={patchMain} onViewModeChange={setViewMode} />

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={resetLights}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/10"
              >
                <RotateCcw size={14} />
                重置
              </button>
              <div className="text-xs text-zinc-500">拖动光点联动右侧参数</div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <h3 className="text-base font-semibold text-white">主光源</h3>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {QUICK_POSITIONS.map((item) => {
                  const active = mainLight.azimuth === item.azimuth && mainLight.elevation === item.elevation;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => patchMain({ azimuth: item.azimuth, elevation: item.elevation })}
                      className={`rounded-xl border px-4 py-3 text-sm transition-colors ${active ? "border-white/30 bg-white/12 text-white" : "border-white/8 bg-white/5 text-zinc-300 hover:bg-white/8"}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">全局</h3>
              <div className="mt-4 space-y-5 rounded-[20px] border border-white/8 bg-black/12 p-4">
                <SliderRow label="水平环绕" min={-180} max={180} value={mainLight.azimuth} unit="°" onChange={(value) => patchMain({ azimuth: value })} />
                <SliderRow label="高度" min={-90} max={90} value={mainLight.elevation} unit="°" onChange={(value) => patchMain({ elevation: value })} />
                <SliderRow label="强度" min={0} max={100} value={mainLight.intensity} unit="%" onChange={(value) => patchMain({ intensity: value })} />
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-white">灯光颜色</h3>
              <div className="mt-3 flex items-center gap-3 rounded-[20px] border border-white/8 bg-[#2D2D30] px-4 py-3">
                <input
                  type="color"
                  value={mainLight.color}
                  onChange={(e) => patchMain({ color: e.target.value.toUpperCase() })}
                  className="h-10 w-10 cursor-pointer rounded-lg border-0 bg-transparent"
                />
                <div className="text-sm uppercase tracking-[0.14em] text-zinc-500">HEX</div>
                <input
                  type="text"
                  value={mainLight.color}
                  onChange={(e) => patchMain({ color: e.target.value.toUpperCase() })}
                  className="flex-1 bg-transparent text-right text-sm font-medium text-zinc-100 outline-none"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-black/12 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">Prompt Patch Preview</div>
              <div className="mt-2 text-sm leading-6 text-zinc-300">{buildRelightPromptFromConfig({ viewMode, mainLight, fillLight })}</div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-4 rounded-full border border-white/10 bg-[#202126] px-5 py-3">
              <div>
                <div className="text-xs text-zinc-500">预计消耗</div>
                <div className="text-lg font-semibold text-white">￥ 0.12</div>
              </div>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={isSubmitting}
                className="inline-flex items-center gap-3 rounded-full bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="px-2">生成</span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white">
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
