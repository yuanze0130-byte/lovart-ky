import type { CanvasTextGroup } from './canvas-text-upstream';

// Gateway catalog IDs reviewed against the Atelier bundle. Presets contain no
// prices or credentials and never enable a model by themselves.
export const CANVAS_AI_PRESETS = {
  'deepseek-v4-flash': { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vision: false, group: 'domestic-special' },
  'deepseek-v4-pro': { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vision: false, group: 'domestic-special' },
  'mimo-v2.6-flash': { id: 'mimo-v2.6-flash', label: 'MiMo V2.6 Flash', vision: false, group: 'domestic-special' },
  'mimo-v2.6-pro': { id: 'mimo-v2.6-pro', label: 'MiMo V2.6 Pro', vision: false, group: 'domestic-special' },
  'claude-sonnet-5-5': { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', vision: false, group: 'default' },
} as const satisfies Record<string, { id: string; label: string; vision: boolean; group: CanvasTextGroup }>;

export function getCanvasAiPreset(value: unknown) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(CANVAS_AI_PRESETS, value)) {
    throw new Error('Unknown canvas model preset');
  }
  return CANVAS_AI_PRESETS[value as keyof typeof CANVAS_AI_PRESETS];
}
