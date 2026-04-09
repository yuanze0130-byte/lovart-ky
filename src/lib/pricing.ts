export type BillingAction =
  | 'generate_design'
  | 'generate_image'
  | 'generate_video'
  | 'remove_background'
  | 'upscale';

export interface BillingQuoteInput {
  resolution?: '1K' | '2K' | '4K';
  aspectRatio?: '1:1' | '4:3' | '16:9';
  referenceImage?: boolean;
  seconds?: 10 | 15 | number;
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024' | string;
  scale?: 2 | 4 | number;
}

export interface BillingQuote {
  action: BillingAction;
  costCny: number;
  credits: number;
  profitRate: number;
  creditsPerYuan: number;
  detail: Record<string, string | number | boolean | null | undefined>;
}

const PROFIT_RATE = 0.05;
const CREDITS_PER_YUAN = 10;

const DEFAULT_COSTS_CNY = {
  generateDesign: 0.08,
  generateImage: {
    '1K': 0.72,
    '2K': 0.72,
    '4K': 0.72,
    referenceSurcharge: 0,
  },
  generateVideo: {
    '10': 6,
    '15': 9,
    referenceSurcharge: 0,
    sizeMultiplier: {
      '720x1280': 1,
      '1280x720': 1,
      '1024x1792': 1.08,
      '1792x1024': 1.08,
    } as Record<string, number>,
  },
  removeBackground: 0.3,
  upscale: {
    '2': 0.5,
    '4': 0.9,
  },
};

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function roundCurrency(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function costCnyToCredits(costCny: number): number {
  const credits = Math.ceil(costCny * (1 + PROFIT_RATE) * CREDITS_PER_YUAN);
  return Math.max(1, credits);
}

export function getBillableActionCostCny(action: BillingAction, input: BillingQuoteInput = {}): number {
  switch (action) {
    case 'generate_design':
      return parseEnvNumber('BILLING_COST_GENERATE_DESIGN_CNY', DEFAULT_COSTS_CNY.generateDesign);
    case 'generate_image': {
      const resolution = input.resolution || '1K';
      const base = parseEnvNumber(
        `BILLING_COST_GENERATE_IMAGE_${resolution}_CNY`,
        DEFAULT_COSTS_CNY.generateImage[resolution]
      );
      const referenceSurcharge = input.referenceImage
        ? parseEnvNumber(
            'BILLING_COST_GENERATE_IMAGE_REFERENCE_CNY',
            DEFAULT_COSTS_CNY.generateImage.referenceSurcharge
          )
        : 0;
      return base + referenceSurcharge;
    }
    case 'generate_video': {
      const seconds = String(input.seconds || 10);
      const base = parseEnvNumber(
        `BILLING_COST_GENERATE_VIDEO_${seconds}S_CNY`,
        DEFAULT_COSTS_CNY.generateVideo[seconds as '10' | '15'] || DEFAULT_COSTS_CNY.generateVideo['10']
      );
      const size = input.size || '720x1280';
      const multiplier = parseEnvNumber(
        `BILLING_MULTIPLIER_VIDEO_SIZE_${size.replace(/[^0-9x]/g, '_')}`,
        DEFAULT_COSTS_CNY.generateVideo.sizeMultiplier[size] || 1
      );
      const referenceSurcharge = input.referenceImage
        ? parseEnvNumber(
            'BILLING_COST_GENERATE_VIDEO_REFERENCE_CNY',
            DEFAULT_COSTS_CNY.generateVideo.referenceSurcharge
          )
        : 0;
      return base * multiplier + referenceSurcharge;
    }
    case 'remove_background':
      return parseEnvNumber(
        'BILLING_COST_REMOVE_BACKGROUND_CNY',
        DEFAULT_COSTS_CNY.removeBackground
      );
    case 'upscale': {
      const scale = String(input.scale || 2);
      return parseEnvNumber(
        `BILLING_COST_UPSCALE_${scale}X_CNY`,
        DEFAULT_COSTS_CNY.upscale[scale as '2' | '4'] || DEFAULT_COSTS_CNY.upscale['2']
      );
    }
    default:
      return 0;
  }
}

export function getBillingQuote(action: BillingAction, input: BillingQuoteInput = {}): BillingQuote {
  const costCny = roundCurrency(getBillableActionCostCny(action, input));
  return {
    action,
    costCny,
    credits: costCnyToCredits(costCny),
    profitRate: PROFIT_RATE,
    creditsPerYuan: CREDITS_PER_YUAN,
    detail: {
      resolution: input.resolution || null,
      aspectRatio: input.aspectRatio || null,
      referenceImage: Boolean(input.referenceImage),
      seconds: input.seconds || null,
      size: input.size || null,
      scale: input.scale || null,
    },
  };
}

export function formatCreditsLabel(credits: number): string {
  return `${credits} 积分`;
}
