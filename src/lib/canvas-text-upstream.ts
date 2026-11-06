export interface CanvasTextUpstream {
  apiKey: string;
  baseURL: string;
}

export type CanvasTextGroup = 'default' | 'gemini-premium' | 'domestic-special';

export function resolveCanvasTextGroup(value: unknown): CanvasTextGroup {
  if (value === undefined) return 'default';
  if (value === 'default' || value === 'gemini-premium' || value === 'domestic-special') return value;
  throw new Error('Invalid canvas text group');
}

export function getCanvasTextUpstream(env: Record<string, string | undefined> = process.env, group?: CanvasTextGroup): CanvasTextUpstream {
  const routeGroup = resolveCanvasTextGroup(group ?? env.CANVAS_TEXT_GROUP);
  const keyName = routeGroup === 'domestic-special' ? 'CANVAS_GATEWAY_DOMESTIC_SPECIAL_API_KEY'
    : routeGroup === 'gemini-premium' ? 'CANVAS_GATEWAY_GEMINI_PREMIUM_API_KEY' : 'CANVAS_GATEWAY_DEFAULT_API_KEY';
  const gatewayKey = env[keyName]?.trim();
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      baseURL: (env.CANVAS_TEXT_GATEWAY_BASE_URL || 'https://doodleverse.fun/v1').replace(/\/+$/, ''),
    };
  }

  if (routeGroup !== 'default') throw new Error('Canvas text group gateway is not configured');
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Canvas text upstream is not configured');
  return {
    apiKey,
    baseURL: (env.XAI_BASE_URL || 'https://ai.comfly.org/v1').replace(/\/+$/, ''),
  };
}
