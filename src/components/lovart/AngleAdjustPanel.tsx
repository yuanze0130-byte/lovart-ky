"use client";

/* eslint-disable @next/next/no-img-element -- Generated previews are user/session data URLs */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, RotateCcw, X, Sparkles } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

export interface AngleConfig {
  rotation: number;   // 水平旋转 0–360°
  tilt: number;       // 俯仰 -30–75°
  zoom: "close" | "near" | "medium"; // 景别
}

/** 8 个水平环绕点位（顺时针，0° = 正前方） */
export const H_PRESETS = [
  { label: "正前", rotation: 0 },
  { label: "右前", rotation: 45 },
  { label: "右侧", rotation: 90 },
  { label: "右后", rotation: 135 },
  { label: "正后", rotation: 180 },
  { label: "左后", rotation: 225 },
  { label: "左侧", rotation: 270 },
  { label: "左前", rotation: 315 },
] as const;

/** 4 个垂直俯仰点位 */
export const V_PRESETS = [
  { label: "仰视", tilt: -30 },
  { label: "平视", tilt: 0 },
  { label: "俯视", tilt: 35 },
  { label: "鸟瞰", tilt: 75 },
] as const;

/** 3 个景别 */
export const ZOOM_PRESETS: { label: string; zoom: AngleConfig["zoom"]; scale: number; desc: string }[] = [
  { label: "特写", zoom: "close", scale: 1.4, desc: "极近 · 突出主体细节" },
  { label: "近景", zoom: "near", scale: 1.0, desc: "标准 · 清晰主体" },
  { label: "中景", zoom: "medium", scale: 0.68, desc: "稍远 · 含更多环境" },
];

const DEFAULT_CONFIG: AngleConfig = {
  rotation: 45,
  tilt: 0,
  zoom: "near",
};

const ANGLE_CREDIT_COST = 5; // per image

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function rotationLabel(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  if (norm < 23) return "正前方";
  if (norm < 68) return "右前方";
  if (norm < 113) return "右侧方";
  if (norm < 158) return "右后方";
  if (norm < 203) return "正后方";
  if (norm < 248) return "左后方";
  if (norm < 293) return "左侧方";
  if (norm < 338) return "左前方";
  return "正前方";
}

function tiltLabel(deg: number): string {
  if (deg >= 65) return "鸟瞰视角（接近俯视90°）";
  if (deg >= 25) return "俯视视角";
  if (deg >= -10) return "平视视角";
  return "仰视视角";
}

function zoomPromptDesc(zoom: AngleConfig["zoom"]): string {
  if (zoom === "close") return "特写景别，放大突出主体细节，极近距离构图";
  if (zoom === "medium") return "中景景别，稍远距离，画面包含更多环境背景";
  return "近景景别，标准构图，清晰呈现主体";
}

export function buildAnglePromptFromConfig(config: AngleConfig): string {
  return [
    "[可视化角度调整]",
    `相机水平方位：${rotationLabel(config.rotation)}（旋转 ${config.rotation}°）`,
    `相机垂直仰俯：${tiltLabel(config.tilt)}（俯仰 ${config.tilt}°）`,
    `景别：${zoomPromptDesc(config.zoom)}`,
    "要求：严格保留主体的身份特征、材质纹理、品牌标志和关键视觉细节，仅重构相机视角、透视关系与可见结构面，输出高质量写实结果。",
  ].join("；");
}

// ─────────────────────────────────────────────────────────────────────────────
// Draggable 3-D Cube
// ─────────────────────────────────────────────────────────────────────────────

interface DraggableCubeProps {
  rotation: number;
  tilt: number;
  zoom: AngleConfig["zoom"];
  imageUrl?: string;
  onRotationChange: (r: number) => void;
  onTiltChange: (t: number) => void;
}

