import type { ImagePriceQuote } from '@/lib/image-pricing';

export function isDoodleverseGateway(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === 'doodleverse.fun' || hostname === 'www.doodleverse.fun';
}

export function imageGatewayKeyForGroup(
  group: ImagePriceQuote['group'],
  env: Record<string, string | undefined> = process.env,
) {
  switch (group) {
    case 'default': return env.CANVAS_GATEWAY_DEFAULT_API_KEY;
    case 'gemini-premium': return env.CANVAS_GATEWAY_GEMINI_PREMIUM_API_KEY;
    case 'domestic-special': return env.CANVAS_GATEWAY_DOMESTIC_SPECIAL_API_KEY;
  }
}

export function gptImageBackupKeyForModel(
  modelId: string,
  group: ImagePriceQuote['group'],
  env: Record<string, string | undefined> = process.env,
) {
  if (group !== 'default' || !['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].includes(modelId)) return undefined;
  return env.CANVAS_GATEWAY_GPT_IMAGE_BACKUP_API_KEY || undefined;
}

export function isGatewayPreDispatchFailure(rawText: string) {
  try {
    const parsed = JSON.parse(rawText) as { error?: { code?: unknown } };
    return parsed.error?.code === 'get_channel_failed';
  } catch {
    return false;
  }
}
