"use client";

import React, { useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  Zap,
  Image as ImageIcon,
  Upload,
  X,
  Lightbulb,
  Palette,
  ScanSearch,
  Wand2,
  RotateCcw,
} from 'lucide-react';
import {
  RelightStudioModal,
  buildRelightPromptFromConfig,
  type RelightConfig,
} from '@/components/lovart/RelightStudioModal';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = '1:1' | '4:3' | '16:9';
type BananaVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';
type AngleDirection = 'front' | 'left-45' | 'right-45' | 'left-side' | 'right-side' | 'back' | 'top-down' | 'low-angle';
type AngleStrength = 'subtle' | 'balanced' | 'strong';
type AngleScene = 'portrait' | 'fashion' | 'product' | 'general';
type RestyleStrength = 'subtle' | 'balanced' | 'bold';
type SubjectPreservation = 'strict' | 'balanced' | 'free';
type BackgroundReplacementStrength = 'gentle' | 'balanced' | 'full';
type BackgroundDepth = 'studio' | 'shallow-depth' | 'deep-space';

type PromptControlPreset = {
  id: string;
  label: string;
  description: string;
};

interface PromptPresetOption<T extends string> {
  value: T;
  label: string;
  prompt: string;
}

const ANGLE_DIRECTION_OPTIONS: Array<PromptPresetOption<AngleDirection>> = [
  { value: 'front', label: '正面', prompt: '将主体调整为正面视角，尽量保持自然比例与正向受视面信息。' },
  { value: 'left-45', label: '左前 45°', prompt: '将主体调整到左前方 45 度视角，保留立体结构与透视关系。' },
  { value: 'right-45', label: '右前 45°', prompt: '将主体调整到右前方 45 度视角，保留立体结构与透视关系。' },
  { value: 'left-side', label: '左侧面', prompt: '将主体调整为左侧面视角，强调侧向轮廓与结构线。' },
  { value: 'right-side', label: '右侧面', prompt: '将主体调整为右侧面视角，强调侧向轮廓与结构线。' },
  { value: 'back', label: '背面', prompt: '将主体调整为背面视角，同时保持服装、发型或产品背部结构合理。' },
  { value: 'top-down', label: '俯视', prompt: '将镜头视角调整为俯视，重建透视关系并保持主体识别。' },
  { value: 'low-angle', label: '仰视', prompt: '将镜头视角调整为仰视，增强纵深与立体感。' },
];

const ANGLE_STRENGTH_OPTIONS: Array<PromptPresetOption<AngleStrength>> = [
  { value: 'subtle', label: '轻微', prompt: '仅做轻量视角修正，尽量保持原始构图和主体朝向特征。' },
  { value: 'balanced', label: '平衡', prompt: '明显改变视角，同时尽量保持主体身份、材质和关键结构。' },
  { value: 'strong', label: '强烈', prompt: '大胆改变视角与透视关系，让目标机位效果更明确。' },
];

const ANGLE_SCENE_OPTIONS: Array<PromptPresetOption<AngleScene>> = [
  { value: 'portrait', label: '人像', prompt: '优先保持人物身份、五官识别和肢体自然。' },
  { value: 'fashion', label: '服饰', prompt: '优先保持穿搭款式、版型、面料和服装层次关系。' },
  { value: 'product', label: '产品', prompt: '优先保持产品结构、边缘、材质与品牌识别特征。' },
  { value: 'general', label: '通用', prompt: '优先保持主体主要识别特征和画面可读性。' },
];

const RESTYLE_STRENGTH_OPTIONS: Array<PromptPresetOption<RestyleStrength>> = [
  { value: 'subtle', label: '轻微', prompt: '仅做轻量风格迁移，保留原始视觉语言的大部分特征。' },
  { value: 'balanced', label: '平衡', prompt: '明显切换风格语言，同时兼顾主体辨识度与原图信息。' },
  { value: 'bold', label: '强烈', prompt: '大胆重塑风格、材质与色彩表达，让新风格主导画面。' },
];

const SUBJECT_PRESERVATION_OPTIONS: Array<PromptPresetOption<SubjectPreservation>> = [
  { value: 'strict', label: '严格保留', prompt: '严格保留主体身份、轮廓、姿态与关键构图锚点。' },
  { value: 'balanced', label: '平衡保留', prompt: '优先保留主体识别特征，但允许一定程度的造型与细节风格化。' },
  { value: 'free', label: '开放重塑', prompt: '允许在保持主题相关性的前提下，对主体外观和表现形式进行更自由的重塑。' },
];

