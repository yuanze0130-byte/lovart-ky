import type { VideoPriceQuote } from '@/lib/video-pricing';

const GATEWAY_VIDEO_MODELS = new Set([
  'doubao-seedance-2-0-260128',
  'wan2.6-i2v',
  'veo3.1',
  'veo3.1-fast',
  'veo3.1-lite',
  'veo3.1-pro',
  'veo3.1-pro-4k',
]);

export const VIDEO_GATEWAY_PRICE_SUFFIX = '-gateway-v1';

export function resolveCanvasVideoUpstream(
  quote: VideoPriceQuote,
  env: Record<string, string | undefined> = process.env,
) {
  const gatewayEnabled = env.CANVAS_GATEWAY_VIDEO_ENABLED === 'true';
  const gatewayKey = quote.group === 'veo&grok-备用1'
    ? env.CANVAS_GATEWAY_VEO_API_KEY?.trim()
    : env.CANVAS_GATEWAY_DEFAULT_API_KEY?.trim();
  const gateway = gatewayEnabled && GATEWAY_VIDEO_MODELS.has(quote.upstreamModel) && Boolean(gatewayKey);
  const apiKey = gateway ? gatewayKey : env.VIDEO_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('视频渠道密钥未配置');
  const rawBaseURL = gateway
    ? env.CANVAS_GATEWAY_VIDEO_BASE_URL || 'https://doodleverse.fun'
    : env.VIDEO_API_BASE_URL || 'https://ai.comfly.org';
  return {
    apiKey,
    baseURL: rawBaseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, ''),
    gateway,
    priceVersion: quote.priceVersion + (gateway ? VIDEO_GATEWAY_PRICE_SUFFIX : ''),
  };
}

export function resolveExistingVideoUpstream(
  priceVersion: string,
  group: string,
  env: Record<string, string | undefined> = process.env,
) {
  const gateway = priceVersion.endsWith(VIDEO_GATEWAY_PRICE_SUFFIX);
  const apiKey = gateway
    ? (group === 'veo&grok-备用1' ? env.CANVAS_GATEWAY_VEO_API_KEY : env.CANVAS_GATEWAY_DEFAULT_API_KEY)
    : env.VIDEO_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error('视频任务所属渠道密钥未配置');
  const rawBaseURL = gateway
    ? env.CANVAS_GATEWAY_VIDEO_BASE_URL || 'https://doodleverse.fun'
    : env.VIDEO_API_BASE_URL || 'https://ai.comfly.org';
  return {
    apiKey: apiKey.trim(),
    baseURL: rawBaseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, ''),
    gateway,
  };
}
