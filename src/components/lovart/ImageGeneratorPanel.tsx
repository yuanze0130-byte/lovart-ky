"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
 RelightStudioModal,
 buildRelightPromptFromConfig,
 type RelightConfig,
} from "@/components/lovart/RelightStudioModal";
import type { CanvasElement } from "@/components/lovart/CanvasArea";

type Resolution = "1K" | "2K" | "4K";
type AspectRatio = "1:1" | "4:3" | "16:9";
type ImageEditMode = "generate" | "relight" | "restyle" | "background" | "enhance" | "angle";
type BananaVariant = "standard" | "pro";

type AngleDirectionValue =
  | "front"
  | "side_left"
  | "side_right"
  | "three_quarter_left"
  | "three_quarter_right"
  | "back"
  | "top_down"
  | "low_angle";

type AngleStrengthValue = "subtle" | "moderate" | "strong";
type AngleSceneValue = "product" | "portrait" | "architecture" | "fashion";

type RestyleStyleValue =
  | "anime"
  | "oil_painting"
  | "watercolor"
  | "sketch"
  | "pixel_art"
  | "3d_render"
  | "flat_design"
  | "vintage";

type RestyleStrengthValue = "light" | "medium" | "heavy";

type BackgroundTypeValue =
  | "studio_white"
  | "studio_black"
  | "gradient"
  | "nature_forest"
  | "nature_beach"
  | "urban_city"
  | "interior_modern"
  | "abstract";

type BackgroundDepthValue = "blurred" | "medium" | "sharp";

const RESOLUTION_OPTIONS: Array<{ value: Resolution; label: string }> = [
  { value: "1K", label: "标准" },
  { value: "2K", label: "高清" },
  { value: "4K", label: "超清" },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "1:1", label: "1:1 方形" },
  { value: "4:3", label: "4:3 横屏" },
  { value: "16:9", label: "16:9 横屏" },
];

const EDIT_MODES: Array<{ value: ImageEditMode; label: string }> = [
  { value: "relight", label: "重打光" },
  { value: "angle", label: "改角度" },
  { value: "restyle", label: "重风格" },
  { value: "background", label: "换背景" },
];

const ANGLE_DIRECTION_OPTIONS = [
  { value: "front" as const, label: "正面", prompt: "front view, direct frontal angle" },
  { value: "side_left" as const, label: "左侧", prompt: "left side view, 90-degree left profile" },
  { value: "side_right" as const, label: "右侧", prompt: "right side view, 90-degree right profile" },
  { value: "three_quarter_left" as const, label: "左斜45°", prompt: "three-quarter left view, 45-degree left angle" },
  { value: "three_quarter_right" as const, label: "右斜45°", prompt: "three-quarter right view, 45-degree right angle" },
  { value: "back" as const, label: "背面", prompt: "back view, rear angle" },
  { value: "top_down" as const, label: "俯视", prompt: "top-down view, bird's eye view, overhead angle" },
  { value: "low_angle" as const, label: "仰视", prompt: "low angle view, worm's eye view, upward angle" },
] as const;

const ANGLE_STRENGTH_OPTIONS = [
  { value: "subtle" as const, label: "微调", prompt: "slight angle adjustment, subtle perspective change" },
  { value: "moderate" as const, label: "适中", prompt: "moderate angle change, clear perspective shift" },
  { value: "strong" as const, label: "明显", prompt: "strong angle change, dramatic perspective transformation" },
] as const;

const ANGLE_SCENE_OPTIONS = [
  { value: "product" as const, label: "产品摄影", prompt: "product photography style, clean background, studio lighting" },
  { value: "portrait" as const, label: "人像摄影", prompt: "portrait photography style, natural lighting, shallow depth of field" },
  { value: "architecture" as const, label: "建筑摄影", prompt: "architectural photography style, perspective correction" },
  { value: "fashion" as const, label: "时尚摄影", prompt: "fashion photography style, editorial lighting, dynamic composition" },
] as const;