const BACKGROUND_REPLACEMENT_OPTIONS: Array<PromptPresetOption<BackgroundReplacementStrength>> = [
  { value: 'gentle', label: '轻替换', prompt: '轻量调整背景元素与氛围，保留部分原环境线索。' },
  { value: 'balanced', label: '平衡替换', prompt: '明显替换背景环境，同时尽量保持主体与场景融合自然。' },
  { value: 'full', label: '彻底替换', prompt: '完全重构背景环境，让新空间设定主导画面。' },
];

const BACKGROUND_DEPTH_OPTIONS: Array<PromptPresetOption<BackgroundDepth>> = [
  { value: 'studio', label: '纯净背景', prompt: '背景更简洁干净，像棚拍或极简布景。' },
  { value: 'shallow-depth', label: '浅景深', prompt: '背景具有轻微环境信息与虚化层次，主体更突出。' },
  { value: 'deep-space', label: '空间感', prompt: '背景拥有更完整空间纵深、透视关系与环境叙事。' },
];

const ANGLE_PRESETS: PromptControlPreset[] = [
  { id: 'portrait-left-45', label: '人像左前 45°', description: '适合人像和上半身拍摄，兼顾自然与立体感' },
  { id: 'fashion-side', label: '服饰侧面展示', description: '强调穿搭轮廓、侧面版型和层次' },
  { id: 'product-hero', label: '产品英雄角度', description: '适合商品图，强化三维结构和展示感' },
];

const RESTYLE_PRESETS: PromptControlPreset[] = [
  { id: 'editorial-fashion', label: '时尚大片', description: '平衡风格迁移，保留主体识别度' },
  { id: 'anime-repaint', label: '二次元重绘', description: '强风格化，适合插画 / 动漫方向' },
  { id: 'luxury-product', label: '高端产品图', description: '轻量风格迁移，保留材质与结构' },
];

const BACKGROUND_PRESETS: PromptControlPreset[] = [
  { id: 'minimal-studio', label: '极简棚景', description: '轻替换 + 纯净背景，适合产品/人物' },
  { id: 'cinematic-space', label: '电影场景', description: '平衡替换 + 空间纵深，适合叙事画面' },
  { id: 'fantasy-world', label: '奇幻新世界', description: '彻底替换 + 大空间感，适合世界观重构' },
];

function buildAnglePromptPatch({
  direction,
  strength,
  preservation,
  scene,
}: {
  direction: AngleDirection;
  strength: AngleStrength;
  preservation: SubjectPreservation;
  scene: AngleScene;
}) {
  const directionPrompt = ANGLE_DIRECTION_OPTIONS.find((option) => option.value === direction)?.prompt || '';
  const strengthPrompt = ANGLE_STRENGTH_OPTIONS.find((option) => option.value === strength)?.prompt || '';
  const preservationPrompt = SUBJECT_PRESERVATION_OPTIONS.find((option) => option.value === preservation)?.prompt || '';
  const scenePrompt = ANGLE_SCENE_OPTIONS.find((option) => option.value === scene)?.prompt || '';

  return [
    '尽量保留主体身份、款式、材质和关键构图锚点，重点调整相机视角、朝向、透视关系与可见结构，让结果像从目标角度重新拍摄。',
    `[目标视角] ${directionPrompt}`,
    `[改动强度] ${strengthPrompt}`,
    `[主体保留] ${preservationPrompt}`,
    `[场景优先级] ${scenePrompt}`,
  ].join('\n');
}

function buildRestylePromptPatch({
  strength,
  preservation,
}: {
  strength: RestyleStrength;
  preservation: SubjectPreservation;
}) {
  const strengthPrompt = RESTYLE_STRENGTH_OPTIONS.find((option) => option.value === strength)?.prompt || '';
  const preservationPrompt = SUBJECT_PRESERVATION_OPTIONS.find((option) => option.value === preservation)?.prompt || '';

  return [
    '尽量保留主体、构图和主要视觉锚点，重点调整风格、材质质感、色彩语言和整体艺术方向。',
    `[风格强度] ${strengthPrompt}`,
    `[主体保留] ${preservationPrompt}`,
  ].join('\n');
}

