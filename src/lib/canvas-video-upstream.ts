import type { VideoPriceQuote } from '@/lib/video-pricing';
import { createHash } from 'node:crypto';

const GATEWAY_VIDEO_MODELS = new Set([
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'viduq4-preview',
  'kling-video-v3',
  'wan2.6-i2v',
  'veo3.1',
  'veo3.1-fast',
  'veo3.1-lite',
  'veo3.1-pro',
  'veo3.1-pro-4k',
]);

export const VIDEO_GATEWAY_PRICE_SUFFIX = '-gateway-v1';

export class CanvasVideoUpstreamConfigurationError extends Error {
  readonly status = 503;
  constructor(message = '视频任务所属渠道暂不可用，请稍后重试', readonly code: 'VIDEO_CHANNEL_UNAVAILABLE' | 'VIDEO_MODEL_UNAVAILABLE' = 'VIDEO_CHANNEL_UNAVAILABLE') {
    super(message);
    this.name = 'CanvasVideoUpstreamConfigurationError';
  }
}

const modelDiscoveryCache = new Map<string, { expires: number; models: Set<string> }>();

// Discovery is read-only. It establishes credential visibility, not successful
// generation or specification pricing. Fail closed and never cache failures.
export async function assertCanvasVideoModelAvailable(upstream: { gateway: boolean; baseURL: string; apiKey: string }, model: string) {
  if (!upstream.gateway) return;
  const key = createHash('sha256').update(upstream.baseURL).update('\0').update(upstream.apiKey).digest('hex');
  const now = Date.now();
  let entry = modelDiscoveryCache.get(key);
  if (!entry || entry.expires <= now) {
    modelDiscoveryCache.delete(key);
    try {
      const response = await fetch(`${upstream.baseURL}/v1/models`, {
        headers: { Authorization: `Bearer ${upstream.apiKey}` },
        redirect: 'error', signal: AbortSignal.timeout(8000), cache: 'no-store',
      });
      if (!response.ok) throw new Error('Model discovery failed');
      const data: unknown = await response.json();
      const records = (data as { data?: unknown } | null)?.data;
      if (!Array.isArray(records) || !records.every((item) => item && typeof item.id === 'string')) throw new Error('Invalid model discovery');
      entry = { expires: Date.now() + 60_000, models: new Set(records.map((item) => item.id)) };
      for (const [cacheKey, cached] of modelDiscoveryCache) if (cached.expires <= Date.now()) modelDiscoveryCache.delete(cacheKey);
      if (modelDiscoveryCache.size >= 16) modelDiscoveryCache.delete(modelDiscoveryCache.keys().next().value!);
      modelDiscoveryCache.set(key, entry);
    } catch {
      throw new CanvasVideoUpstreamConfigurationError('暂时无法核对视频渠道，请稍后重试；本次未提交生成');
    }
  }
  if (!entry.models.has(model)) throw new CanvasVideoUpstreamConfigurationError('当前视频模型尚未接通，请选择其他模型；本次未提交生成', 'VIDEO_MODEL_UNAVAILABLE');
}

function gatewayKeyForGroup(group: string, env: Record<string, string | undefined>) {
  if (group === 'default') return env.CANVAS_GATEWAY_DEFAULT_API_KEY?.trim();
  if (group === 'veo&grok-备用1') return env.CANVAS_GATEWAY_VEO_API_KEY?.trim();
  throw new CanvasVideoUpstreamConfigurationError();
}

export function resolveCanvasVideoUpstream(
  quote: VideoPriceQuote,
  env: Record<string, string | undefined> = process.env,
) {
  const gatewayEnabled = env.CANVAS_GATEWAY_VIDEO_ENABLED === 'true';
  const gateway = gatewayEnabled && GATEWAY_VIDEO_MODELS.has(quote.upstreamModel);
  // A missing gateway credential must not silently change the billed route.
  const apiKey = gateway ? gatewayKeyForGroup(quote.group, env) : env.VIDEO_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new CanvasVideoUpstreamConfigurationError();
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
    ? gatewayKeyForGroup(group, env)
    : env.VIDEO_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new CanvasVideoUpstreamConfigurationError();
  const rawBaseURL = gateway
    ? env.CANVAS_GATEWAY_VIDEO_BASE_URL || 'https://doodleverse.fun'
    : env.VIDEO_API_BASE_URL || 'https://ai.comfly.org';
  return {
    apiKey: apiKey.trim(),
    baseURL: rawBaseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, ''),
    gateway,
  };
}
