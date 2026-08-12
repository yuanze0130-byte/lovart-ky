import type { ImageModelId } from '@/lib/image-models';
import type { ImageResolution } from '@/lib/image-model-routing';

export const IMAGE_POINTS_PER_COMFLY_UNIT = 12;
export const IMAGE_MARKUP_BPS = 500;
export const IMAGE_PRICE_VERSION = 'comfly-web-2026-08-12-v1';
const COMFLY_PRICE_SCALE = 100_000;

export interface ImagePriceInput {
  modelId: ImageModelId;
  upstreamModel: string;
  resolution: ImageResolution;
  referenceCount?: number;
}

export interface ImagePriceQuote {
  modelId: ImageModelId;
  upstreamModel: string;
  resolution: ImageResolution;
  group: 'default' | 'gemini-premium' | 'domestic-special';
  comflyCost: number;
  costUnits: number;
  markupRate: number;
  pointsPerUnit: number;
  credits: number;
  currencyUnit: 'comfly-unit';
  priceVersion: string;
  breakdown: Record<string, string | number | boolean | null>;
}

export class ImagePriceUnavailableError extends Error {
  readonly code = 'IMAGE_PRICE_UNAVAILABLE';

  constructor(message = '该图片模型或当前分辨率在 Comfly 暂无可核验价格') {
    super(message);
    this.name = 'ImagePriceUnavailableError';
  }
}

export function imageCreditsFromCostUnits(costUnits: number) {
  if (!Number.isSafeInteger(costUnits) || costUnits <= 0) {
    throw new ImagePriceUnavailableError('图片成本配置无效');
  }
  return Math.ceil(
    (costUnits * (10_000 + IMAGE_MARKUP_BPS) * IMAGE_POINTS_PER_COMFLY_UNIT)
      / (10_000 * COMFLY_PRICE_SCALE),
  );
}

const FIXED_COSTS: Readonly<Record<string, { costUnits: number; group: ImagePriceQuote['group'] }>> = {
  'nano-banana': { costUnits: 16_000, group: 'gemini-premium' },
  'nano-banana-hd': { costUnits: 24_000, group: 'gemini-premium' },
  'nano-banana-2': { costUnits: 40_000, group: 'gemini-premium' },
  'nano-banana-2-2k': { costUnits: 40_000, group: 'gemini-premium' },
  'nano-banana-2-4k': { costUnits: 55_000, group: 'gemini-premium' },
  'nano-banana-pro': { costUnits: 40_000, group: 'gemini-premium' },
  'nano-banana-pro-2k': { costUnits: 40_000, group: 'gemini-premium' },
  'nano-banana-pro-4k': { costUnits: 55_000, group: 'gemini-premium' },
  'gemini-3.1-flash-lite-image': { costUnits: 10_000, group: 'gemini-premium' },
  'gemini-3.1-flash-image-preview': { costUnits: 20_000, group: 'gemini-premium' },
  'gemini-3.1-flash-image-preview-2k': { costUnits: 20_000, group: 'gemini-premium' },
  'gemini-3.1-flash-image-preview-4k': { costUnits: 27_400, group: 'gemini-premium' },
  'gemini-3.1-flash-image': { costUnits: 20_000, group: 'gemini-premium' },
  'gemini-3.1-flash-image-2k': { costUnits: 20_000, group: 'gemini-premium' },
  'gemini-3.1-flash-image-4k': { costUnits: 27_400, group: 'gemini-premium' },
  'gemini-3-pro-image': { costUnits: 40_000, group: 'gemini-premium' },
  'gemini-3-pro-image-2k': { costUnits: 40_000, group: 'gemini-premium' },
  'gemini-3-pro-image-4k': { costUnits: 55_000, group: 'gemini-premium' },
  'gemini-3-pro-image-preview': { costUnits: 40_000, group: 'gemini-premium' },
  'gemini-3-pro-image-preview-2k': { costUnits: 40_000, group: 'gemini-premium' },
  'gemini-3-pro-image-preview-4k': { costUnits: 55_000, group: 'gemini-premium' },
  'gemini-2.5-flash-image': { costUnits: 8_000, group: 'gemini-premium' },
  'gpt-4o-image': { costUnits: 5_000, group: 'default' },
  'gpt-image-1': { costUnits: 6_000, group: 'default' },
  'gpt-image-1.5': { costUnits: 6_000, group: 'default' },
  'gpt-image-2-all': { costUnits: 4_000, group: 'default' },
  'gpt-image-2': { costUnits: 6_000, group: 'default' },
  'grok-4.1-image': { costUnits: 10_000, group: 'default' },
  'grok-4.2-image': { costUnits: 12_000, group: 'default' },
  'z-image-turbo': { costUnits: 7_000, group: 'domestic-special' },
  'doubao-seedream-4-0-250828': { costUnits: 14_000, group: 'default' },
  'doubao-seedream-4-5-251128': { costUnits: 15_000, group: 'default' },
  'doubao-seedream-5-0-260128': { costUnits: 15_000, group: 'default' },
  'qwen-image-edit': { costUnits: 21_000, group: 'domestic-special' },
};

export function quoteImageCredits(input: ImagePriceInput): ImagePriceQuote {
  const referenceCount = Math.max(0, Math.min(10, Math.floor(input.referenceCount || 0)));

  if (input.upstreamModel === 'gemini-3.1-flash-lite-image' && input.resolution !== '1K') {
    throw new ImagePriceUnavailableError('Nano Banana 2 Lite 当前只支持 1K');
  }

  if (input.upstreamModel === 'gpt-image-2-all' && input.resolution !== '1K') {
    throw new ImagePriceUnavailableError('GPT Image 2 -All 当前只支持 1K');
  }

  let costUnits: number;
  let group: ImagePriceQuote['group'];
  let breakdown: ImagePriceQuote['breakdown'] = { costType: 'per-request' };

  if (input.upstreamModel === 'seedream-v5-pro') {
    const outputCostUnits = input.resolution === '1K' ? 27_000 : 54_000;
    const referenceCostUnits = referenceCount * 1_800;
    costUnits = outputCostUnits + referenceCostUnits;
    group = 'default';
    breakdown = {
      costType: 'tiered-output-plus-reference',
      outputTier: input.resolution === '1K' ? '<2360k-px' : '>2360k-px',
      outputCost: outputCostUnits / COMFLY_PRICE_SCALE,
      referenceCount,
      referenceCost: referenceCostUnits / COMFLY_PRICE_SCALE,
    };
  } else {
    const fixed = FIXED_COSTS[input.upstreamModel];
    if (!fixed) {
      throw new ImagePriceUnavailableError(`Comfly 当前未列出 ${input.upstreamModel} 的可靠价格`);
    }
    costUnits = fixed.costUnits;
    group = fixed.group;
  }

  return {
    modelId: input.modelId,
    upstreamModel: input.upstreamModel,
    resolution: input.resolution,
    group,
    comflyCost: costUnits / COMFLY_PRICE_SCALE,
    costUnits,
    markupRate: IMAGE_MARKUP_BPS / 10_000,
    pointsPerUnit: IMAGE_POINTS_PER_COMFLY_UNIT,
    credits: imageCreditsFromCostUnits(costUnits),
    currencyUnit: 'comfly-unit',
    priceVersion: IMAGE_PRICE_VERSION,
    breakdown,
  };
}

export function isImagePriceUnavailableError(error: unknown): error is ImagePriceUnavailableError {
  return error instanceof ImagePriceUnavailableError;
}
