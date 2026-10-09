export interface CanvasMusicUpstream {
  apiKey: string;
  baseURL: string;
  gateway: boolean;
}

export function getCanvasMusicUpstream(env: Record<string, string | undefined> = process.env): CanvasMusicUpstream {
  const gatewayKey = env.CANVAS_GATEWAY_DEFAULT_API_KEY?.trim();
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      baseURL: (env.CANVAS_MUSIC_GATEWAY_BASE_URL || 'https://doodleverse.fun').replace(/\/+$/, '').replace(/\/v1$/i, ''),
      gateway: true,
    };
  }
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Canvas music upstream is not configured');
  return {
    apiKey,
    baseURL: (env.XAI_BASE_URL || 'https://ai.comfly.org').replace(/\/+$/, '').replace(/\/v1$/i, ''),
    gateway: false,
  };
}