const ANGLE_PRESETS = [
  { id: "product_front", label: "产品正面", direction: "front" as AngleDirectionValue, strength: "moderate" as AngleStrengthValue, scene: "product" as AngleSceneValue },
  { id: "portrait_side", label: "人像侧面", direction: "side_left" as AngleDirectionValue, strength: "moderate" as AngleStrengthValue, scene: "portrait" as AngleSceneValue },
  { id: "dramatic_low", label: "戏剧仰视", direction: "low_angle" as AngleDirectionValue, strength: "strong" as AngleStrengthValue, scene: "architecture" as AngleSceneValue },
  { id: "fashion_quarter", label: "时尚斜角", direction: "three_quarter_right" as AngleDirectionValue, strength: "moderate" as AngleStrengthValue, scene: "fashion" as AngleSceneValue },
];

const RESTYLE_STYLE_OPTIONS = [
  { value: "anime" as const, label: "动漫风格", prompt: "anime style, Japanese animation, vibrant colors, clean lines" },
  { value: "oil_painting" as const, label: "油画风格", prompt: "oil painting style, textured brushstrokes, rich colors, classical art" },
  { value: "watercolor" as const, label: "水彩风格", prompt: "watercolor style, soft edges, translucent colors, artistic" },
  { value: "sketch" as const, label: "素描风格", prompt: "pencil sketch style, black and white, detailed linework" },
  { value: "pixel_art" as const, label: "像素风格", prompt: "pixel art style, retro gaming aesthetic, pixelated" },
  { value: "3d_render" as const, label: "3D渲染", prompt: "3D render style, photorealistic, ray tracing, high detail" },
  { value: "flat_design" as const, label: "扁平设计", prompt: "flat design style, minimal, geometric shapes, bold colors" },
  { value: "vintage" as const, label: "复古风格", prompt: "vintage style, retro aesthetic, aged colors, nostalgic" },
] as const;

const RESTYLE_STRENGTH_OPTIONS = [
  { value: "light" as const, label: "轻微", prompt: "subtle style influence, maintaining original structure" },
  { value: "medium" as const, label: "中等", prompt: "balanced style transformation, clear style change" },
  { value: "heavy" as const, label: "强烈", prompt: "strong style transformation, fully reimagined in new style" },
] as const;

const RESTYLE_PRESETS = [
  { id: "anime_medium", label: "动漫中等", style: "anime" as RestyleStyleValue, strength: "medium" as RestyleStrengthValue },
  { id: "oil_heavy", label: "油画强烈", style: "oil_painting" as RestyleStyleValue, strength: "heavy" as RestyleStrengthValue },
  { id: "sketch_light", label: "素描轻微", style: "sketch" as RestyleStyleValue, strength: "light" as RestyleStrengthValue },
  { id: "vintage_medium", label: "复古中等", style: "vintage" as RestyleStyleValue, strength: "medium" as RestyleStrengthValue },
];

const BACKGROUND_TYPE_OPTIONS = [
  { value: "studio_white" as const, label: "白色背景", prompt: "pure white studio background, clean, minimal" },
  { value: "studio_black" as const, label: "黑色背景", prompt: "pure black studio background, dramatic, dark" },
  { value: "gradient" as const, label: "渐变背景", prompt: "smooth gradient background, contemporary, professional" },
  { value: "nature_forest" as const, label: "森林自然", prompt: "lush forest background, natural greenery, bokeh" },
  { value: "nature_beach" as const, label: "海滩风景", prompt: "tropical beach background, ocean, golden hour" },
  { value: "urban_city" as const, label: "城市街道", prompt: "urban city background, streets, modern architecture" },
  { value: "interior_modern" as const, label: "现代室内", prompt: "modern interior background, contemporary design, soft lighting" },
  { value: "abstract" as const, label: "抽象艺术", prompt: "abstract artistic background, creative, colorful patterns" },
] as const;

