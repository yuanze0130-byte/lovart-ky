"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Sparkles, Upload, X, Zap, Palette, Image as ImageIcon, Wand2, RotateCcw } from 'lucide-react';
import type { CanvasElement } from '@/components/lovart/CanvasArea';

type Resolution = '1K' | '2K' | '4K';
type AspectRatio = 'auto' | '4:3' | '8:1' | '1:1' | '3:2' | '1:8' | '9:16' | '2:3' | '4:1' | '16:9' | '4:5' | '1:4' | '3:4' | '5:4' | '21:9';
type BananaVariant = 'standard' | 'pro';
type ImageEditMode = 'generate' | 'relight' | 'restyle' | 'background' | 'enhance' | 'angle';

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
    promptDebug?: string,
  ) => Promise<void>;
  isGenerating: boolean;
  style?: React.CSSProperties;
  canvasElements: CanvasElement[];
}

const ASPECT_RATIO_OPTIONS: AspectRatio[] = ['auto', '4:3', '8:1', '1:1', '3:2', '1:8', '9:16', '2:3', '4:1', '16:9', '4:5', '1:4', '3:4', '5:4', '21:9'];

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
}: ImageGeneratorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('auto');
  const [modelVariant, setModelVariant] = useState<BananaVariant>('pro');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [editMode] = useState<ImageEditMode>(initialMode);

  const selectedElement = useMemo(
    () => canvasElements.find((item) => item.id === elementId),
    [canvasElements, elementId]
  );

  const activeMeta = MODE_META[editMode];

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const next = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setReferenceImages((prev) => [...prev, ...next].slice(0, 4));
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || isGenerating) return;

    let promptPatch = '';
    if (editMode === 'relight') {
      promptPatch = '保留主体、构图和关键形态，重点调整光线方向、受光面、阴影层次和整体氛围，让画面像重新布光后的版本。';
    }
    if (editMode === 'restyle') {
      promptPatch = '保留主体、构图和主要视觉锚点，重点调整风格、材质质感、色彩语言和整体艺术方向。';
    }
    if (editMode === 'background') {
      promptPatch = '尽量保持主体形象、姿态和构图稳定，重点替换或重构背景环境、景深关系与空间氛围。';
    }
    if (editMode === 'enhance') {
      promptPatch = '增强图片细节、材质、边缘清晰度和整体完成度，保持主体和构图稳定。';
    }
    if (editMode === 'angle') {
      promptPatch = '尽量保留主体身份、款式、材质和关键构图锚点，重点调整相机视角、朝向、透视关系与可见结构。';
    }

    await onGenerate(
      prompt.trim(),
      resolution,
      aspectRatio,
      referenceImages,
      modelVariant,
      editMode,
      promptPatch,
      editMode === 'generate' ? undefined : editMode,
      editMode === 'generate' ? undefined : activeMeta.title,
      editMode === 'generate' ? undefined : promptPatch,
    );
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
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          {activeMeta.title}
        </div>
        <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {editMode === 'generate'
            ? '下方只保留生图主功能，其它图像编辑功能请从图片 UI 工具条进入。'
            : activeMeta.subtitle}
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Prompt</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={editMode === 'generate' ? '描述你想要生成的图片...' : '描述这次图像编辑的目标...'}
          className="h-24 w-full resize-none bg-transparent text-lg text-gray-700 outline-none placeholder:text-gray-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          disabled={isGenerating}
        />

        {!!referenceImages.length && (
          <div className="mb-4 flex flex-wrap gap-2">
            {referenceImages.map((image, index) => (
              <div key={`${image}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-xl border border-gray-200">
                <img src={image} alt={`reference-${index}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setReferenceImages((prev) => prev.filter((_, idx) => idx !== index))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-gray-600">
            分辨率
            <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">
            比例
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              {ASPECT_RATIO_OPTIONS.map((ratio) => (
                <option key={ratio} value={ratio}>{ratio === 'auto' ? '自适应' : ratio}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            模型
            <select value={modelVariant} onChange={(e) => setModelVariant(e.target.value as BananaVariant)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <option value="pro">Pro</option>
              <option value="standard">Standard</option>
            </select>
          </label>
        </div>

        {selectedElement?.type === 'image-generator' && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Upload size={16} />
              添加参考图
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!prompt.trim() || isGenerating}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <activeMeta.icon size={16} />
              {isGenerating ? '生成中...' : editMode === 'generate' ? '开始生图' : `执行${activeMeta.title}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
