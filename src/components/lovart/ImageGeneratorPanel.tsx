"use client";

/* eslint-disable @next/next/no-img-element -- Generated previews are user/session data URLs, not static assets. */
import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Zap, Palette, Image as ImageIcon, Wand2, RotateCcw, Loader2, Settings2, ChevronUp, ChevronDown, Eye, EyeOff, BookOpen, Search, X, Cable } from 'lucide-react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';
import { authedFetch } from '@/lib/authed-fetch';
import type { ImagePriceQuote } from '@/lib/image-pricing';
import {
  IMAGE_MODEL_CATEGORIES,
  IMAGE_MODEL_OPTIONS,
  getImageModelDefinition,
  isImageModelId,
  type ImageGenerationExecutionMode,
  type ImageModelId,
} from '@/lib/image-models';
import { DEFAULT_IMAGE_MODEL_PREFERENCES, loadImageModelPreferences, saveImageModelPreferences, type ImageModelPreferences } from '@/lib/image-model-preferences';
import { resolveConnectedInputs } from '@/lib/canvas-connections';
import {
  PROMPT_LIBRARY_CATEGORIES,
  PROMPT_LIBRARY_ITEMS,
  type PromptLibraryCategory,
  type PromptLibraryItem,
} from '@/lib/prompt-library';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
type OfficialQuality = 'auto' | 'high' | 'medium' | 'low';
type OfficialBackground = 'auto' | 'transparent' | 'opaque';
type OfficialOutputFormat = 'png' | 'jpeg' | 'webp';
type OfficialModeration = 'auto' | 'low';

interface ImageGeneratorPanelProps {
  elementId: string;
  initialMode?: ImageEditMode;
  initialPrompt?: string;
  onGenerate: (
    prompt: string,
    resolution: Resolution,
    aspectRatio: AspectRatio,
    referenceImages?: string[],
    modelVariant?: ImageModelId,
    editMode?: ImageEditMode,
    promptPatch?: string,
    promptPresetId?: string,
    promptPresetLabel?: string,
    promptDebug?: string,
    officialOptions?: {
      quality?: OfficialQuality;
      background?: OfficialBackground;
      outputFormat?: OfficialOutputFormat;
      moderation?: OfficialModeration;
    },
    targetElementId?: string,
  ) => Promise<void>;
  isGenerating: boolean;
  style?: React.CSSProperties;
  canvasElements: CanvasElement[];
  onConfigChange?: (elementId: string, updates: Partial<CanvasElement>) => void;
  onInsertPromptLibraryItem?: (elementId: string, item: PromptLibraryItem) => void;
}

const ASPECT_RATIO_OPTIONS: AspectRatio[] = ['auto', '4:3', '8:1', '1:1', '3:2', '1:8', '9:16', '2:3', '4:1', '16:9', '4:5', '1:4', '3:4', '5:4', '21:9'];
const GPT_IMAGE_2_ASPECT_RATIO_OPTIONS: AspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'];
const GPT_IMAGE_2_OFFICIAL_ASPECT_RATIO_OPTIONS: AspectRatio[] = ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'];

const MODE_META: Record<ImageEditMode, { title: string; subtitle: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  generate: {
    title: 'Image Generator',
    subtitle: '输入提示词生成新图片。',
    icon: Sparkles,
  },
  relight: {
    title: '重打光',
    subtitle: '从图片工具条进入，调整光线和氛围。',
    icon: Zap,
  },
  restyle: {
    title: '风格迁移',
    subtitle: '从图片工具条进入，重塑风格与材质。',
    icon: Palette,
  },
  background: {
    title: '换背景',
    subtitle: '从图片工具条进入，替换场景环境。',
    icon: ImageIcon,
  },
  enhance: {
    title: '增强细节',
    subtitle: '从图片工具条进入，优化清晰度和完成度。',
    icon: Wand2,
  },
  angle: {
    title: '改角度',
    subtitle: '从图片工具条进入，调整主体视角。',
    icon: RotateCcw,
  },
};