const BACKGROUND_DEPTH_OPTIONS = [
  { value: "blurred" as const, label: "背景虚化", prompt: "highly blurred background, shallow depth of field, bokeh effect" },
  { value: "medium" as const, label: "中等清晰", prompt: "medium depth of field, balanced sharpness" },
  { value: "sharp" as const, label: "全景清晰", prompt: "sharp background, deep depth of field, everything in focus" },
] as const;

const BACKGROUND_PRESETS = [
  { id: "product_white", label: "白底产品", type: "studio_white" as BackgroundTypeValue, depth: "sharp" as BackgroundDepthValue },
  { id: "portrait_bokeh", label: "人像虚化", type: "nature_forest" as BackgroundTypeValue, depth: "blurred" as BackgroundDepthValue },
  { id: "dramatic_dark", label: "暗调戏剧", type: "studio_black" as BackgroundTypeValue, depth: "medium" as BackgroundDepthValue },
  { id: "lifestyle_city", label: "街头生活", type: "urban_city" as BackgroundTypeValue, depth: "medium" as BackgroundDepthValue },
];

function buildAnglePromptPatch(direction: AngleDirectionValue, strength: AngleStrengthValue, scene: AngleSceneValue): string {
  const d = ANGLE_DIRECTION_OPTIONS.find((o) => o.value === direction);
  const s = ANGLE_STRENGTH_OPTIONS.find((o) => o.value === strength);
  const sc = ANGLE_SCENE_OPTIONS.find((o) => o.value === scene);
  const parts = ["[角度调整]"];
  if (d) parts.push(`拍摄角度：${d.label}（${d.prompt}）`);
  if (s) parts.push(`调整幅度：${s.label}（${s.prompt}）`);
  if (sc) parts.push(`拍摄场景：${sc.label}（${sc.prompt}）`);
  parts.push("保持主体特征不变，专注于角度和构图调整，高质量输出");
  return parts.join("；");
}

function buildRestylePromptPatch(style: RestyleStyleValue, strength: RestyleStrengthValue): string {
  const st = RESTYLE_STYLE_OPTIONS.find((o) => o.value === style);
  const sr = RESTYLE_STRENGTH_OPTIONS.find((o) => o.value === strength);
  const parts = ["[风格转换]"];
  if (st) parts.push(`目标风格：${st.label}（${st.prompt}）`);
  if (sr) parts.push(`转换强度：${sr.label}（${sr.prompt}）`);
  parts.push("保持主体内容识别度，风格转换自然流畅，高质量输出");
  return parts.join("；");
}

