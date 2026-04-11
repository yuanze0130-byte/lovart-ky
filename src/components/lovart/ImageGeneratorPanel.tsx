"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Sparkles, ChevronDown, Zap, Image as ImageIcon, Upload, X, Lightbulb, Palette, ScanSearch, Wand2 } from 'lucide-react';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = '1:1' | '4:3' | '16:9';
type BananaVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance';
type RelightDirection = 'front' | 'side-left' | 'side-right' | 'back' | 'top' | 'bottom';
type RelightIntensity = 'soft' | 'medium' | 'strong';
type RelightMood = 'natural' | 'cinematic' | 'dramatic' | 'dreamy' | 'neon';
type RelightQuality = 'soft-light' | 'hard-light' | 'rim-light' | 'volumetric';
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

const RELIGHT_DIRECTION_OPTIONS: Array<PromptPresetOption<RelightDirection>> = [
    { value: 'front', label: '正面光', prompt: '以正面主光照亮主体，保证五官或主体特征清晰可见。' },
    { value: 'side-left', label: '左侧光', prompt: '主光从画面左侧打入，形成明确的左侧受光与右侧阴影。' },
    { value: 'side-right', label: '右侧光', prompt: '主光从画面右侧打入，形成明确的右侧受光与左侧阴影。' },
    { value: 'back', label: '逆光', prompt: '使用背后逆光或轮廓光，突出主体边缘与氛围。' },
    { value: 'top', label: '顶光', prompt: '从上方打光，强调结构、层次与戏剧性阴影。' },
    { value: 'bottom', label: '底光', prompt: '从下方补光，制造强烈、非常规或悬疑感。' },
];

const RELIGHT_INTENSITY_OPTIONS: Array<PromptPresetOption<RelightIntensity>> = [
    { value: 'soft', label: '柔和', prompt: '整体光比柔和、过渡自然，避免过度死黑阴影。' },
    { value: 'medium', label: '适中', prompt: '保持清晰明暗关系，同时保留大部分细节。' },
    { value: 'strong', label: '强烈', prompt: '提升光影对比与戏剧感，允许更深的阴影层次。' },
];

const RELIGHT_MOOD_OPTIONS: Array<PromptPresetOption<RelightMood>> = [
    { value: 'natural', label: '自然', prompt: '氛围贴近自然环境光，真实可信。' },
    { value: 'cinematic', label: '电影感', prompt: '营造电影级布光与色调氛围，画面更有叙事感。' },
    { value: 'dramatic', label: '戏剧化', prompt: '强化明暗冲突与舞台感，让视觉张力更强。' },
    { value: 'dreamy', label: '梦幻', prompt: '让光线更轻盈、柔雾、带一点浪漫与空气感。' },
    { value: 'neon', label: '霓虹', prompt: '加入霓虹/都市夜景式彩色光源氛围。' },
];

