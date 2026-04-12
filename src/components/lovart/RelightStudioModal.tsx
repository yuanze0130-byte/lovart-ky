"use client";

import React, {
 useCallback,
 useEffect,
 useRef,
 useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SingleLight {
 enabled: boolean;
 azimuth: number; // -180 ~ 180
 elevation: number; // -90 ~ 90
 intensity: number; // 0 ~ 100
 color: string; // HEX e.g. "#ffffff"
}

export interface RelightConfig {
 mainLight: SingleLight;
 fillLight: SingleLight;
}

interface RelightStudioModalProps {
 open: boolean;
 imageUrl?: string;
 onClose: () => void;
 onApply: (config: RelightConfig, promptPatch: string) => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MAIN: SingleLight = {
 enabled: true,
 azimuth: 45,
 elevation: 30,
 intensity: 75,
 color: "#fff5e0",
};

const DEFAULT_FILL: SingleLight = {
 enabled: false,
 azimuth: -120,
 elevation: 10,
 intensity: 30,
 color: "#c8d8ff",
};

// ─── Quick positions ──────────────────────────────────────────────────────────

const QUICK_POSITIONS = [
 { label: "左侧", azimuth: -90, elevation: 0 },
 { label: "顶部", azimuth: 0, elevation: 90 },
 { label: "右侧", azimuth: 90, elevation: 0 },
 { label: "左上", azimuth: -45, elevation: 45 },
 { label: "前方", azimuth: 0, elevation: 0 },
 { label: "右上", azimuth: 45, elevation: 45 },
 { label: "底部", azimuth: 0, elevation: -90 },
 { label: "后方", azimuth: 180, elevation: 0 },
] as const;

// ─── Color presets ─────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
 { label: "日光", color: "#fff5e0" },
 { label: "冷白", color: "#e8f0ff" },
 { label: "暖橙", color: "#ff8c42" },
 { label: "蓝调", color: "#4fc3f7" },
 { label: "金黄", color: "#ffd54f" },
 { label: "玫瑰", color: "#f48fb1" },
 { label: "翠绿", color: "#80cbc4" },
 { label: "紫调", color: "#ce93d8" },
];

const LIGHTING_PRESETS = [
 { label: "棚拍主光", main: { ...DEFAULT_MAIN }, fill: { ...DEFAULT_FILL } },
 { label: "电影逆光", main: { enabled: true, azimuth: 135, elevation: 20, intensity: 85, color: "#ffd54f" }, fill: { enabled: true, azimuth: -35, elevation: 5, intensity: 24, color: "#4fc3f7" } },
 { label: "人像柔光", main: { enabled: true, azimuth: 25, elevation: 35, intensity: 68, color: "#fff5e0" }, fill: { enabled: true, azimuth: -20, elevation: 12, intensity: 35, color: "#e8f0ff" } },
 { label: "冷暖对比", main: { enabled: true, azimuth: 60, elevation: 28, intensity: 72, color: "#ff8c42" }, fill: { enabled: true, azimuth: -120, elevation: 8, intensity: 42, color: "#4fc3f7" } },
] as const;

// ─── Coordinate helpers ────────────────────────────────────────────────────────

function lightToXY(
 azimuth: number,
 elevation: number,
 radius: number
): { x: number; y: number } {
 const el = Math.max(-90, Math.min(90, elevation));
 const r = radius * (1 - (el + 90) / 180);
 const az = (azimuth * Math.PI) / 180;
 return {
 x: r * Math.sin(az),
 y: -r * Math.cos(az),
 };
}

function xyToLight(
 dx: number,
 dy: number,
 radius: number
): { azimuth: number; elevation: number } {
 const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
 const elevation = 90 - (dist / radius) * 180;
 const azimuth = (Math.atan2(dx, -dy) * 180) / Math.PI;
 return { azimuth: Math.round(azimuth), elevation: Math.round(elevation) };
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

export function buildRelightPromptFromConfig(config: RelightConfig): string {
 const dirLabel = (az: number): string => {
 const abs = ((az % 360) + 360) % 360;
 if (abs < 22.5 || abs >= 337.5) return "正前方";
 if (abs < 67.5) return "右前方";
 if (abs < 112.5) return "右侧";
 if (abs < 157.5) return "右后方";
 if (abs < 202.5) return "正后方";
 if (abs < 247.5) return "左后方";
 if (abs < 292.5) return "左侧";
 return "左前方";
 };

 const elLabel = (el: number): string => {
 if (el >= 60) return "顶光";
 if (el >= 30) return "高位光";
 if (el >= 5) return "水平光";
 if (el >= -30) return "低位光";
 return "底光";
 };

 const intensityLabel = (v: number): string => {
 if (v >= 80) return "强烈";
 if (v >= 50) return "中等";
 if (v >= 25) return "柔和";
 return "微弱";
 };

 const hexToName = (hex: string): string => {
 const map: Record<string, string> = {
 "#fff5e0": "暖白光",
 "#e8f0ff": "冷白光",
 "#ff8c42": "橙色暖光",
 "#4fc3f7": "冷蓝光",
 "#ffd54f": "金黄光",
 "#f48fb1": "玫瑰光",
 "#80cbc4": "青绿光",
 "#ce93d8": "紫色光",
 };
 return map[hex.toLowerCase()] ?? `${hex} 色光`;
 };

 const parts: string[] = ["[可视化打光]"];

 if (config.mainLight.enabled) {
 const m = config.mainLight;
 parts.push(
 `主光源：${dirLabel(m.azimuth)}${elLabel(m.elevation)}，` +
 `强度 ${intensityLabel(m.intensity)}（${m.intensity}%），` +
 `颜色 ${hexToName(m.color)}`
 );
 }

 if (config.fillLight.enabled) {
 const f = config.fillLight;
 parts.push(
 `辅助光源：${dirLabel(f.azimuth)}${elLabel(f.elevation)}，` +
 `强度 ${intensityLabel(f.intensity)}（${f.intensity}%），` +
 `颜色 ${hexToName(f.color)}`
 );
 }

 parts.push(
 "渲染要求：保持主体特征，仅调整光照环境，写实光影效果，高质量输出"
 );

 return parts.join("；");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderRowProps {
 label: string;
 min: number;
 max: number;
 value: number;
 unit?: string;
 onChange: (v: number) => void;
}

function SliderRow({ label, min, max, value, unit = "", onChange }: SliderRowProps) {
 return (
 <div className="flex items-center gap-2">
 <span className="w-12 text-xs text-zinc-400 shrink-0">{label}</span>
 <input
 type="range"
 min={min}
 max={max}
 value={value}
 onChange={(e) => onChange(Number(e.target.value))}
 className="flex-1 accent-blue-500 h-1"
 />
 <span className="w-16 text-xs text-zinc-300 text-right shrink-0">
 {value}
 {unit}
 </span>
 </div>
 );
}

// ─── Light ball SVG disk ───────────────────────────────────────────────────────

interface LightBallPreviewProps {
 mainLight: SingleLight;
 fillLight: SingleLight;
 activeTab: "main" | "fill";
 onMainChange: (partial: Partial<SingleLight>) => void;
 onFillChange: (partial: Partial<SingleLight>) => void;
}

function LightBallPreview({
 mainLight,
 fillLight,
 activeTab,
 onMainChange,
 onFillChange,
}: LightBallPreviewProps) {
 const svgRef = useRef<SVGSVGElement>(null);
 const draggingRef = useRef<"main" | "fill" | null>(null);
 const RADIUS = 90;
 const CENTER = 100;

 const getActiveLight = useCallback(
 () => (activeTab === "main" ? mainLight : fillLight),
 [activeTab, mainLight, fillLight]
 );

 const getActiveChange = useCallback(
 () => (activeTab === "main" ? onMainChange : onFillChange),
 [activeTab, onMainChange, onFillChange]
 );

 const svgToLight = useCallback(
 (clientX: number, clientY: number) => {
 const svg = svgRef.current;
 if (!svg) return;
 const rect = svg.getBoundingClientRect();
 const scale = 200 / rect.width;
 const dx = (clientX - rect.left) * scale - CENTER;
 const dy = (clientY - rect.top) * scale - CENTER;
 return xyToLight(dx, dy, RADIUS);
 },
 []
 );

 const handleMouseDown = useCallback(
 (e: React.MouseEvent<SVGElement>, which: "main" | "fill") => {
 e.preventDefault();
 draggingRef.current = which;
 },
 []
 );

 useEffect(() => {
 const onMove = (e: MouseEvent) => {
 if (!draggingRef.current) return;
 const result = svgToLight(e.clientX, e.clientY);
 if (!result) return;
 if (draggingRef.current === "main") onMainChange(result);
 else onFillChange(result);
 };
 const onUp = () => {
 draggingRef.current = null;
 };
 window.addEventListener("mousemove", onMove);
 window.addEventListener("mouseup", onUp);
 return () => {
 window.removeEventListener("mousemove", onMove);
 window.removeEventListener("mouseup", onUp);
 };
 }, [svgToLight, onMainChange, onFillChange]);

 const handleSvgClick = useCallback(
 (e: React.MouseEvent<SVGSVGElement>) => {
 if (draggingRef.current) return;
 const result = svgToLight(e.clientX, e.clientY);
 if (!result) return;
 getActiveChange()(result);
 },
 [svgToLight, getActiveChange]
 );

 const handleWheel = useCallback(
 (e: React.WheelEvent<SVGSVGElement>) => {
 e.preventDefault();
 const current = getActiveLight();
 const delta = e.deltaY > 0 ? -5 : 5;
 const newIntensity = Math.max(0, Math.min(100, current.intensity + delta));
 getActiveChange()({ intensity: newIntensity });
 },
 [getActiveLight, getActiveChange]
 );

 const mainPos = lightToXY(mainLight.azimuth, mainLight.elevation, RADIUS);
 const fillPos = lightToXY(fillLight.azimuth, fillLight.elevation, RADIUS);

 return (
 <svg
 ref={svgRef}
 viewBox="0 0 200 200"
 className="w-full cursor-crosshair select-none"
 onClick={handleSvgClick}
 onWheel={handleWheel}
 >
 {/* Background disk */}
 <defs>
 <radialGradient id="diskGrad" cx="50%" cy="50%" r="50%">
 <stop offset="0%" stopColor="#2e2e3a" />
 <stop offset="100%" stopColor="#111117" />
 </radialGradient>
 </defs>
 <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#diskGrad)" />
 {/* Grid lines */}
 {[-1, 0, 1].map((i) => (
 <React.Fragment key={i}>
 <line
 x1={CENTER + i * 30}
 y1={CENTER - RADIUS}
 x2={CENTER + i * 30}
 y2={CENTER + RADIUS}
 stroke="#333"
 strokeWidth="0.5"
 />
 <line
 x1={CENTER - RADIUS}
 y1={CENTER + i * 30}
 x2={CENTER + RADIUS}
 y2={CENTER + i * 30}
 stroke="#333"
 strokeWidth="0.5"
 />
 </React.Fragment>
 ))}
 {/* Fill light ball */}
 {fillLight.enabled && (
 <>
 <circle
 cx={CENTER + fillPos.x}
 cy={CENTER + fillPos.y}
 r={14}
 fill={fillLight.color}
 fillOpacity={0.12 + fillLight.intensity / 220}
 />
 <circle
 cx={CENTER + fillPos.x}
 cy={CENTER + fillPos.y}
 r={8}
 fill={fillLight.color}
 fillOpacity={fillLight.intensity / 100}
 stroke={activeTab === "fill" ? "#60a5fa" : "#555"}
 strokeWidth={activeTab === "fill" ? 2 : 1}
 className="cursor-grab"
 onMouseDown={(e) => handleMouseDown(e, "fill")}
 />
 </>
 )}
 {/* Main light ball */}
 {mainLight.enabled && (
 <>
 <circle
 cx={CENTER + mainPos.x}
 cy={CENTER + mainPos.y}
 r={22}
 fill={mainLight.color}
 fillOpacity={0.12 + mainLight.intensity / 220}
 />
 <circle
 cx={CENTER + mainPos.x}
 cy={CENTER + mainPos.y}
 r={12}
 fill={mainLight.color}
 fillOpacity={mainLight.intensity / 100}
 stroke={activeTab === "main" ? "#facc15" : "#888"}
 strokeWidth={activeTab === "main" ? 2.5 : 1.5}
 className="cursor-grab"
 onMouseDown={(e) => handleMouseDown(e, "main")}
 />
 </>
 )}
 {/* Labels */}
 <text x={CENTER} y={CENTER - RADIUS - 4} textAnchor="middle" fontSize="8" fill="#555">前</text>
 <text x={CENTER} y={CENTER + RADIUS + 10} textAnchor="middle" fontSize="8" fill="#555">后</text>
 <text x={CENTER - RADIUS - 4} y={CENTER + 3} textAnchor="end" fontSize="8" fill="#555">左</text>
 <text x={CENTER + RADIUS + 4} y={CENTER + 3} textAnchor="start" fontSize="8" fill="#555">右</text>
 </svg>
 );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

export function RelightStudioModal({
 open,
 imageUrl,
 onClose,
 onApply,
}: RelightStudioModalProps) {
 const [activeTab, setActiveTab] = useState<"main" | "fill">("main");
 const [mainLight, setMainLight] = useState<SingleLight>({ ...DEFAULT_MAIN });
 const [fillLight, setFillLight] = useState<SingleLight>({ ...DEFAULT_FILL });

 const patchMain = useCallback(
 (partial: Partial<SingleLight>) =>
 setMainLight((prev) => ({ ...prev, ...partial })),
 []
 );
 const patchFill = useCallback(
 (partial: Partial<SingleLight>) =>
 setFillLight((prev) => ({ ...prev, ...partial })),
 []
 );

 const activeLight = activeTab === "main" ? mainLight : fillLight;
 const patchActive = activeTab === "main" ? patchMain : patchFill;

 const applyPreset = useCallback((preset: (typeof LIGHTING_PRESETS)[number]) => {
 setMainLight({ ...preset.main });
 setFillLight({ ...preset.fill });
 }, []);

 const resetLights = useCallback(() => {
 setMainLight({ ...DEFAULT_MAIN });
 setFillLight({ ...DEFAULT_FILL });
 setActiveTab("main");
 }, []);

 const handleApply = () => {
 const config: RelightConfig = { mainLight, fillLight };
 const patch = buildRelightPromptFromConfig(config);
 onApply(config, patch);
 onClose();
 };

 if (!open) return null;

 return (
 <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
 onClick={(e) => e.target === e.currentTarget && onClose()}
 >
 <div className="relative w-[760px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(16,16,20,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
 {/* Header */}
 <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 bg-zinc-950/70 px-5 py-4 backdrop-blur-xl">
 <div>
 <p className="text-[11px] uppercase tracking-[0.16em] text-blue-300/70">Relight Studio</p>
 <h2 className="mt-1 text-sm font-semibold text-zinc-100">可视化打光工作室</h2>
 </div>
 <button
 onClick={onClose}
 className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
 >
 ✕
 </button>
 </div>

 {/* Body */}
 <div className="flex gap-5 p-5">
 {/* Left: preview */}
 <div className="flex w-[220px] shrink-0 flex-col gap-3">
 {imageUrl && (
 // eslint-disable-next-line @next/next/no-img-element
 <img
 src={imageUrl}
 alt="preview"
 className="aspect-square w-full rounded-2xl border border-white/10 object-cover shadow-lg shadow-black/20"
 />
 )}
 <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-3 shadow-inner shadow-black/20">
 <LightBallPreview
 mainLight={mainLight}
 fillLight={fillLight}
 activeTab={activeTab}
 onMainChange={patchMain}
 onFillChange={patchFill}
 />
 <p className="mt-2 text-[10px] text-zinc-500 text-center">
 点击或拖拽光球调整方向 · 滚轮调强度
 </p>
 </div>
 </div>

 {/* Right: controls */}
 <div className="flex-1 min-w-0 rounded-2xl border border-white/8 bg-zinc-950/35 p-4 flex flex-col gap-4">
 {/* Tab buttons */}
 <div className="flex gap-2 rounded-2xl bg-black/20 p-1">
 {(["main", "fill"] as const).map((tab) => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
 activeTab === tab
 ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/30"
 : "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
 }`}
 >
 {tab === "main" ? "主光源" : "辅助光源"}
 </button>
 ))}
 </div>

 <div className="grid grid-cols-2 gap-2">
 <div className={`rounded-2xl border px-3 py-3 ${activeTab === "main" ? "border-yellow-400/40 bg-yellow-400/8" : "border-white/8 bg-white/4"}`}>
 <div className="flex items-center justify-between">
 <span className="text-[11px] font-medium text-zinc-100">主光源</span>
 <span className="text-[10px] text-zinc-400">{mainLight.enabled ? `${mainLight.intensity}%` : "关闭"}</span>
 </div>
 <p className="mt-1 text-[10px] text-zinc-500">{mainLight.color} · {mainLight.azimuth}° / {mainLight.elevation}°</p>
 </div>
 <div className={`rounded-2xl border px-3 py-3 ${activeTab === "fill" ? "border-blue-400/40 bg-blue-400/8" : "border-white/8 bg-white/4"}`}>
 <div className="flex items-center justify-between">
 <span className="text-[11px] font-medium text-zinc-100">辅助光源</span>
 <span className="text-[10px] text-zinc-400">{fillLight.enabled ? `${fillLight.intensity}%` : "关闭"}</span>
 </div>
 <p className="mt-1 text-[10px] text-zinc-500">{fillLight.color} · {fillLight.azimuth}° / {fillLight.elevation}°</p>
 </div>
 </div>

 <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/15 px-3 py-2">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={activeLight.enabled}
 onChange={(e) => patchActive({ enabled: e.target.checked })}
 className="accent-blue-500"
 />
 <span className="text-xs text-zinc-300">启用当前光源</span>
 </label>
 <div className="flex items-center gap-2 text-[10px] text-zinc-400">
 <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">Az {activeLight.azimuth}°</span>
 <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1">El {activeLight.elevation}°</span>
 </div>
 </div>

 {/* Sliders */}
 <div className="flex flex-col gap-3">
 <SliderRow
 label="水平环绕"
 min={-180}
 max={180}
 value={activeLight.azimuth}
 unit="°"
 onChange={(v) => patchActive({ azimuth: v })}
 />
 <SliderRow
 label="垂直高度"
 min={-90}
 max={90}
 value={activeLight.elevation}
 unit="°"
 onChange={(v) => patchActive({ elevation: v })}
 />
 <SliderRow
 label="光照强度"
 min={0}
 max={100}
 value={activeLight.intensity}
 unit="%"
 onChange={(v) => patchActive({ intensity: v })}
 />
 </div>

 {/* Color */}
 <div className="flex flex-col gap-2">
 <span className="text-xs text-zinc-400">光源颜色</span>
 <div className="flex items-center gap-2">
 <input
 type="color"
 value={activeLight.color}
 onChange={(e) => patchActive({ color: e.target.value })}
 className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
 />
 <input
 type="text"
 value={activeLight.color}
 onChange={(e) => patchActive({ color: e.target.value })}
 className="w-24 px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-200 border border-zinc-600 font-mono"
 placeholder="#ffffff"
 />
 </div>
 <div className="grid grid-cols-8 gap-1 mt-1">
 {COLOR_PRESETS.map((preset) => (
 <button
 key={preset.color}
 title={preset.label}
 onClick={() => patchActive({ color: preset.color })}
 className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
 style={{
 backgroundColor: preset.color,
 borderColor:
 activeLight.color === preset.color
 ? "#60a5fa"
 : "transparent",
 }}
 />
 ))}
 </div>
 </div>

 {/* Quick positions */}
 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between gap-3">
 <span className="text-xs text-zinc-400">快捷方位</span>
 <button
 onClick={resetLights}
 className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
 >
 重置默认
 </button>
 </div>
 <div className="grid grid-cols-4 gap-1.5">
 {QUICK_POSITIONS.map((pos) => (
 <button
 key={pos.label}
 onClick={() =>
 patchActive({
 azimuth: pos.azimuth,
 elevation: pos.elevation,
 })
 }
 className="py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors"
 >
 {pos.label}
 </button>
 ))}
 </div>
 </div>

 <div className="flex flex-col gap-2">
 <span className="text-xs text-zinc-400">一键打光预设</span>
 <div className="grid grid-cols-2 gap-2">
 {LIGHTING_PRESETS.map((preset) => (
 <button
 key={preset.label}
 onClick={() => applyPreset(preset)}
 className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-left transition-colors hover:bg-white/8"
 >
 <div className="text-xs font-medium text-zinc-200">{preset.label}</div>
 <div className="mt-1 text-[10px] text-zinc-500">主光 {preset.main.intensity}% · 辅光 {preset.fill.enabled ? `${preset.fill.intensity}%` : "关闭"}</div>
 </button>
 ))}
 </div>
 </div>

 {/* Prompt preview */}
 <div className="rounded-2xl border border-white/8 bg-black/20 p-3 shadow-inner shadow-black/20">
 <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Prompt Patch Preview</p>
 <p className="text-[10px] break-all leading-relaxed text-zinc-300">
 {buildRelightPromptFromConfig({ mainLight, fillLight })}
 </p>
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="flex justify-end gap-3 border-t border-white/8 px-5 py-4 bg-zinc-950/55 backdrop-blur-xl">
 <button
 onClick={onClose}
 className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 transition-colors hover:bg-white/5"
 >
 取消
 </button>
 <button
 onClick={handleApply}
 className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-900/30 transition-colors hover:from-blue-500 hover:to-indigo-500"
 >
 应用打光
 </button>
 </div>
 </div>
 </div>
 );
}