function buildBackgroundPromptPatch(type: BackgroundTypeValue, depth: BackgroundDepthValue): string {
  const bt = BACKGROUND_TYPE_OPTIONS.find((o) => o.value === type);
  const bd = BACKGROUND_DEPTH_OPTIONS.find((o) => o.value === depth);
  const parts = ["[背景替换]"];
  if (bt) parts.push(`背景类型：${bt.label}（${bt.prompt}）`);
  if (bd) parts.push(`景深效果：${bd.label}（${bd.prompt}）`);
  parts.push("主体边缘处理自然，背景融合真实，整体光照一致，高质量输出");
  return parts.join("；");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface ImageGeneratorPanelProps {
  elementId: string;
  initialMode?: ImageEditMode;
  initialPrompt?: string;
  onGenerate: (
    prompt: string,
    resolution: Resolution,
    aspectRatio: AspectRatio,
    referenceImages?: string[],
    modelVariant?: BananaVariant,
    editMode?: ImageEditMode,
    promptPatch?: string,
    promptPresetId?: string,
    promptPresetLabel?: string,
    promptDebug?: string
  ) => void;
  isGenerating?: boolean;
  canvasElements?: CanvasElement[];
  style?: React.CSSProperties;
}

export function ImageGeneratorPanel({
  elementId,
  initialMode = "generate",
  initialPrompt = "",
  onGenerate,
  isGenerating = false,
  canvasElements = [],
  style,
}: ImageGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [resolution, setResolution] = useState<Resolution>("1K");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [editMode, setEditMode] = useState<ImageEditMode>(initialMode);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [angleDirection, setAngleDirection] = useState<AngleDirectionValue>("front");
  const [angleStrength, setAngleStrength] = useState<AngleStrengthValue>("moderate");
  const [angleScene, setAngleScene] = useState<AngleSceneValue>("product");
  const [restyleStyle, setRestyleStyle] = useState<RestyleStyleValue>("anime");
  const [restyleStrength, setRestyleStrength] = useState<RestyleStrengthValue>("medium");
  const [backgroundType, setBackgroundType] = useState<BackgroundTypeValue>("studio_white");
  const [backgroundDepth, setBackgroundDepth] = useState<BackgroundDepthValue>("blurred");
  const [showRelightModal, setShowRelightModal] = useState(false);
  const [relightConfig, setRelightConfig] = useState<RelightConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentElement = canvasElements.find((el) => el.id === elementId);
  const referenceImageUrl = useMemo(() => {
    if (currentElement?.referenceImageId) {
      const source = canvasElements.find((el) => el.id === currentElement.referenceImageId);
      if (typeof source?.content === "string") return source.content;
    }
    if (typeof currentElement?.content === "string" && currentElement.type === "image") {
      return currentElement.content;
    }
    return undefined;
  }, [canvasElements, currentElement]);

  useEffect(() => {
    setEditMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReferenceImages(Array.from(e.target.files));
    }
  };

  const getActivePatch = useCallback((): string => {
    switch (editMode) {
      case "relight":
        return relightConfig
          ? buildRelightPromptFromConfig(relightConfig)
          : "（尚未配置打光，点击\"可视化打光工作室\"设置）";
      case "angle":
        return buildAnglePromptPatch(angleDirection, angleStrength, angleScene);
      case "restyle":
        return buildRestylePromptPatch(restyleStyle, restyleStrength);
      case "background":
        return buildBackgroundPromptPatch(backgroundType, backgroundDepth);
      default:
        return "";
    }
  }, [
    editMode,
    relightConfig,
    angleDirection,
    angleStrength,
    angleScene,
    restyleStyle,
    restyleStrength,
    backgroundType,
    backgroundDepth,
  ]);

  const handleGenerate = async () => {
    const patch = getActivePatch();
    const promptDebug = patch;
    const promptPresetId = editMode === "relight" && relightConfig ? "relight-studio" : undefined;
    const promptPresetLabel = editMode === "relight" ? "可视化打光工作室" : undefined;
    const referenceImagesData = await Promise.all(referenceImages.map(fileToDataUrl));

    onGenerate(
      prompt.trim() || "请基于当前参考图完成编辑",
      resolution,
      aspectRatio,
      referenceImagesData,
      "pro",
      editMode,
      patch || undefined,
      promptPresetId,
      promptPresetLabel,
      promptDebug || undefined
    );
  };

  const renderEditModeContent = () => {
    switch (editMode) {
      case "relight":
        return (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowRelightModal(true)}
              className="group relative w-full overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/18 via-indigo-500/10 to-zinc-900 px-4 py-4 text-left transition-all duration-200 hover:border-blue-400/50 hover:from-blue-500/24 hover:via-indigo-500/14 hover:to-zinc-900 hover:shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_32%)] opacity-70" />
              <div className="relative flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl shadow-inner shadow-white/10 ring-1 ring-white/10">
                  💡
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">可视化打光工作室</p>
                      <p className="mt-1 text-xs text-blue-100/75">拖拽光球、滚轮调强度，像搭影棚一样设光</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-blue-100/70">
                      Studio
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {relightConfig && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 shadow-inner shadow-black/20">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200">当前打光配置</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">将作为 prompt patch 注入到本次生成</p>
                  </div>
                  <button
                    onClick={() => setRelightConfig(null)}
                    className="rounded-full border border-red-500/20 bg-red-500/8 px-2.5 py-1 text-[10px] text-red-300 transition-colors hover:bg-red-500/14 hover:text-red-200"
                  >
                    清除配置
                  </button>
                </div>
                <p className="rounded-xl bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-zinc-300 break-all">
                  {buildRelightPromptFromConfig(relightConfig)}
                </p>
              </div>
            )}

            {!relightConfig && (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/60 px-3 py-3 text-center text-xs text-zinc-500">
                点击上方按钮进入打光工作室，通过拖拽光球直观设置光源
              </div>
            )}
          </div>
        );

      case "angle":
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">拍摄角度</span>
              <div className="grid grid-cols-4 gap-1">
                {ANGLE_DIRECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAngleDirection(opt.value)}
                    className={`py-1 rounded-lg text-xs transition-colors ${
                      angleDirection === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">调整幅度</span>
              <div className="flex gap-2">
                {ANGLE_STRENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAngleStrength(opt.value)}
                    className={`flex-1 py-1 rounded-lg text-xs transition-colors ${
                      angleStrength === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">拍摄场景</span>
              <div className="grid grid-cols-2 gap-1">
                {ANGLE_SCENE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAngleScene(opt.value)}
                    className={`py-1 rounded-lg text-xs transition-colors ${
                      angleScene === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">快捷预设</span>
              <div className="grid grid-cols-2 gap-1">
                {ANGLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setAngleDirection(preset.direction);
                      setAngleStrength(preset.strength);
                      setAngleScene(preset.scene);
                    }}
                    className="py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "restyle":
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">目标风格</span>
              <div className="grid grid-cols-4 gap-1">
                {RESTYLE_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRestyleStyle(opt.value)}
                    className={`py-1 rounded-lg text-xs transition-colors ${
                      restyleStyle === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">转换强度</span>
              <div className="flex gap-2">
                {RESTYLE_STRENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRestyleStrength(opt.value)}
                    className={`flex-1 py-1 rounded-lg text-xs transition-colors ${
                      restyleStrength === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">快捷预设</span>
              <div className="grid grid-cols-2 gap-1">
                {RESTYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setRestyleStyle(preset.style);
                      setRestyleStrength(preset.strength);
                    }}
                    className="py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "background":
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">背景类型</span>
              <div className="grid grid-cols-4 gap-1">
                {BACKGROUND_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBackgroundType(opt.value)}
                    className={`py-1 rounded-lg text-xs transition-colors ${
                      backgroundType === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">景深效果</span>
              <div className="flex gap-2">
                {BACKGROUND_DEPTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBackgroundDepth(opt.value)}
                    className={`flex-1 py-1 rounded-lg text-xs transition-colors ${
                      backgroundDepth === opt.value
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-400">快捷预设</span>
              <div className="grid grid-cols-2 gap-1">
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setBackgroundType(preset.type);
                      setBackgroundDepth(preset.depth);
                    }}
                    className="py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="fixed z-30 w-[360px] rounded-2xl border border-zinc-700 bg-[#18181b] p-4 shadow-2xl"
      style={style}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {EDIT_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setEditMode(mode.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                editMode === mode.value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {renderEditModeContent()}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">补充描述（可选）</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入额外的补充描述..."
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-400">输出分辨率</span>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-400">画面比例</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-zinc-400">参考图片（可选）</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
          >
            {referenceImages.length > 0 ? `已选择 ${referenceImages.length} 张图片` : "点击上传参考图片"}
          </button>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-60 text-sm font-semibold text-white transition-all shadow-lg"
        >
          {isGenerating ? "生成中..." : "生成图像"}
        </button>

        <RelightStudioModal
          open={showRelightModal}
          imageUrl={referenceImageUrl}
          onClose={() => setShowRelightModal(false)}
          onApply={(config) => {
            setRelightConfig(config);
            setShowRelightModal(false);
          }}
        />
      </div>
    </div>
  );
}
