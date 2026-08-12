import { IMAGE_MODEL_OPTIONS } from '@/lib/image-models';
import { resolveImageUpstreamModel, type ImageResolution } from '@/lib/image-model-routing';
import {
  IMAGE_PRICE_VERSION,
  isImagePriceUnavailableError,
  quoteImageCredits,
} from '@/lib/image-pricing';
import {
  normalizeVideoGenerationConfig,
  VIDEO_MODELS,
  type VideoGenerationConfig,
} from '@/lib/video-models';
import {
  isVideoPriceUnavailableError,
  quoteVideoCredits,
  VIDEO_PRICE_VERSION,
} from '@/lib/video-pricing';

export type PricingMediaType = 'image' | 'video';

export interface ModelPricingSpec {
  label: string;
  credits: number;
  note?: string;
}

export interface ModelPricingCatalogItem {
  id: string;
  label: string;
  provider: string;
  description: string;
  mediaType: PricingMediaType;
  available: boolean;
  specs: ModelPricingSpec[];
  note?: string;
}

export interface ModelPricingCatalog {
  updatedAt: string;
  imagePriceVersion: string;
  videoPriceVersion: string;
  items: ModelPricingCatalogItem[];
}

const IMAGE_RESOLUTIONS: readonly ImageResolution[] = ['1K', '2K', '4K'];

function buildImageItems(): ModelPricingCatalogItem[] {
  return IMAGE_MODEL_OPTIONS.map((model) => {
    const specs = IMAGE_RESOLUTIONS.flatMap<ModelPricingSpec>((resolution) => {
      try {
        const upstreamModel = resolveImageUpstreamModel({ modelId: model.id, resolution });
        const quote = quoteImageCredits({
          modelId: model.id,
          upstreamModel,
          resolution,
          referenceCount: 0,
        });
        return [{
          label: resolution,
          credits: quote.credits,
          note: upstreamModel === 'seedream-v5-pro' ? '不含参考图附加积分' : undefined,
        }];
      } catch (error) {
        if (isImagePriceUnavailableError(error)) return [];
        throw error;
      }
    });

    return {
      id: model.id,
      label: model.label,
      provider: model.category,
      description: model.description,
      mediaType: 'image',
      available: specs.length > 0,
      specs,
      note: specs.length > 0
        ? model.requiresReference
          ? '需要至少 1 张参考图'
          : model.id === 'seedream-5.0-pro-official'
            ? '参考图按张追加积分，生成前会显示准确报价'
            : undefined
        : '当前上游价格无法可靠核验，已暂停生成以防错误扣分',
    };
  });
}

function createVideoConfig(modelId: string, overrides: Partial<VideoGenerationConfig>) {
  return normalizeVideoGenerationConfig({ modelId, ...overrides });
}

function buildVideoSpec(
  modelId: string,
  label: string,
  overrides: Partial<VideoGenerationConfig>,
  note?: string,
): ModelPricingSpec | null {
  try {
    const config = createVideoConfig(modelId, overrides);
    const quote = quoteVideoCredits({ ...config, modelId });
    return { label, credits: quote.credits, note };
  } catch (error) {
    if (isVideoPriceUnavailableError(error)) return null;
    throw error;
  }
}

function compactSpecs(specs: Array<ModelPricingSpec | null>) {
  return specs.filter((spec): spec is ModelPricingSpec => spec !== null);
}

function getVideoSpecs(modelId: string): ModelPricingSpec[] {
  if (modelId === 'doubao-seedance-2-0-260128' || modelId === 'doubao-seedance-2-0-fast-260128') {
    return compactSpecs([
      buildVideoSpec(modelId, '4 秒', { duration: 4, resolution: '720p' }, '按视频时长计费'),
      buildVideoSpec(modelId, '10 秒', { duration: 10, resolution: '720p' }, '按视频时长计费'),
      buildVideoSpec(modelId, '15 秒', { duration: 15, resolution: '720p' }, '按视频时长计费'),
    ]);
  }

  if (modelId === 'wan2.6-i2v') {
    return compactSpecs([
      buildVideoSpec(modelId, '720p · 5 秒', { resolution: '720p', duration: 5 }),
      buildVideoSpec(modelId, '720p · 10 秒', { resolution: '720p', duration: 10 }),
      buildVideoSpec(modelId, '1080p · 5 秒', { resolution: '1080p', duration: 5 }),
      buildVideoSpec(modelId, '1080p · 10 秒', { resolution: '1080p', duration: 10 }),
    ]);
  }

  if (modelId === 'kling-video-v2-6') {
    return compactSpecs([
      buildVideoSpec(modelId, '5 秒 · 无声音', { duration: 5, generateAudio: false }),
      buildVideoSpec(modelId, '10 秒 · 无声音', { duration: 10, generateAudio: false }),
      buildVideoSpec(modelId, '5 秒 · 有声音', { duration: 5, generateAudio: true }),
      buildVideoSpec(modelId, '10 秒 · 有声音', { duration: 10, generateAudio: true }),
    ]);
  }

  if (modelId === 'kling-video-v2-5-turbo') {
    return compactSpecs([
      buildVideoSpec(modelId, '标准 · 5 秒', { duration: 5, qualityMode: 'std' }),
      buildVideoSpec(modelId, '标准 · 10 秒', { duration: 10, qualityMode: 'std' }),
      buildVideoSpec(modelId, '专业 · 5 秒', { duration: 5, qualityMode: 'pro' }),
      buildVideoSpec(modelId, '专业 · 10 秒', { duration: 10, qualityMode: 'pro' }),
    ]);
  }

  if (modelId.startsWith('MiniMax-Hailuo')) {
    return compactSpecs([
      buildVideoSpec(modelId, '768p · 6 秒', { resolution: '768p', duration: 6 }),
      buildVideoSpec(modelId, '768p · 10 秒', { resolution: '768p', duration: 10 }),
      buildVideoSpec(modelId, '1080p · 6 秒', { resolution: '1080p', duration: 6 }),
    ]);
  }

  if (modelId.startsWith('google-veo3.1')) {
    const specs = [
      buildVideoSpec(modelId, '720p · 8 秒', { resolution: '720p', duration: 8 }),
      buildVideoSpec(modelId, '1080p · 8 秒', { resolution: '1080p', duration: 8 }),
    ];
    if (modelId === 'google-veo3.1-pro') {
      specs.push(buildVideoSpec(modelId, '4K · 8 秒', { resolution: '4K', duration: 8 }));
    }
    return compactSpecs(specs);
  }

  return [];
}

function buildVideoItems(): ModelPricingCatalogItem[] {
  return VIDEO_MODELS.map((model) => {
    const specs = getVideoSpecs(model.id);
    return {
      id: model.id,
      label: model.label,
      provider: model.provider,
      description: model.hint,
      mediaType: 'video',
      available: specs.length > 0,
      specs,
      note: specs.length > 0
        ? undefined
        : '当前上游价格无法可靠核验，已暂停生成以防错误扣分',
    };
  });
}

export function buildModelPricingCatalog(): ModelPricingCatalog {
  return {
    updatedAt: '2026-08-12',
    imagePriceVersion: IMAGE_PRICE_VERSION,
    videoPriceVersion: VIDEO_PRICE_VERSION,
    items: [...buildImageItems(), ...buildVideoItems()],
  };
}