const RELIGHT_QUALITY_OPTIONS: Array<PromptPresetOption<RelightQuality>> = [
    { value: 'soft-light', label: '柔光', prompt: '使用大面积柔光源，肤感/材质过渡细腻。' },
    { value: 'hard-light', label: '硬光', prompt: '使用更直接的硬光，边缘与阴影更利落。' },
    { value: 'rim-light', label: '轮廓光', prompt: '增加轮廓光或边缘高光，让主体更立体。' },
    { value: 'volumetric', label: '体积光', prompt: '加入可见光束、空气透视或体积光效果。' },
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

const RELIGHT_PRESETS: PromptControlPreset[] = [
    { id: 'portrait-studio', label: '人像棚拍', description: '正面柔光，强调自然与皮肤质感' },
    { id: 'cinematic-rim', label: '电影逆光', description: '逆光 + 轮廓光，强调戏剧层次' },
    { id: 'neon-night', label: '霓虹夜景', description: '侧光 + 霓虹氛围，适合都市感画面' },
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

function buildRelightPromptPatch({
    direction,
    intensity,
    mood,
    quality,
}: {
    direction: RelightDirection;
    intensity: RelightIntensity;
    mood: RelightMood;
    quality: RelightQuality;
}) {
    const directionPrompt = RELIGHT_DIRECTION_OPTIONS.find((option) => option.value === direction)?.prompt || '';
    const intensityPrompt = RELIGHT_INTENSITY_OPTIONS.find((option) => option.value === intensity)?.prompt || '';
    const moodPrompt = RELIGHT_MOOD_OPTIONS.find((option) => option.value === mood)?.prompt || '';
    const qualityPrompt = RELIGHT_QUALITY_OPTIONS.find((option) => option.value === quality)?.prompt || '';

    return [
        '保留主体、构图和关键形态，重点调整光线方向、受光面、阴影层次和整体氛围，让画面像重新布光后的版本。',
        `[布光方向] ${directionPrompt}`,
        `[光线强度] ${intensityPrompt}`,
        `[氛围风格] ${moodPrompt}`,
        `[光质类型] ${qualityPrompt}`,
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
        relight: {
            direction: RelightDirection;
            intensity: RelightIntensity;
            mood: RelightMood;
            quality: RelightQuality;
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
    if (editMode === 'relight') {
        return buildRelightPromptPatch(settings.relight);
    }

    if (editMode === 'restyle') {
        return buildRestylePromptPatch(settings.restyle);
    }

    if (editMode === 'background') {
        return buildBackgroundPromptPatch(settings.background);
    }

    return EDIT_MODE_OPTIONS.find((option) => option.value === editMode)?.patch || '';
}

function getActivePresetId(editMode: ImageEditMode, settings: {
    relight: {
        direction: RelightDirection;
        intensity: RelightIntensity;
        mood: RelightMood;
        quality: RelightQuality;
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
}) {
    if (editMode === 'relight') {
        if (settings.relight.direction === 'front' && settings.relight.intensity === 'soft' && settings.relight.mood === 'natural' && settings.relight.quality === 'soft-light') {
            return 'portrait-studio';
        }
        if (settings.relight.direction === 'back' && settings.relight.intensity === 'strong' && settings.relight.mood === 'cinematic' && settings.relight.quality === 'rim-light') {
            return 'cinematic-rim';
        }
        if (settings.relight.direction === 'side-right' && settings.relight.intensity === 'medium' && settings.relight.mood === 'neon' && settings.relight.quality === 'hard-light') {
            return 'neon-night';
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

export function ImageGeneratorPanel({ elementId, onGenerate, isGenerating, style, canvasElements }: ImageGeneratorPanelProps) {
    const [prompt, setPrompt] = useState('');
    const [resolution, setResolution] = useState<Resolution>('1K');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [modelVariant, setModelVariant] = useState<BananaVariant>('pro');
    const [editMode, setEditMode] = useState<ImageEditMode>('generate');
    const [referenceImages, setReferenceImages] = useState<Array<File | string>>([]);
    const [relightDirection, setRelightDirection] = useState<RelightDirection>('side-left');
    const [relightIntensity, setRelightIntensity] = useState<RelightIntensity>('medium');
    const [relightMood, setRelightMood] = useState<RelightMood>('cinematic');
    const [relightQuality, setRelightQuality] = useState<RelightQuality>('soft-light');
    const [restyleStrength, setRestyleStrength] = useState<RestyleStrength>('balanced');
    const [restylePreservation, setRestylePreservation] = useState<SubjectPreservation>('balanced');
    const [backgroundReplacementStrength, setBackgroundReplacementStrength] = useState<BackgroundReplacementStrength>('balanced');
    const [backgroundPreservation, setBackgroundPreservation] = useState<SubjectPreservation>('strict');
    const [backgroundDepth, setBackgroundDepth] = useState<BackgroundDepth>('shallow-depth');

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

    const activeModelLabel = modelOptions.find((option) => option.value === modelVariant)?.label || 'Nano Banana Pro';
    const activeEditMode = EDIT_MODE_OPTIONS.find((option) => option.value === editMode);
    const controlSettings = {
        relight: {
            direction: relightDirection,
            intensity: relightIntensity,
            mood: relightMood,
            quality: relightQuality,
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
    const activePresets = editMode === 'relight'
        ? RELIGHT_PRESETS
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
        activePresetLabel: activePreset?.label ?? null,
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
            activePreset?.id,
            activePreset?.label,
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
        if (editMode === 'relight') {
            if (presetId === 'portrait-studio') {
                setRelightDirection('front');
                setRelightIntensity('soft');
                setRelightMood('natural');
                setRelightQuality('soft-light');
                return;
            }
            if (presetId === 'cinematic-rim') {
                setRelightDirection('back');
                setRelightIntensity('strong');
                setRelightMood('cinematic');
                setRelightQuality('rim-light');
                return;
            }
            if (presetId === 'neon-night') {
                setRelightDirection('side-right');
                setRelightIntensity('medium');
                setRelightMood('neon');
                setRelightQuality('hard-light');
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
                                onClick={() => setEditMode(option.value)}
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

            {editMode === 'relight' && (
                <div className="border-t border-gray-100 px-4 py-4 dark:border-white/10">
                    <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Relight Controls</div>
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">光线方向</div>
                            {renderSegmentedOptions({
                                options: RELIGHT_DIRECTION_OPTIONS,
                                activeValue: relightDirection,
                                onSelect: setRelightDirection,
                            })}
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">光线强度</div>
                            {renderSegmentedOptions({
                                options: RELIGHT_INTENSITY_OPTIONS,
                                activeValue: relightIntensity,
                                onSelect: setRelightIntensity,
                            })}
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">氛围风格</div>
                            {renderSegmentedOptions({
                                options: RELIGHT_MOOD_OPTIONS,
                                activeValue: relightMood,
                                onSelect: setRelightMood,
                            })}
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">光质类型</div>
                            {renderSegmentedOptions({
                                options: RELIGHT_QUALITY_OPTIONS,
                                activeValue: relightQuality,
                                onSelect: setRelightQuality,
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
    );
}
