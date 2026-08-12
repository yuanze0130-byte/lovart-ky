import type { VideoGenerationConfig } from '@/lib/video-models';

export const POINTS_PER_COMFLY_UNIT = 12;
export const VIDEO_MARKUP_BPS = 500;
export const VIDEO_PRICE_VERSION = '2026-08-12-v1';
const COMFLY_MICRO_UNITS = 100_000;

export interface VideoPriceInput extends VideoGenerationConfig {
  modelId: string;
}

export interface VideoPriceQuote {
  modelId: string;
  upstreamModel: string;
  group: 'default' | 'veo&grok-备用1';
  comflyCost: number;
  costMicros: number;
  markupRate: number;
  pointsPerUnit: number;
  credits: number;
  currencyUnit: 'comfly-unit';
  priceVersion: string;
  breakdown: Record<string, string | number | boolean | null>;
}

export class VideoPriceUnavailableError extends Error {
  readonly code = 'VIDEO_PRICE_UNAVAILABLE';

  constructor(message = '该模型或当前规格暂未配置可靠价格') {
    super(message);
    this.name = 'VideoPriceUnavailableError';
  }
}

export function creditsFromCostMicros(costMicros: number) {
  if (!Number.isSafeInteger(costMicros) || costMicros <= 0) {
    throw new VideoPriceUnavailableError('视频成本配置无效');
  }
  return Math.ceil((costMicros * (10_000 + VIDEO_MARKUP_BPS) * POINTS_PER_COMFLY_UNIT) / (10_000 * COMFLY_MICRO_UNITS));
}

function quote(input: VideoPriceInput, options: {
  upstreamModel?: string;
  group?: VideoPriceQuote['group'];
  costMicros: number;
  breakdown?: VideoPriceQuote['breakdown'];
}): VideoPriceQuote {
  return {
    modelId: input.modelId,
    upstreamModel: options.upstreamModel || input.modelId,
    group: options.group || 'default',
    comflyCost: options.costMicros / COMFLY_MICRO_UNITS,
    costMicros: options.costMicros,
    markupRate: VIDEO_MARKUP_BPS / 10_000,
    pointsPerUnit: POINTS_PER_COMFLY_UNIT,
    credits: creditsFromCostMicros(options.costMicros),
    currencyUnit: 'comfly-unit',
    priceVersion: VIDEO_PRICE_VERSION,
    breakdown: options.breakdown || {},
  };
}

function fixedSpecCost(
  table: Readonly<Record<string, number>>,
  key: string,
  unavailableMessage: string,
) {
  const costMicros = table[key];
  if (!costMicros) throw new VideoPriceUnavailableError(unavailableMessage);
  return costMicros;
}

const WAN_26_COSTS: Readonly<Record<string, number>> = {
  '720p:5': 300_000,
  '1080p:5': 500_000,
  '720p:10': 600_000,
  '1080p:10': 1_000_000,
  '720p:15': 900_000,
  '1080p:15': 1_500_000,
};

const KLING_26_COSTS: Readonly<Record<string, number>> = {
  'pro:false:5': 250_000,
  'pro:false:10': 500_000,
  'pro:true:5': 500_000,
  'pro:true:10': 1_000_000,
};

const KLING_25_TURBO_COSTS: Readonly<Record<string, number>> = {
  'std:5': 150_000,
  'std:10': 300_000,
  'pro:5': 250_000,
  'pro:10': 500_000,
};

const HAILUO_COSTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'MiniMax-Hailuo-2.3': {
    '768p:6': 200_000,
    '768p:10': 400_000,
    '1080p:6': 400_000,
  },
  'MiniMax-Hailuo-2.3-Fast': {
    '768p:6': 135_000,
    '768p:10': 225_005,
    '1080p:6': 230_999,
  },
  'MiniMax-Hailuo-02': {
    '512p:6': 60_000,
    '512p:10': 100_000,
    '768p:6': 200_000,
    '768p:10': 400_000,
    '1080p:6': 400_000,
  },
};

const VEO_COSTS: Readonly<Record<string, number>> = {
  'google-veo3.1-lite': 80_000,
  'google-veo3.1-fast': 120_000,
  'google-veo3.1': 120_000,
  'google-veo3.1-pro': 700_000,
  'google-veo3.1-pro-4k': 1_300_000,
};

export function quoteVideoCredits(input: VideoPriceInput): VideoPriceQuote {
  if (input.modelId === 'doubao-seedance-2-0-260128' || input.modelId === 'doubao-seedance-2-0-fast-260128') {
    const perSecondMicros = input.modelId.endsWith('-fast-260128') ? 90_000 : 100_000;
    return quote(input, {
      costMicros: perSecondMicros * input.duration,
      breakdown: { duration: input.duration, costType: 'per-second', costPerSecond: perSecondMicros / COMFLY_MICRO_UNITS },
    });
  }

  if (input.modelId === 'wan2.6-i2v') {
    const key = `${input.resolution}:${input.duration}`;
    return quote(input, {
      costMicros: fixedSpecCost(WAN_26_COSTS, key, 'Wan 2.6 当前分辨率与时长暂未配置价格'),
      breakdown: { resolution: input.resolution || null, duration: input.duration },
    });
  }

  if (input.modelId === 'kling-video-v2-6') {
    const key = `pro:${input.generateAudio}:${input.duration}`;
    return quote(input, {
      costMicros: fixedSpecCost(KLING_26_COSTS, key, 'Kling v2.6 当前声音与时长组合暂未配置价格'),
      breakdown: { qualityMode: 'pro', generateAudio: input.generateAudio, duration: input.duration },
    });
  }

  if (input.modelId === 'kling-video-v2-5-turbo') {
    const key = `${input.qualityMode}:${input.duration}`;
    return quote(input, {
      costMicros: fixedSpecCost(KLING_25_TURBO_COSTS, key, 'Kling v2.5 Turbo 当前质量与时长组合暂未配置价格'),
      breakdown: { qualityMode: input.qualityMode, duration: input.duration },
    });
  }

  if (input.modelId in HAILUO_COSTS) {
    const key = `${input.resolution}:${input.duration}`;
    return quote(input, {
      costMicros: fixedSpecCost(HAILUO_COSTS[input.modelId]!, key, 'Hailuo 当前分辨率与时长组合暂未配置价格'),
      breakdown: { resolution: input.resolution || null, duration: input.duration },
    });
  }

  if (input.modelId.startsWith('google-veo3.1')) {
    const upstreamModel = input.modelId === 'google-veo3.1-pro' && input.resolution === '4K'
      ? 'google-veo3.1-pro-4k'
      : input.modelId;
    if (input.resolution === '4K' && upstreamModel !== 'google-veo3.1-pro-4k') {
      throw new VideoPriceUnavailableError('仅 Veo 3.1 Pro 已确认 4K 价格');
    }
    return quote(input, {
      upstreamModel,
      group: 'veo&grok-备用1',
      costMicros: fixedSpecCost(VEO_COSTS, upstreamModel, 'Veo 当前规格暂未配置价格'),
      breakdown: { resolution: input.resolution || null, duration: input.duration },
    });
  }

  throw new VideoPriceUnavailableError();
}

export function isVideoPriceUnavailableError(error: unknown): error is VideoPriceUnavailableError {
  return error instanceof VideoPriceUnavailableError;
}