function DraggableCube({
  rotation,
  tilt,
  zoom,
  imageUrl,
  onRotationChange,
  onTiltChange,
}: DraggableCubeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startRotation: number; startTilt: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const zoomEntry = ZOOM_PRESETS.find((z) => z.zoom === zoom) ?? ZOOM_PRESETS[1];
  const cssScale = zoomEntry.scale;

  const SIZE = 104;
  const HALF = SIZE / 2;

  // ── Mouse drag ──────────────────────────────────────────────────────────────
  // handleMouseDown captures rotation/tilt at the moment of press (correct deps).
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRotation: rotation,
      startTilt: tilt,
    };
    setIsDragging(true);
  }, [rotation, tilt]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const newRotation = ((drag.startRotation + dx * 0.8) % 360 + 360) % 360;
      const newTilt = Math.max(-30, Math.min(75, drag.startTilt - dy * 0.5));
      onRotationChange(Math.round(newRotation));
      onTiltChange(Math.round(newTilt));
    };
    const onUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onRotationChange, onTiltChange]);

  // ── Touch drag ──────────────────────────────────────────────────────────────
  // Keep a "latest values" ref updated via an effect (not render) so that the
  // touchstart handler can capture up-to-date rotation/tilt without forcing the
  // DOM listener effect to tear down and re-register on every angle change.
  const latestAngleRef = useRef({ rotation, tilt });
  useEffect(() => {
    latestAngleRef.current = { rotation, tilt };
  }, [rotation, tilt]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      // latestAngleRef.current is updated by a separate effect (not render) — lint-safe
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startRotation: latestAngleRef.current.rotation,
        startTilt: latestAngleRef.current.tilt,
      };
      setIsDragging(true);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const drag = dragRef.current;
      const touch = e.touches[0];
      if (!drag || !touch) return;
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      onRotationChange(Math.round(((drag.startRotation + dx * 0.8) % 360 + 360) % 360));
      onTiltChange(Math.max(-30, Math.min(75, Math.round(drag.startTilt - dy * 0.5))));
    };
    const onTouchEnd = () => {
      dragRef.current = null;
      setIsDragging(false);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRotationChange, onTiltChange]); // stable – DOM listeners registered once per mount

  const face = (transform: string, bg: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    width: SIZE,
    height: SIZE,
    transform,
    backfaceVisibility: "hidden",
    background: bg,
    border: "1px solid rgba(255,255,255,0.11)",
    borderRadius: 11,
    overflow: "hidden",
  });

  return (
    <div
      ref={containerRef}
      className="flex cursor-grab items-center justify-center select-none active:cursor-grabbing"
      style={{ width: 200, height: 200, perspective: 640 }}
      onMouseDown={handleMouseDown}
      title="拖拽旋转方块"
    >
      <div
        style={{
          width: SIZE,
          height: SIZE,
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `scale(${cssScale}) rotateX(${-tilt}deg) rotateY(${rotation}deg)`,
          transition: isDragging ? "none" : "transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94)",
          willChange: "transform",
        }}
      >
        {/* Front */}
        <div style={face(`translateZ(${HALF}px)`, "rgba(50,50,62,0.97)")}>
          <div className="flex h-full w-full items-end justify-end p-2">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 15l5-5m0 0H4m4 0v4" stroke="rgba(255,255,255,0.28)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {/* Back */}
        <div style={face(`rotateY(180deg) translateZ(${HALF}px)`, "rgba(34,34,44,0.97)")} />
        {/* Left */}
        <div style={face(`rotateY(-90deg) translateZ(${HALF}px)`, "rgba(40,40,52,0.97)")}>
          <div className="flex h-full items-start justify-start p-2.5">
            <div style={{ width: 3, height: 14, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
          </div>
        </div>
        {/* Right */}
        <div style={face(`rotateY(90deg) translateZ(${HALF}px)`, "rgba(40,40,52,0.97)")} />
        {/* Top – shows source image */}
        <div style={face(`rotateX(90deg) translateZ(${HALF}px)`, "rgba(54,54,68,0.97)")}>
          {imageUrl ? (
            <img src={imageUrl} alt="top-face" className="h-full w-full object-cover" style={{ opacity: 0.88 }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <rect x="3" y="9" width="24" height="17" rx="3" stroke="rgba(255,255,255,0.22)" strokeWidth="1.1" />
                <circle cx="10" cy="15.5" r="2.8" fill="rgba(255,255,255,0.2)" />
                <path d="M3 21l6.5-4.5 4.5 3.5 3.5-2.5L24 21" stroke="rgba(255,255,255,0.26)" strokeWidth="1.1" />
              </svg>
            </div>
          )}
        </div>
        {/* Bottom */}
        <div style={face(`rotateX(-90deg) translateZ(${HALF}px)`, "rgba(24,24,34,0.97)")} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Button Grid (horizontal 8 / vertical 4 / zoom 3)
// ─────────────────────────────────────────────────────────────────────────────

interface PresetButtonProps {
  label: string;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
}

function PresetButton({ label, active, selected, onClick, onToggleSelect }: PresetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all",
        active
          ? "border-emerald-400/60 bg-emerald-500/14 text-emerald-200"
          : "border-white/8 bg-white/[0.03] text-zinc-400 hover:border-white/16 hover:bg-white/[0.07] hover:text-zinc-200",
      ].join(" ")}
    >
      {label}
      {/* Multi-select badge */}
      <span
        role="checkbox"
        aria-checked={selected}
        title="加入批量生成"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
        className={[
          "absolute -right-1 -top-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full border text-[8px] font-bold transition-all",
          selected
            ? "border-emerald-400 bg-emerald-500 text-white"
            : "border-white/18 bg-zinc-800 text-zinc-600 hover:border-white/30",
        ].join(" ")}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AngleAdjustPanel – main export
// ─────────────────────────────────────────────────────────────────────────────

export interface MultiAngleGenerateItem {
  config: AngleConfig;
  promptPatch: string;
}

export interface AngleAdjustPanelProps {
  imageUrl?: string;
  isSubmitting?: boolean;
  /** Progress during batch generation: { current: 1-based index, total } */
  batchProgress?: { current: number; total: number };
  /** Called once per batch.  items.length >= 1 */
  onApplyMulti: (items: MultiAngleGenerateItem[]) => void | Promise<void>;
  onClose: () => void;
}

export function AngleAdjustPanel({
  imageUrl,
  isSubmitting = false,
  batchProgress,
  onApplyMulti,
  onClose,
}: AngleAdjustPanelProps) {
  // ── active "cursor" config (drives the cube) ──
  const [config, setConfig] = useState<AngleConfig>({ ...DEFAULT_CONFIG });

  // ── multi-select sets ──
  // keys: "h-{rotation}", "v-{tilt}", "z-{zoom}"
  const [selectedH, setSelectedH] = useState<Set<number>>(new Set());
  const [selectedV, setSelectedV] = useState<Set<number>>(new Set());
  const [selectedZ, setSelectedZ] = useState<Set<AngleConfig["zoom"]>>(new Set());

  const patch = useCallback((partial: Partial<AngleConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setConfig({ ...DEFAULT_CONFIG });
    setSelectedH(new Set());
    setSelectedV(new Set());
    setSelectedZ(new Set());
  }, []);

  // ── build batch list ──
  const batchItems = useMemo((): MultiAngleGenerateItem[] => {
    // At least the current cursor config is always included
    const rotations = selectedH.size > 0 ? Array.from(selectedH) : [config.rotation];
    const tilts = selectedV.size > 0 ? Array.from(selectedV) : [config.tilt];
    const zooms: AngleConfig["zoom"][] = selectedZ.size > 0 ? Array.from(selectedZ) : [config.zoom];

    const combos: MultiAngleGenerateItem[] = [];
    for (const r of rotations) {
      for (const t of tilts) {
        for (const z of zooms) {
          const cfg: AngleConfig = { rotation: r, tilt: t, zoom: z };
          combos.push({ config: cfg, promptPatch: buildAnglePromptFromConfig(cfg) });
        }
      }
    }
    return combos;
  }, [config, selectedH, selectedV, selectedZ]);

  const batchCount = batchItems.length;
  const totalCredits = batchCount * ANGLE_CREDIT_COST;

  const handleApply = useCallback(async () => {
    await onApplyMulti(batchItems);
    onClose();
  }, [batchItems, onApplyMulti, onClose]);

  // ── toggle helpers ──
  const toggleH = useCallback((r: number) => {
    setSelectedH((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  }, []);
  const toggleV = useCallback((t: number) => {
    setSelectedV((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);
  const toggleZ = useCallback((z: AngleConfig["zoom"]) => {
    setSelectedZ((prev) => {
      const next = new Set(prev);
      if (next.has(z)) next.delete(z); else next.add(z);
      return next;
    });
  }, []);

  const promptPreview = useMemo(() => buildAnglePromptFromConfig(config), [config]);

  return (
    <div
      className="w-[680px] max-w-[98vw] rounded-[22px] border border-white/10 bg-[#17181C] shadow-[0_36px_100px_rgba(0,0,0,0.6)]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Angle Studio</div>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">拖拽方块 · 选择点位 · 批量生成视角</h2>
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

      {/* ══ Body ══ */}
      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-0">

        {/* ── Left: Cube ── */}
        <div className="flex flex-col items-center gap-2 border-r border-white/6 px-3 py-4">
          <div className="flex items-center justify-center overflow-hidden rounded-[16px] border border-white/8 bg-[#232427]"
            style={{ width: 174, height: 174 }}
          >
            <DraggableCube
              rotation={config.rotation}
              tilt={config.tilt}
              zoom={config.zoom}
              imageUrl={imageUrl}
              onRotationChange={(r) => patch({ rotation: r })}
              onTiltChange={(t) => patch({ tilt: t })}
            />
          </div>

          {/* live angle badge */}
          <div className="flex w-full items-center justify-between rounded-xl border border-white/6 bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
            <span className="text-zinc-500">H</span>
            <span className="font-medium tabular-nums text-zinc-200">{config.rotation}°</span>
            <span className="mx-1 text-white/10">|</span>
            <span className="text-zinc-500">V</span>
            <span className="font-medium tabular-nums text-zinc-200">{config.tilt}°</span>
          </div>

          {/* drag hint */}
          <p className="text-center text-[10px] leading-snug text-zinc-600">
            拖拽方块调整角度<br />左右旋转 · 上下俯仰
          </p>

          <button
            type="button"
            onClick={reset}
            className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-400 transition-colors hover:border-white/14 hover:bg-white/[0.07] hover:text-zinc-200"
          >
            <RotateCcw size={11} />
            重置
          </button>
        </div>

        {/* ── Right: Presets + Prompt + Button ── */}
        <div className="flex flex-col gap-3 p-4">

          {/* ── 水平环绕 8 点位 ── */}
          <div className="rounded-[14px] border border-white/6 bg-white/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-zinc-300">水平环绕</span>
              <span className="text-[10px] text-zinc-600">点击切换 · 右上角 ✓ 加入批量</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {H_PRESETS.map((p) => (
                <PresetButton
                  key={p.rotation}
                  label={p.label}
                  active={config.rotation === p.rotation}
                  selected={selectedH.has(p.rotation)}
                  onClick={() => patch({ rotation: p.rotation })}
                  onToggleSelect={() => toggleH(p.rotation)}
                />
              ))}
            </div>
          </div>

          {/* ── 垂直俯仰 4 点位 ── */}
          <div className="rounded-[14px] border border-white/6 bg-white/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-zinc-300">垂直俯仰</span>
              <span className="text-[10px] text-zinc-600">点击切换 · 右上角 ✓ 加入批量</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {V_PRESETS.map((p) => (
                <PresetButton
                  key={p.tilt}
                  label={p.label}
                  active={config.tilt === p.tilt}
                  selected={selectedV.has(p.tilt)}
                  onClick={() => patch({ tilt: p.tilt })}
                  onToggleSelect={() => toggleV(p.tilt)}
                />
              ))}
            </div>
          </div>

          {/* ── 景别 3 点位 ── */}
          <div className="rounded-[14px] border border-white/6 bg-white/[0.025] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-zinc-300">景别缩放</span>
              <span className="text-[10px] text-zinc-600">点击切换 · 右上角 ✓ 加入批量</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p.zoom}
                  type="button"
                  onClick={() => patch({ zoom: p.zoom })}
                  className={[
                    "relative flex flex-col items-start rounded-[10px] border px-2.5 py-2 text-left transition-all",
                    config.zoom === p.zoom
                      ? "border-emerald-400/60 bg-emerald-500/12"
                      : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <span className={`text-[12px] font-semibold ${config.zoom === p.zoom ? "text-emerald-200" : "text-zinc-200"}`}>
                    {p.label}
                  </span>
                  <span className="mt-0.5 text-[10px] leading-snug text-zinc-500">{p.desc}</span>
                  {/* multi-select badge */}
                  <span
                    role="checkbox"
                    aria-checked={selectedZ.has(p.zoom)}
                    title="加入批量生成"
                    onClick={(e) => { e.stopPropagation(); toggleZ(p.zoom); }}
                    className={[
                      "absolute -right-1 -top-1 flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full border text-[8px] font-bold transition-all",
                      selectedZ.has(p.zoom)
                        ? "border-emerald-400 bg-emerald-500 text-white"
                        : "border-white/18 bg-zinc-800 text-zinc-600 hover:border-white/30",
                    ].join(" ")}
                  >
                    {selectedZ.has(p.zoom) ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Prompt preview ── */}
          <div className="rounded-[12px] border border-white/6 bg-[#1E1F24] px-3 py-2.5">
            <div className="mb-1 text-[9px] uppercase tracking-[0.15em] text-zinc-600">当前视角 Prompt</div>
            <div className="line-clamp-2 text-[11px] leading-[1.6] text-zinc-400">{promptPreview}</div>
          </div>

          {/* ── Batch summary + Generate button ── */}
          <div className="mt-auto flex items-center gap-2">
            {/* batch info */}
            <div className="flex-1 rounded-[12px] border border-white/8 bg-[#1F2024] px-3 py-2">
              <div className="text-[10px] text-zinc-600">批量生成</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-lg font-bold tabular-nums text-zinc-100">{batchCount}</span>
                <span className="text-[11px] text-zinc-500">张视角</span>
                <span className="ml-auto text-[11px] font-medium text-emerald-400">{totalCredits} 积分</span>
              </div>
              {batchCount > 1 && !batchProgress && (
                <div className="mt-1 text-[10px] text-zinc-600">
                  {selectedH.size > 0 ? `${selectedH.size} 水平` : ""}
                  {selectedH.size > 0 && (selectedV.size > 0 || selectedZ.size > 0) ? " × " : ""}
                  {selectedV.size > 0 ? `${selectedV.size} 俯仰` : ""}
                  {selectedV.size > 0 && selectedZ.size > 0 ? " × " : ""}
                  {selectedZ.size > 0 ? `${selectedZ.size} 景别` : ""}
                </div>
              )}
              {/* Progress bar shown during batch generation */}
              {batchProgress && (
                <div className="mt-1.5">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-zinc-500">正在生成第 {batchProgress.current} / {batchProgress.total} 张</span>
                    <span className="font-medium text-emerald-400">
                      {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* generate button */}
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={isSubmitting}
              className="inline-flex h-full min-h-[62px] flex-col items-center justify-center gap-1 rounded-[14px] bg-white px-4 text-zinc-900 shadow-[0_6px_20px_rgba(255,255,255,0.07)] transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} />
              )}
              <span className="text-[11px] font-bold">
                {isSubmitting
                  ? batchProgress
                    ? `${batchProgress.current}/${batchProgress.total} 生成中…`
                    : "生成中…"
                  : "开始生成"}
              </span>
            </button>
          </div>

        </div>
      </div>

      {/* ══ Footer hint ══ */}
      <div className="border-t border-white/6 px-5 py-2.5 text-[10px] text-zinc-600">
        勾选多个点位后点击「开始生成」，可一次性生成多张不同视角图像 · 每张 {ANGLE_CREDIT_COST} 积分
      </div>
    </div>
  );
}