function buildBackgroundPromptPatch({
  replacement,
  preservation,
  depth,
}: {
  replacement: BackgroundReplacementStrength;
  preservation: SubjectPreservation;
  depth: BackgroundDepth;
}) {
  const replacementPrompt = BACKGROUND_REPLACEMENT_OPTIONS.find((option) => option.value === replacement)?.prompt || '';
  const preservationPrompt = SUBJECT_PRESERVATION_OPTIONS.find((option) => option.value === preservation)?.prompt || '';
  const depthPrompt = BACKGROUND_DEPTH_OPTIONS.find((option) => option.value === depth)?.prompt || '';

  return [
    '尽量保持主体形象、姿态和构图稳定，重点替换或重构背景环境、景深关系与空间氛围。',
    `[背景替换强度] ${replacementPrompt}`,
    `[主体保留] ${preservationPrompt}`,
    `[空间层次] ${depthPrompt}`,
  ].join('\n');
}

function renderSegmentedOptions<T extends string>({
  options,
  activeValue,
  onSelect,
}: {
  options: Array<PromptPresetOption<T>>;
  activeValue: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === activeValue;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-100'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-600 dark:border-white/10 dark:bg-white/6 dark:text-gray-200 dark:hover:border-sky-400/20 dark:hover:bg-white/10'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function buildPromptPatch(
  editMode: ImageEditMode,
  settings: {
    relight: { config: RelightConfig | null };
    restyle: {
      strength: RestyleStrength;
      preservation: SubjectPreservation;
    };
    background: {
      replacement: BackgroundReplacementStrength;
      preservation: SubjectPreservation;
      depth: BackgroundDepth;
    };
    angle: {
      direction: AngleDirection;
      strength: AngleStrength;
      preservation: SubjectPreservation;
      scene: AngleScene;
    };
  }
) {
  if (editMode === 'relight') {
    return settings.relight.config
      ? buildRelightPromptFromConfig(settings.relight.config)
      : '保留主体、构图和关键形态，重点调整光线方向、受光面、阴影层次和整体氛围，让画面像重新布光后的版本。';
  }

  if (editMode === 'angle') {
    return buildAnglePromptPatch(settings.angle);
  }

  if (editMode === 'restyle') {
    return buildRestylePromptPatch(settings.restyle);
  }

  if (editMode === 'background') {
    return buildBackgroundPromptPatch(settings.background);
  }

  return EDIT_MODE_OPTIONS.find((option) => option.value === editMode)?.patch || '';
}

function getActivePresetId(
  editMode: ImageEditMode,
  settings: {
    relight: { config: RelightConfig | null };
    angle: {
      direction: AngleDirection;
      strength: AngleStrength;
      preservation: SubjectPreservation;
      scene: AngleScene;
    };
    restyle: {
      strength: RestyleStrength;
      preservation: SubjectPreservation;
    };
    background: {
      replacement: BackgroundReplacementStrength;
      preservation: SubjectPreservation;
      depth: BackgroundDepth;
    };
  }
) {
  if (editMode === 'angle') {
    if (settings.angle.direction === 'left-45' && settings.angle.strength === 'balanced' && settings.angle.preservation === 'balanced' && settings.angle.scene === 'portrait') {
      return 'portrait-left-45';
    }
    if (settings.angle.direction === 'left-side' && settings.angle.strength === 'balanced' && settings.angle.preservation === 'strict' && settings.angle.scene === 'fashion') {
      return 'fashion-side';
    }
    if (settings.angle.direction === 'right-45' && settings.angle.strength === 'balanced' && settings.angle.preservation === 'strict' && settings.angle.scene === 'product') {
      return 'product-hero';
    }
  }

  if (editMode === 'restyle') {
    if (settings.restyle.strength === 'balanced' && settings.restyle.preservation === 'balanced') {
      return 'editorial-fashion';
    }
    if (settings.restyle.strength === 'bold' && settings.restyle.preservation === 'free') {
      return 'anime-repaint';
    }
    if (settings.restyle.strength === 'subtle' && settings.restyle.preservation === 'strict') {
      return 'luxury-product';
    }
  }

  if (editMode === 'background') {
    if (settings.background.replacement === 'gentle' && settings.background.preservation === 'strict' && settings.background.depth === 'studio') {
      return 'minimal-studio';
    }
    if (settings.background.replacement === 'balanced' && settings.background.preservation === 'balanced' && settings.background.depth === 'deep-space') {
      return 'cinematic-space';
    }
    if (settings.background.replacement === 'full' && settings.background.preservation === 'free' && settings.background.depth === 'deep-space') {
      return 'fantasy-world';
    }
  }

  return null;
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
  ) => Promise<void>;
  isGenerating: boolean;
  style?: React.CSSProperties;
  canvasElements?: Array<{ id: string; type: string; content?: string; referenceImageId?: string }>;
}

const EDIT_MODE_OPTIONS: Array<{
  value: ImageEditMode;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  patch: string;
}> = [
  {
    value: 'generate',
    label: '自由生成',
    hint: '标准文生图 / 图生图',
    icon: Sparkles,
    patch: '',
  },
  {
    value: 'relight',
    label: '重打光',
    hint: '保留主体，重建光线方向和氛围',
    icon: Lightbulb,
    patch: '保留主体、构图和关键形态，重点调整光线方向、受光面、阴影层次和整体氛围，让画面像重新布光后的版本。',
  },
  {
    value: 'angle',
    label: '调整角度',
    hint: '保留主体，重建视角和透视关系',
    icon: RotateCcw,
    patch: '尽量保留主体身份、款式、材质和关键构图锚点，重点调整相机视角、朝向、透视关系与可见结构，让结果像从目标角度重新拍摄。',
  },
  {
    value: 'restyle',
    label: '改风格',
    hint: '保持主体，切换风格语言',
    icon: Palette,
    patch: '尽量保留主体、构图和主要视觉锚点，重点调整风格、材质质感、色彩语言和整体艺术方向。',
  },
  {
    value: 'background',
    label: '改背景',
    hint: '主体尽量不动，重构环境',
    icon: ScanSearch,
    patch: '尽量保持主体形象、姿态和构图稳定，重点替换或重构背景环境、景深关系与空间氛围。',
  },
  {
    value: 'enhance',
    label: '高清增强',
    hint: '补细节、提质感、增强完成度',
    icon: Wand2,
    patch: '在不明显改变主体构图的前提下，增强画面细节、材质、纹理、边缘质量和整体完成度。',
  },
];

export function ImageGeneratorPanel({ elementId, initialMode, initialPrompt, onGenerate, isGenerating, style, canvasElements }: ImageGeneratorPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [modelVariant, setModelVariant] = useState<BananaVariant>('pro');
  const [editMode, setEditMode] = useState<ImageEditMode>(initialMode || 'generate');
  const [referenceImages, setReferenceImages] = useState<Array<File | string>>([]);
  const [angleDirection, setAngleDirection] = useState<AngleDirection>('left-45');
  const [angleStrength, setAngleStrength] = useState<AngleStrength>('balanced');
  const [anglePreservation, setAnglePreservation] = useState<SubjectPreservation>('balanced');
  const [angleScene, setAngleScene] = useState<AngleScene>('general');
  const [restyleStrength, setRestyleStrength] = useState<RestyleStrength>('balanced');
  const [restylePreservation, setRestylePreservation] = useState<SubjectPreservation>('balanced');
  const [backgroundReplacementStrength, setBackgroundReplacementStrength] = useState<BackgroundReplacementStrength>('balanced');
  const [backgroundPreservation, setBackgroundPreservation] = useState<SubjectPreservation>('strict');
  const [backgroundDepth, setBackgroundDepth] = useState<BackgroundDepth>('shallow-depth');
  const [relightConfig, setRelightConfig] = useState<RelightConfig | null>(null);
  const [showRelightModal, setShowRelightModal] = useState(false);

  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
  const [showReferenceMenu, setShowReferenceMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!canvasElements) return;
    const currentElement = canvasElements.find((el) => el.id === elementId);
    if (currentElement?.referenceImageId && referenceImages.length === 0) {
      const sourceImage = canvasElements.find((el) => el.id === currentElement.referenceImageId);
      if (sourceImage?.content) {
        setReferenceImages([sourceImage.content]);
      }
    }
  }, [elementId, canvasElements, referenceImages.length]);

  React.useEffect(() => {
    if (initialMode) {
      setEditMode(initialMode);
    }
  }, [initialMode, elementId]);

  React.useEffect(() => {
    if (typeof initialPrompt === 'string') {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt, elementId]);

  const resolutions: Resolution[] = ['1K', '2K', '4K'];
  const aspectRatios: AspectRatio[] = ['1:1', '4:3', '16:9'];
  const modelOptions: Array<{ value: BananaVariant; label: string }> = [
    { value: 'standard', label: 'Nano Banana 标准' },
    { value: 'pro', label: 'Nano Banana Pro' },
  ];

  const imageElements = useMemo(() => {
    if (!canvasElements) return [];
    return canvasElements.filter((el) => el.type === 'image' && el.content);
  }, [canvasElements]);

  const currentElement = useMemo(() => {
    if (!canvasElements) return undefined;
    return canvasElements.find((el) => el.id === elementId);
  }, [canvasElements, elementId]);

  const relightImageUrl = useMemo(() => {
    if (!canvasElements) return undefined;
    if (currentElement?.referenceImageId) {
      const sourceImage = canvasElements.find((el) => el.id === currentElement.referenceImageId);
      return sourceImage?.content;
    }
    if (currentElement?.type === 'image') {
      return currentElement.content;
    }
    return typeof referenceImages[0] === 'string' ? referenceImages[0] : undefined;
  }, [canvasElements, currentElement, referenceImages]);

  const activeModelLabel = modelOptions.find((option) => option.value === modelVariant)?.label || 'Nano Banana Pro';
  const activeEditMode = EDIT_MODE_OPTIONS.find((option) => option.value === editMode);
  const controlSettings = {
    relight: {
      config: relightConfig,
    },
    angle: {
      direction: angleDirection,
      strength: angleStrength,
      preservation: anglePreservation,
      scene: angleScene,
    },
    restyle: {
      strength: restyleStrength,
      preservation: restylePreservation,
    },
    background: {
      replacement: backgroundReplacementStrength,
      preservation: backgroundPreservation,
      depth: backgroundDepth,
    },
  };
  const activePresetId = getActivePresetId(editMode, controlSettings);
  const trimmedPrompt = prompt.trim();
  const activePromptPatch = buildPromptPatch(editMode, controlSettings);
  const activePresets = editMode === 'angle'
    ? ANGLE_PRESETS
    : editMode === 'restyle'
      ? RESTYLE_PRESETS
      : editMode === 'background'
        ? BACKGROUND_PRESETS
        : [];
  const activePreset = activePresets.find((preset) => preset.id === activePresetId) || null;
  const composedPrompt = activePromptPatch ? `${trimmedPrompt}\n\n[编辑意图]\n${activePromptPatch}` : trimmedPrompt;
  const promptDebug = JSON.stringify({
    modelVariant,
    editMode,
    resolution,
    aspectRatio,
    referenceCount: referenceImages.length,
    activePresetId,
    activePresetLabel: editMode === 'relight' ? (relightConfig ? '可视化打光工作室' : null) : (activePreset?.label ?? null),
    structuredPatch: activePromptPatch || null,
    finalPrompt: composedPrompt || null,
    controls: controlSettings,
  }, null, 2);

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim() && !isGenerating) {
        await handleGenerate();
      }
    }
  };

  const handleGenerate = async () => {
    const encodedReferences = await Promise.all(referenceImages.map(async (referenceImage) => {
      if (typeof referenceImage === 'string') {
        return referenceImage;
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(referenceImage);
      });
    }));

    await onGenerate(
      prompt,
      resolution,
      aspectRatio,
      encodedReferences,
      modelVariant,
      editMode,
      activePromptPatch || undefined,
      editMode === 'relight' && relightConfig ? 'relight-studio' : activePreset?.id,
      editMode === 'relight' && relightConfig ? '可视化打光工作室' : activePreset?.label,
      promptDebug
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setReferenceImages((prev) => [...prev, ...files].slice(0, 4));
    setShowReferenceMenu(false);
  };

  const handleCanvasImageSelect = (imageContent: string) => {
    setReferenceImages((prev) => [...prev, imageContent].slice(0, 4));
    setShowReferenceMenu(false);
  };

  const handleRemoveReference = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const applyPreset = (presetId: string) => {
    if (editMode === 'angle') {
      if (presetId === 'portrait-left-45') {
        setAngleDirection('left-45');
        setAngleStrength('balanced');
        setAnglePreservation('balanced');
        setAngleScene('portrait');
        return;
      }
      if (presetId === 'fashion-side') {
        setAngleDirection('left-side');
        setAngleStrength('balanced');
        setAnglePreservation('strict');
        setAngleScene('fashion');
        return;
      }
      if (presetId === 'product-hero') {
        setAngleDirection('right-45');
        setAngleStrength('balanced');
        setAnglePreservation('strict');
        setAngleScene('product');
      }
      return;
    }

    if (editMode === 'restyle') {
      if (presetId === 'editorial-fashion') {
        setRestyleStrength('balanced');
        setRestylePreservation('balanced');
        return;
      }
      if (presetId === 'anime-repaint') {
        setRestyleStrength('bold');
        setRestylePreservation('free');
        return;
      }
      if (presetId === 'luxury-product') {
        setRestyleStrength('subtle');
        setRestylePreservation('strict');
      }
      return;
    }

    if (editMode === 'background') {
      if (presetId === 'minimal-studio') {
        setBackgroundReplacementStrength('gentle');
        setBackgroundPreservation('strict');
        setBackgroundDepth('studio');
        return;
      }
      if (presetId === 'cinematic-space') {
        setBackgroundReplacementStrength('balanced');
        setBackgroundPreservation('balanced');
        setBackgroundDepth('deep-space');
        return;
      }
      if (presetId === 'fantasy-world') {
        setBackgroundReplacementStrength('full');
        setBackgroundPreservation('free');
        setBackgroundDepth('deep-space');
      }
    }
  };

  return (
    <>
      <div
        className="absolute z-50 w-[480px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:rounded-3xl dark:border-white/10 dark:bg-black/78 dark:shadow-[0_28px_80px_rgba(0,0,0,0.5)] dark:backdrop-blur-2xl"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
        />

        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Image Editing v1</div>
          <div className="grid grid-cols-2 gap-2">
            {EDIT_MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.value === editMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setEditMode(option.value);
                    if (option.value === 'relight') {
                      setShowRelightModal(true);
                    }
                  }}
                  className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-100'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-600 dark:border-white/10 dark:bg-white/6 dark:text-gray-200 dark:hover:border-sky-400/20 dark:hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon size={15} />
                    <span>{option.label}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{option.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Shot Note</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想要生成或编辑的图像..."
            className="h-24 w-full resize-none bg-transparent text-lg text-gray-700 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            disabled={isGenerating}
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {activePromptPatch ? '当前模式已启用结构化 patch' : '当前模式使用原始 prompt 直出'}
            </div>
            <button
              type="button"
              onClick={() => setShowPromptInspector((prev) => !prev)}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10"
            >
              {showPromptInspector ? '隐藏 Inspector' : '查看 Inspector'}
            </button>
          </div>

          {activePromptPatch && (
            <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100/80">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em]">Prompt Patch</div>
              <div className="whitespace-pre-line">{activePromptPatch}</div>
            </div>
          )}

          {editMode === 'relight' && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-300/15 dark:bg-amber-300/10 dark:text-amber-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-100/80">Relight Studio</div>
                  <div className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-100/70">
                    通过顶部「重打光」icon 打开可视化工作室，不再占用下方参数区。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRelightModal(true)}
                  className="rounded-xl border border-amber-300/70 bg-white px-3 py-1.5 text-[11px] font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-200/30 dark:bg-white/10 dark:text-amber-50 dark:hover:bg-white/15"
                >
                  打开工作室
                </button>
              </div>
            </div>
          )}

          {activePresets.length > 0 && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-300/15 dark:bg-amber-300/10 dark:text-amber-100">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-100/80">Quick Presets</div>
                  <div className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-100/70">一键套用常见参数组合，适合快速试风格</div>
                </div>
                <div className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-amber-700 shadow-sm dark:bg-black/20 dark:text-amber-100">
                  {activePresetId ? `当前：${activePresets.find((preset) => preset.id === activePresetId)?.label}` : '当前：自定义'}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {activePresets.map((preset) => {
                  const active = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className={`rounded-2xl border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-amber-300 bg-white text-amber-900 shadow-sm dark:border-amber-200/30 dark:bg-white/10 dark:text-amber-50'
                          : 'border-amber-200/80 bg-white/60 text-amber-900 hover:bg-white dark:border-amber-200/10 dark:bg-black/10 dark:text-amber-100 dark:hover:bg-black/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{preset.label}</div>
                        {active && <div className="text-[10px] font-medium uppercase tracking-[0.14em]">Active</div>}
                      </div>
                      <div className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-100/70">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showPromptInspector && (
            <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 text-xs text-gray-700 dark:border-white/10 dark:bg-white/6 dark:text-gray-200">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Prompt Inspector</div>
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">调试本次提交给生成链路的上下文</div>
                </div>
                <div className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm dark:bg-white/10 dark:text-gray-200">
                  {activeEditMode?.label || '未知模式'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Model</div>
                  <div>{activeModelLabel}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">References</div>
                  <div>{referenceImages.length} 张</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Resolution</div>
                  <div>{resolution}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Aspect Ratio</div>
                  <div>{aspectRatio}</div>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">User Prompt</div>
                  <div className="whitespace-pre-line rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] dark:border-white/10 dark:bg-black/20">
                    {trimmedPrompt || '（尚未输入 prompt）'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Structured Patch</div>
                  <div className="whitespace-pre-line rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] dark:border-white/10 dark:bg-black/20">
                    {activePromptPatch || '（当前模式无附加 patch）'}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Final Composed Prompt</div>
                  <div className="whitespace-pre-line rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] dark:border-white/10 dark:bg-black/20">
                    {composedPrompt || '（尚未形成最终 prompt）'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {editMode === 'angle' && (
          <div className="border-t border-gray-100 px-4 py-4 dark:border-white/10">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Angle Controls</div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">目标视角</div>
                {renderSegmentedOptions({
                  options: ANGLE_DIRECTION_OPTIONS,
                  activeValue: angleDirection,
                  onSelect: setAngleDirection,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">改动强度</div>
                {renderSegmentedOptions({
                  options: ANGLE_STRENGTH_OPTIONS,
                  activeValue: angleStrength,
                  onSelect: setAngleStrength,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">主体保留</div>
                {renderSegmentedOptions({
                  options: SUBJECT_PRESERVATION_OPTIONS,
                  activeValue: anglePreservation,
                  onSelect: setAnglePreservation,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">场景类型</div>
                {renderSegmentedOptions({
                  options: ANGLE_SCENE_OPTIONS,
                  activeValue: angleScene,
                  onSelect: setAngleScene,
                })}
              </div>
            </div>
          </div>
        )}

        {editMode === 'restyle' && (
          <div className="border-t border-gray-100 px-4 py-4 dark:border-white/10">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Restyle Controls</div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">风格强度</div>
                {renderSegmentedOptions({
                  options: RESTYLE_STRENGTH_OPTIONS,
                  activeValue: restyleStrength,
                  onSelect: setRestyleStrength,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">主体保留</div>
                {renderSegmentedOptions({
                  options: SUBJECT_PRESERVATION_OPTIONS,
                  activeValue: restylePreservation,
                  onSelect: setRestylePreservation,
                })}
              </div>
            </div>
          </div>
        )}

        {editMode === 'background' && (
          <div className="border-t border-gray-100 px-4 py-4 dark:border-white/10">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Background Controls</div>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">替换强度</div>
                {renderSegmentedOptions({
                  options: BACKGROUND_REPLACEMENT_OPTIONS,
                  activeValue: backgroundReplacementStrength,
                  onSelect: setBackgroundReplacementStrength,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">主体保留</div>
                {renderSegmentedOptions({
                  options: SUBJECT_PRESERVATION_OPTIONS,
                  activeValue: backgroundPreservation,
                  onSelect: setBackgroundPreservation,
                })}
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">空间层次</div>
                {renderSegmentedOptions({
                  options: BACKGROUND_DEPTH_OPTIONS,
                  activeValue: backgroundDepth,
                  onSelect: setBackgroundDepth,
                })}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-100 px-4 py-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Reference Images</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">最多 4 张</div>
          </div>
          {referenceImages.length > 0 && (
            <div className="mb-3 grid grid-cols-4 gap-2">
              {referenceImages.map((referenceImage, index) => {
                const preview = typeof referenceImage === 'string'
                  ? referenceImage
                  : URL.createObjectURL(referenceImage);
                return (
                  <div key={`${index}-${preview}`} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/6">
                    <img src={preview} alt={`reference-${index + 1}`} className="h-16 w-full object-cover" />
                    <button
                      onClick={() => handleRemoveReference(index)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowReferenceMenu(!showReferenceMenu)}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors ${
                  referenceImages.length > 0
                    ? 'bg-blue-50 text-blue-600 dark:bg-sky-400/14 dark:text-sky-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/8 dark:text-gray-300 dark:hover:bg-white/12'
                }`}
              >
                <Upload size={14} />
                添加参考图
              </button>
              {showReferenceMenu && (
                <div className="absolute bottom-full left-0 z-10 mb-1 min-w-[160px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                  <div
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowReferenceMenu(false);
                    }}
                    className="cursor-pointer px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                  >
                    上传图片
                  </div>
                  {imageElements.length > 0 && (
                    <>
                      <div className="my-1 border-t border-gray-100 dark:border-white/10" />
                      <div className="px-2 py-1 text-xs text-gray-500">画布图片</div>
                      <div className="max-h-[200px] overflow-y-auto">
                        {imageElements.map((el, idx) => (
                          <div
                            key={el.id}
                            onClick={() => handleCanvasImageSelect(el.content!)}
                            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/8"
                          >
                            <ImageIcon size={14} />
                            <span>图片 {idx + 1}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">支持多图参考、图生图编辑</div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-white/10 dark:bg-gray-900/70">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/8"
              >
                <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black dark:bg-sky-400/20">
                  <Sparkles size={8} className="text-white dark:text-sky-100" />
                </div>
                <span>{activeModelLabel}</span>
                <ChevronDown size={12} className="text-slate-500" />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full left-0 z-10 mb-1 min-w-[160px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                  {modelOptions.map((option) => (
                    <div
                      key={option.value}
                      onClick={() => {
                        setModelVariant(option.value);
                        setShowModelMenu(false);
                      }}
                      className={`cursor-pointer px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/8 ${
                        modelVariant === option.value ? 'font-medium text-blue-500 dark:text-sky-300' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div
                onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8"
              >
                <span>{resolution}</span>
                <ChevronDown size={12} />
              </div>
              {showResolutionMenu && (
                <div className="absolute bottom-full z-10 mb-1 min-w-[60px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                  {resolutions.map((res) => (
                    <div
                      key={res}
                      onClick={() => {
                        setResolution(res);
                        setShowResolutionMenu(false);
                      }}
                      className={`cursor-pointer px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-white/8 ${
                        resolution === res ? 'font-medium text-blue-600 dark:text-sky-300' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {res}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div
                onClick={() => setShowAspectRatioMenu(!showAspectRatioMenu)}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/8"
              >
                <span>{aspectRatio}</span>
                <ChevronDown size={12} />
              </div>
              {showAspectRatioMenu && (
                <div className="absolute bottom-full z-10 mb-1 min-w-[60px] rounded-lg border border-gray-100 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-gray-950/96">
                  {aspectRatios.map((ratio) => (
                    <div
                      key={ratio}
                      onClick={() => {
                        setAspectRatio(ratio);
                        setShowAspectRatioMenu(false);
                      }}
                      className={`cursor-pointer px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-white/8 ${
                        aspectRatio === ratio ? 'font-medium text-blue-600 dark:text-sky-300' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {ratio}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => prompt.trim() && !isGenerating && handleGenerate()}
            disabled={!prompt.trim() || isGenerating}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 transition-all ${
              prompt.trim() && !isGenerating
                ? 'bg-black text-white shadow-md hover:bg-gray-800 dark:bg-gradient-to-r dark:from-sky-400 dark:via-blue-500 dark:to-indigo-500 dark:shadow-[0_12px_30px_rgba(37,99,235,0.35)] dark:hover:brightness-110'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/8 dark:text-slate-500'
            }`}
          >
            <Zap size={16} className={isGenerating ? 'animate-pulse' : 'fill-current'} />
            <span className="font-medium">40</span>
          </button>
        </div>
      </div>

      <RelightStudioModal
        open={showRelightModal}
        imageUrl={relightImageUrl}
        onClose={() => setShowRelightModal(false)}
        onApply={(config) => {
          setRelightConfig(config);
          setShowRelightModal(false);
        }}
      />
    </>
  );
}
