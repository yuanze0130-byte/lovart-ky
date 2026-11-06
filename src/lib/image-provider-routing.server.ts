import type { ImagePriceQuote } from '@/lib/image-pricing';
import { gptImageBackupKeyForModel, imageGatewayKeyForGroup, isDoodleverseGateway } from '@/lib/image-gateway-routing';

export function normalizeProxyBaseURL(baseURL: string) {
  const trimmed = baseURL.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://doodleverse.fun/v1';
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function getProxyTargets(group: ImagePriceQuote['group'] = 'default', modelId?: string) {
  const primaryBaseURL = normalizeProxyBaseURL(process.env.GEMINI_BASE_URL || 'https://doodleverse.fun/v1');
  const usesOwnGateway = isDoodleverseGateway(primaryBaseURL);
  const primaryApiKey = usesOwnGateway ? imageGatewayKeyForGroup(group) : process.env.GEMINI_API_KEY;
  const fallbackBaseURL = process.env.GEMINI_FALLBACK_BASE_URL
    ? normalizeProxyBaseURL(process.env.GEMINI_FALLBACK_BASE_URL)
    : undefined;
  const fallbackApiKey = process.env.GEMINI_FALLBACK_API_KEY;
  const gptBackupKey = usesOwnGateway && modelId
    ? gptImageBackupKeyForModel(modelId, group)
    : undefined;

  const targets = [
    primaryApiKey ? { label: 'primary' as const, baseURL: primaryBaseURL, apiKey: primaryApiKey, routeGroup: group } : null,
    gptBackupKey ? { label: 'fallback' as const, baseURL: primaryBaseURL, apiKey: gptBackupKey, routeGroup: 'image2-4k' as const } : null,
    !usesOwnGateway && fallbackApiKey && fallbackBaseURL
      ? { label: 'fallback' as const, baseURL: fallbackBaseURL, apiKey: fallbackApiKey, routeGroup: group }
      : null,
  ].filter(Boolean) as Array<{ label: 'primary' | 'fallback'; baseURL: string; apiKey: string; routeGroup: string }>;

  return targets;
}

export function getImageTaskPollTarget(target: { baseURL: string; apiKey: string }) {
  if (!isDoodleverseGateway(target.baseURL)) return target;
  if (process.env.CANVAS_GATEWAY_IMAGE_TASK_POLL_ENABLED === 'true') return target;
  // Keep direct polling available while rolling out the read-only gateway route.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required to poll gateway image tasks');
  return {
    baseURL: normalizeProxyBaseURL(process.env.CANVAS_GATEWAY_IMAGE_TASK_POLL_BASE_URL || 'https://ai.comfly.org/v1'),
    apiKey,
  };
}
