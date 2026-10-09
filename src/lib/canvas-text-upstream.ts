export interface CanvasTextUpstream {
  apiKey: string;
  baseURL: string;
}

export function getCanvasTextUpstream(env: Record<string, string | undefined> = process.env): CanvasTextUpstream {
  const gatewayKey = env.CANVAS_GATEWAY_DEFAULT_API_KEY?.trim();
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      baseURL: (env.CANVAS_TEXT_GATEWAY_BASE_URL || 'https://doodleverse.fun/v1').replace(/\/+$/, ''),
    };
  }

  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Canvas text upstream is not configured');
  return {
    apiKey,
    baseURL: (env.XAI_BASE_URL || 'https://ai.comfly.org/v1').replace(/\/+$/, ''),
  };
}