export function ImageGeneratorPanel({
  elementId,
  initialMode = 'generate',
  initialPrompt,
  onGenerate,
  isGenerating,
  style,
  canvasElements,
  onConfigChange,
  onInsertPromptLibraryItem,
}: ImageGeneratorPanelProps) {
  const initialElement = canvasElements.find((item) => item.id === elementId);
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('auto');
  const [modelVariant, setModelVariant] = useState<ImageModelId>(
    isImageModelId(initialElement?.imageModelId) ? initialElement.imageModelId : 'nano-banana-pro'
  );
  const [outputCount, setOutputCount] = useState(
    [1, 2, 4, 8].includes(initialElement?.imageOutputCount || 0) ? initialElement?.imageOutputCount || 1 : 1
  );
  const [executionMode, setExecutionMode] = useState<ImageGenerationExecutionMode>(
    initialElement?.imageExecutionMode === 'sequential' ? 'sequential' : 'parallel'
  );
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [promptLibraryQuery, setPromptLibraryQuery] = useState('');
  const [promptLibraryCategory, setPromptLibraryCategory] = useState<PromptLibraryCategory | '全部'>('全部');
  const [modelPreferences, setModelPreferences] = useState<ImageModelPreferences>(DEFAULT_IMAGE_MODEL_PREFERENCES);
  const [editMode] = useState<ImageEditMode>(initialMode);
  const [progress, setProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');
  const [officialQuality, setOfficialQuality] = useState<OfficialQuality>('auto');
  const [officialBackground, setOfficialBackground] = useState<OfficialBackground>('auto');
  const [officialOutputFormat, setOfficialOutputFormat] = useState<OfficialOutputFormat>('png');
  const [officialModeration, setOfficialModeration] = useState<OfficialModeration>('auto');
  const [priceQuote, setPriceQuote] = useState<ImagePriceQuote | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(true);

  const selectedElement = useMemo(
    () => canvasElements.find((item) => item.id === elementId),
    [canvasElements, elementId]
  );
  const connectedInputs = useMemo(
    () => resolveConnectedInputs(elementId, canvasElements),
    [canvasElements, elementId]
  );
  const connectedReferenceImages = useMemo(
    () => Array.from(new Set(connectedInputs.references.filter(Boolean))),
    [connectedInputs.references]
  );
  const boundReferenceElement = useMemo(() => {
    const referenceId = selectedElement?.referenceImageId;
    if (!referenceId) return undefined;

    const referenceElement = canvasElements.find((item) => item.id === referenceId);
    if (referenceElement?.type !== 'image' || typeof referenceElement.content !== 'string' || !referenceElement.content) {
      return undefined;
    }

    return referenceElement;
  }, [canvasElements, selectedElement?.referenceImageId]);

  const boundReferenceImage = boundReferenceElement?.content;
  const displayedReferenceImages = useMemo(
    () => Array.from(new Set([...connectedReferenceImages, boundReferenceImage].filter((image): image is string => Boolean(image)))),
    [boundReferenceImage, connectedReferenceImages]
  );

  const isPanorama = selectedElement?.generatorKind === 'panorama';
  const modelDefinition = useMemo(() => getImageModelDefinition(modelVariant), [modelVariant]);
  const activeMeta = isPanorama
    ? { title: 'Panorama Generator', subtitle: '专用全景资产：默认超宽横向构图。', icon: Sparkles }
    : MODE_META[editMode];
  const availableAspectRatios = useMemo<AspectRatio[]>(() => (
    isPanorama
      ? ['21:9', '16:9']
      : modelDefinition.transport === 'image-task'
        ? GPT_IMAGE_2_ASPECT_RATIO_OPTIONS
        : modelDefinition.transport === 'official-image-task'
          ? GPT_IMAGE_2_OFFICIAL_ASPECT_RATIO_OPTIONS
          : ASPECT_RATIO_OPTIONS
  ), [isPanorama, modelDefinition.transport]);
  const totalCreditCost = (priceQuote?.credits || 0) * outputCount;
  const isOfficialModel = modelDefinition.transport === 'official-image-task';
  const isBusy = isGenerating || isBatchSubmitting;
  const orderedModelOptions = useMemo(() => modelPreferences.modelOrder
    .map((id) => IMAGE_MODEL_OPTIONS.find((model) => model.id === id))
    .filter((model): model is (typeof IMAGE_MODEL_OPTIONS)[number] => Boolean(model))
    .filter((model) => !modelPreferences.hiddenModelIds.includes(model.id) || model.id === modelVariant), [modelPreferences, modelVariant]);
  const filteredPromptLibraryItems = useMemo(() => {
    const normalizedQuery = promptLibraryQuery.trim().toLowerCase();
    return PROMPT_LIBRARY_ITEMS.filter((item) => (
      (promptLibraryCategory === '全部' || item.category === promptLibraryCategory)
      && (!normalizedQuery || `${item.label} ${item.summary} ${item.prompt}`.toLowerCase().includes(normalizedQuery))
    ));
  }, [promptLibraryCategory, promptLibraryQuery]);
  const hasEffectivePrompt = Boolean(connectedInputs.prompt.trim() || prompt.trim());
  const isPriceReady = Boolean(priceQuote && !priceError && !isPriceLoading);

  const updatePreferences = (next: ImageModelPreferences) => {
    setModelPreferences(next);
    saveImageModelPreferences(next);
  };

  useEffect(() => {
    const preferences = loadImageModelPreferences();
    setModelPreferences(preferences);
    if (!initialElement?.imageModelId) {
      setModelVariant(preferences.lastUsedModelId);
      setResolution(preferences.defaults.resolution);
      if (ASPECT_RATIO_OPTIONS.includes(preferences.defaults.aspectRatio as AspectRatio)) {
        setAspectRatio(preferences.defaults.aspectRatio as AspectRatio);
      }
      setOutputCount(preferences.defaults.outputCount);
      setExecutionMode(preferences.defaults.executionMode);
    }
  }, [initialElement?.imageModelId]);

  useEffect(() => {
    onConfigChange?.(elementId, {
      imageModelId: modelVariant,
      imageOutputCount: outputCount,
      imageExecutionMode: executionMode,
    });
  }, [elementId, executionMode, modelVariant, onConfigChange, outputCount]);

  useEffect(() => {
    if (isPanorama) {
      setResolution('2K');
      setAspectRatio('21:9');
      return;
    }

    if (!availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio(availableAspectRatios[0] as AspectRatio);
    }
  }, [aspectRatio, availableAspectRatios, isPanorama]);

  useEffect(() => {
    const controller = new AbortController();
    setIsPriceLoading(true);
    setPriceError(null);
    setPriceQuote(null);
    const timer = window.setTimeout(async () => {
      try {
        const response = await authedFetch('/api/image-price-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: modelVariant,
            resolution,
            referenceCount: displayedReferenceImages.length,
          }),
          signal: controller.signal,
        });
        const data = await response.json() as { quote?: ImagePriceQuote; error?: string };
        if (!response.ok || !data.quote) {
          throw new Error(data.error || '暂时无法核算该规格的积分');
        }
        setPriceQuote(data.quote);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPriceError(error instanceof Error ? error.message : '图片积分报价失败');
      } finally {
        if (!controller.signal.aborted) setIsPriceLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [displayedReferenceImages.length, modelVariant, resolution]);

  useEffect(() => {
    if (!isOfficialModel) return;

    setOfficialQuality((prev) => (prev === 'auto' ? 'high' : prev));
    setOfficialOutputFormat((prev) => (prev === 'png' ? 'png' : prev));

    if (editMode === 'background') {
      setOfficialBackground('opaque');
      return;
    }

    if (editMode === 'enhance' || editMode === 'relight' || editMode === 'restyle' || editMode === 'angle') {
      setOfficialBackground('auto');
      return;
    }
  }, [editMode, isOfficialModel]);

  /* Removed with the legacy prompt-template workflow.
      const pattern = new RegExp(`【${variable.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}】`, 'g');
      return result.replace(pattern, replacement);
    }, activeTemplate.prompt);

    setPrompt(resolvedPrompt);
  };
  */

  const handleSubmit = async () => {
    const effectivePrompt = connectedInputs.prompt.trim() || prompt.trim();
    if (!effectivePrompt || isBusy || !isPriceReady) return;

    const effectiveReferenceImages = displayedReferenceImages;
    if (modelDefinition.requiresReference && effectiveReferenceImages.length === 0) {
      alert(`${modelDefinition.label} 需要至少一张参考图。`);
      return;
    }
    if (editMode !== 'generate' && effectiveReferenceImages.length === 0) {
      alert('当前编辑模式需要至少一张参考图，请先把图片连线到当前生成器。');
      return;
    }

    setProgress(8);
    setGenerationStatus('正在提交到中转站…');
    const steps = [18, 36, 54, 72, 88];
    const labels = ['正在分析提示词…', '正在准备生成参数…', '正在连接中转站…', '中转站正在生成…', '等待中转站返回结果…'];
    let index = 0;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (index >= steps.length || prev >= 90) return prev;
        const next = steps[index] ?? prev;
        setGenerationStatus(labels[index] || '等待中转站返回结果…');
        index += 1;
        return next;
      });
    }, 600);

    const generateOne = async () => {
      await onGenerate(
        effectivePrompt,
        resolution,
        aspectRatio,
        effectiveReferenceImages,
        modelVariant,
        editMode,
        undefined,
        editMode === 'generate' ? undefined : editMode,
        editMode === 'generate' ? undefined : activeMeta.title,
        undefined,
        isOfficialModel
          ? {
              quality: officialQuality,
              background: officialBackground,
              outputFormat: officialOutputFormat,
              moderation: officialModeration,
            }
          : undefined,
        elementId,
      );
    };

    setIsBatchSubmitting(true);
    try {
      if (executionMode === 'sequential') {
        for (let index = 0; index < outputCount; index += 1) {
          setGenerationStatus(`顺序生成 ${index + 1} / ${outputCount}`);
          await generateOne();
          setProgress(Math.round(((index + 1) / outputCount) * 100));
        }
      } else {
        let completed = 0;
        await Promise.all(Array.from({ length: outputCount }, async () => {
          await generateOne();
          completed += 1;
          setGenerationStatus(`并行完成 ${completed} / ${outputCount}`);
          setProgress(Math.round((completed / outputCount) * 100));
        }));
      }
    } finally {
      setIsBatchSubmitting(false);
      window.clearInterval(timer);
      setProgress(100);
      setGenerationStatus('生成完成');
      window.setTimeout(() => {
        setProgress(0);
        setGenerationStatus('');
      }, 800);
    }
  };

  return (
    <div
      className="absolute z-50 max-h-[min(760px,calc(100vh-96px))] w-[480px] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:rounded-3xl dark:border-white/10 dark:bg-black/78 dark:shadow-[0_28px_80px_rgba(0,0,0,0.5)] dark:backdrop-blur-2xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          {activeMeta.title}
        </div>
        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {activeMeta.subtitle}
        </div>
      </div>

      <div className="p-4">
        {(isGenerating || progress > 0) && (
          <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/80 p-3 dark:border-violet-400/20 dark:bg-violet-500/10">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-200">
              <Loader2 size={14} className="animate-spin" />
              {progress >= 100 ? '生成完成' : generationStatus || '正在生成中'}
              <span className="ml-auto text-xs">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {isPanorama && (
          <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100">
            当前是全景资产：会优先使用 21:9，并保留超宽场景连续性。
          </div>
        )}

        {/* Legacy prompt-template library removed in favor of canvas prompt connections.
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-400">模板库</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">先选一个成熟模板，再按你的产品/主题替换关键词，能更快得到稳定结果。</div>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200">MVP</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTemplateCategory('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${templateCategory === 'all' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/12'}`}
            >
              全部
            </button>
            {(Object.entries(PROMPT_TEMPLATE_CATEGORY_LABELS) as Array<[PromptTemplateCategory, string]>).map(([category, label]) => (
              <button
                key={category}
                type="button"
                onClick={() => setTemplateCategory(category)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${templateCategory === category ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-white/8 dark:text-slate-300 dark:hover:bg-white/12'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleTemplateApply(template.id)}
                disabled={isGenerating}
                className={`rounded-xl border bg-white p-3 text-left transition hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/6 ${activeTemplateId === template.id ? 'border-violet-400 shadow-sm dark:border-violet-400/50' : 'border-gray-200 hover:border-violet-300 dark:border-white/10 dark:hover:border-violet-400/40'}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
                    {PROMPT_TEMPLATE_CATEGORY_LABELS[template.category]}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500">一键填充</span>
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{template.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{template.summary}</div>
                {template.suggestedAspectRatios?.length ? (
                  <div className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
                    推荐比例：{template.suggestedAspectRatios.join(' / ')}{template.defaultAspectRatio ? ` · 默认 ${template.defaultAspectRatio}` : ''}
                  </div>
                ) : null}
                {(template.recommendedModelVariant || template.recommendedResolution || template.recommendedImageMode) ? (
                  <div className="mt-1 text-[11px] text-violet-600 dark:text-violet-300">
                    推荐：
                    {template.recommendedModelVariant ? ` 模型 ${template.recommendedModelVariant}` : ''}
                    {template.recommendedResolution ? ` · ${template.recommendedResolution}` : ''}
                    {template.recommendedImageMode ? ` · 模式 ${template.recommendedImageMode}` : ''}
                  </div>
                ) : null}
              </button>
            ))}
          </div>

          {activeTemplate && activeTemplateVariables.length > 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/70 p-3 dark:border-violet-400/30 dark:bg-violet-500/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-violet-900 dark:text-violet-100">模板变量</div>
                  <div className="mt-1 text-[11px] text-violet-700/80 dark:text-violet-200/80">把占位字段补完整，再一键替换到 prompt 里。</div>
                </div>
                <button
                  type="button"
                  onClick={applyTemplateVariablesToPrompt}
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
                  disabled={isGenerating}
                >
                  应用变量
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {activeTemplateVariables.map((variable) => (
                  <label key={variable} className="text-xs text-violet-900 dark:text-violet-100">
                    <span className="mb-1 block">{variable}</span>
                    <input
                      type="text"
                      value={templateVariableValues[variable] ?? ''}
                      onChange={(event) => handleTemplateVariableChange(variable, event.target.value)}
                      placeholder={`填写${variable}`}
                      disabled={isGenerating}
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-violet-400 dark:border-violet-300/20 dark:bg-black/20 dark:text-white"
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        */}

        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          <span>Prompt</span>
          {connectedInputs.prompt && (
            <span className="rounded-full bg-amber-50 px-2 py-1 normal-case tracking-normal text-amber-700 dark:bg-amber-500/12 dark:text-amber-200">已连接提示词</span>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={editMode === 'generate' ? '描述你想要生成的图片...' : '描述这次图像编辑的目标...'}
          className="h-24 w-full resize-none bg-transparent text-lg text-gray-700 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          disabled={isGenerating}
        />

        {!!displayedReferenceImages.length && (
          <div className="mb-4">
            {selectedElement?.type === 'image-generator' && (
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                <span className={`inline-flex items-center rounded-full px-2 py-1 font-medium ${connectedReferenceImages.length > 0 || boundReferenceElement ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-200' : 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-slate-400'}`}>
                  {connectedReferenceImages.length > 0 ? `已连线 ${connectedReferenceImages.length} 张参考图` : '已绑定参考图'}
                </span>
                {(connectedReferenceImages.length > 0 || boundReferenceElement) && (
                  <span className="truncate">
                    生成时会自动使用这些图片，无需重复上传。
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {displayedReferenceImages.map((image, index) => {
                const isBoundReference = Boolean(boundReferenceImage && image === boundReferenceImage);
                const isConnectedReference = connectedReferenceImages.includes(image);

                return (
                  <div
                    key={`${image}-${index}`}
                    className={`relative h-16 w-16 overflow-hidden rounded-xl border ${isBoundReference || isConnectedReference ? 'border-emerald-400 ring-2 ring-emerald-200 dark:border-emerald-300 dark:ring-emerald-500/30' : 'border-gray-200'}`}
                  >
                    <img src={image} alt={`reference-${index}`} className="h-full w-full object-cover" />
                    {(isBoundReference || isConnectedReference) && (
                      <div className="absolute left-1 top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                        {isConnectedReference ? '连线' : '绑定'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">
            分辨率
            <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">
            比例
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
              {availableAspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>{ratio === 'auto' ? '自适应' : ratio}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            模型
            <select value={modelVariant} onChange={(e) => {
              const modelId = e.target.value as ImageModelId;
              setModelVariant(modelId);
              updatePreferences({ ...modelPreferences, lastUsedModelId: modelId });
            }} disabled={isBusy} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
              {IMAGE_MODEL_CATEGORIES.map((category) => (
                <optgroup key={category} label={category}>
                  {orderedModelOptions.filter((model) => model.category === category).map((model) => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800 dark:text-slate-100">{modelDefinition.label}</div>
              <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">{modelDefinition.description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-gray-500 shadow-sm dark:bg-white/10 dark:text-slate-300">{modelDefinition.category}</span>
              <button type="button" onClick={() => setShowModelManager((value) => !value)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm hover:text-gray-900 dark:bg-white/10 dark:text-slate-300" title="管理模型"><Settings2 size={13} /></button>
            </div>
          </div>

          {showModelManager && (
            <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-white/10">
              <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">模型显示与排序</span><button type="button" onClick={() => updatePreferences({ ...modelPreferences, defaults: { modelId: modelVariant, resolution, aspectRatio, outputCount, executionMode } })} className="rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-medium text-white dark:bg-white dark:text-black">设为全局默认</button></div>
              <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {modelPreferences.modelOrder.map((id, index) => {
                  const model = IMAGE_MODEL_OPTIONS.find((item) => item.id === id);
                  if (!model) return null;
                  const hidden = modelPreferences.hiddenModelIds.includes(id);
                  const move = (offset: number) => {
                    const nextOrder = [...modelPreferences.modelOrder];
                    const target = index + offset;
                    if (target < 0 || target >= nextOrder.length) return;
                    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
                    updatePreferences({ ...modelPreferences, modelOrder: nextOrder });
                  };
                  return <div key={id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px] dark:bg-white/5"><button type="button" onClick={() => updatePreferences({ ...modelPreferences, hiddenModelIds: hidden ? modelPreferences.hiddenModelIds.filter((item) => item !== id) : [...modelPreferences.hiddenModelIds, id] })} className="text-gray-400" title={hidden ? '显示模型' : '隐藏模型'}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button><span className={`min-w-0 flex-1 truncate ${hidden ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-slate-200'}`}>{model.label}</span><button type="button" onClick={() => move(-1)} disabled={index === 0} className="text-gray-400 disabled:opacity-25" title="上移"><ChevronUp size={13} /></button><button type="button" onClick={() => move(1)} disabled={index === modelPreferences.modelOrder.length - 1} className="text-gray-400 disabled:opacity-25" title="下移"><ChevronDown size={13} /></button></div>;
                })}
              </div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-4 border-t border-gray-200 pt-3 dark:border-white/10">
            <div>
              <div className="mb-2 text-[11px] font-medium text-gray-600 dark:text-slate-300">生成数量</div>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-black/30">
                {[1, 2, 4, 8].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setOutputCount(count)}
                    disabled={isBusy}
                    className={`h-8 rounded-md text-xs font-medium transition-colors ${outputCount === count ? 'bg-white text-black shadow-sm dark:bg-white dark:text-black' : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    {count} 张
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-medium text-gray-600 dark:text-slate-300">执行方式</div>
              <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-black/30">
                {([
                  ['parallel', '异步并行'],
                  ['sequential', '同步顺序'],
                ] as Array<[ImageGenerationExecutionMode, string]>).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setExecutionMode(mode)}
                    disabled={isBusy}
                    className={`h-8 px-3 text-xs font-medium transition-colors ${executionMode === mode ? 'rounded-md bg-white text-black shadow-sm dark:bg-white dark:text-black' : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isOfficialModel && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-gray-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-slate-200">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">Official 参数</div>
                <div className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                  更适合精细控制输出质量、背景和格式。默认建议：高质量 + PNG。
                </div>
              </div>
              <div className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-200">
                推荐精修 / 商业稿
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                质量
                <select value={officialQuality} onChange={(e) => setOfficialQuality(e.target.value as OfficialQuality)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="auto">Auto</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">High 更稳，Low 更快，Auto 交给接口策略。</div>
              </label>
              <label>
                背景
                <select value={officialBackground} onChange={(e) => setOfficialBackground(e.target.value as OfficialBackground)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="auto">Auto</option>
                  <option value="transparent">Transparent</option>
                  <option value="opaque">Opaque</option>
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">透明背景适合贴纸、电商主图素材；Opaque 更适合完整场景图。</div>
              </label>
              <label>
                输出格式
                <select value={officialOutputFormat} onChange={(e) => setOfficialOutputFormat(e.target.value as OfficialOutputFormat)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">PNG 保细节最好；JPEG 更轻；WEBP 适合网页展示。</div>
              </label>
              <label>
                审核强度
                <select value={officialModeration} onChange={(e) => setOfficialModeration(e.target.value as OfficialModeration)} disabled={isGenerating} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                </select>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">默认 Auto 更稳；只有明确需要放宽时再切 Low。</div>
              </label>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          当前：<span className="font-medium text-gray-900 dark:text-white">{modelDefinition.label}</span>
          <span className="mx-2">·</span>
          分辨率：<span className="font-medium text-gray-900 dark:text-white">{resolution}</span>
          <span className="mx-2">·</span>
          预计消耗：
          {isPriceLoading ? (
            <span className="font-medium text-gray-400">核价中...</span>
          ) : priceError ? (
            <span className="font-medium text-rose-600 dark:text-rose-300">暂不可用</span>
          ) : (
            <span className="font-medium text-violet-700 dark:text-violet-300">{totalCreditCost} 积分</span>
          )}
        </div>
        {priceError && (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
            {priceError}。为避免错误扣费，此规格已暂停生成。
          </div>
        )}

        {showPromptLibrary && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm dark:border-amber-400/20 dark:bg-amber-500/8">
            <div className="flex items-start justify-between gap-3 border-b border-amber-200/70 px-3 py-3 dark:border-amber-400/15">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <BookOpen size={15} className="text-amber-600 dark:text-amber-300" />
                  常用提示词库
                </div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">选择后会创建词库节点，并自动连到当前生成器。</div>
              </div>
              <button type="button" onClick={() => setShowPromptLibrary(false)} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label="关闭词库">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2 p-3">
              <label className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
                <Search size={14} className="shrink-0 text-gray-400" />
                <input
                  value={promptLibraryQuery}
                  onChange={(event) => setPromptLibraryQuery(event.target.value)}
                  placeholder="搜索提示词"
                  className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400 dark:text-white"
                />
              </label>

              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(['全部', ...PROMPT_LIBRARY_CATEGORIES] as const).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setPromptLibraryCategory(category)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${promptLibraryCategory === category ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-gray-500 hover:text-gray-900 dark:bg-white/8 dark:text-slate-300 dark:hover:text-white'}`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {filteredPromptLibraryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onInsertPromptLibraryItem?.(elementId, item);
                      setShowPromptLibrary(false);
                    }}
                    disabled={!onInsertPromptLibraryItem}
                    className="group flex w-full items-start gap-3 rounded-xl border border-transparent bg-white px-3 py-2.5 text-left transition hover:border-amber-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/6 dark:hover:border-amber-300/30"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-400/12 dark:text-amber-200">
                      <Cable size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-gray-800 dark:text-slate-100">{item.label}</span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500 dark:bg-white/8 dark:text-slate-400">{item.category}</span>
                      </span>
                      <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-gray-500 dark:text-slate-400">{item.summary}</span>
                    </span>
                    <span className="mt-1 shrink-0 text-[9px] font-medium text-amber-600 opacity-0 transition group-hover:opacity-100 dark:text-amber-300">连线</span>
                  </button>
                ))}
                {filteredPromptLibraryItems.length === 0 && (
                  <div className="rounded-xl bg-white px-3 py-6 text-center text-xs text-gray-400 dark:bg-white/5">没有匹配的提示词</div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedElement?.type === 'image-generator' && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowPromptLibrary((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${showPromptLibrary ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-300/40 dark:bg-amber-400/12 dark:text-amber-100' : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-300 dark:hover:border-amber-300/30 dark:hover:text-amber-100'}`}
            >
              <BookOpen size={15} />
              词库
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!hasEffectivePrompt || isBusy || !isPriceReady}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <activeMeta.icon size={16} />}
              {isBusy
                ? `生成中 ${outputCount} 张...`
                : isPriceLoading
                  ? '正在核算积分...'
                  : priceError
                    ? '当前规格暂不可用'
                : editMode === 'generate'
                  ? `生成 ${outputCount} 张 · ${totalCreditCost} 积分`
                  : `执行${activeMeta.title} · ${totalCreditCost} 积分`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
