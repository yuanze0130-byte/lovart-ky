import type { CanvasAiModel } from './canvas-ai';
import { AI_TOOL_CREDIT_COSTS, AI_TOOL_ESTIMATED_COST_MICROS } from './ai-tool-pricing';
import { getCanvasAiPreset } from './canvas-ai-presets';
import { resolveCanvasTextGroup, type CanvasTextGroup } from './canvas-text-upstream';

export interface ServerCanvasAiModel extends CanvasAiModel { estimatedCostMicros: number; group: CanvasTextGroup; maxOutputTokens: number; maxInputBytes: number }

// Only administrator-configured models can be charged/executed. Never accept arbitrary upstream IDs.
export function getCanvasAiModels(): ServerCanvasAiModel[] {
  const id = process.env.CANVAS_TEXT_MODEL || process.env.XAI_MODEL || 'gpt-4o';
  const fallback: ServerCanvasAiModel = {
    id, label: id, vision: process.env.CANVAS_TEXT_VISION === 'true' || (!process.env.CANVAS_TEXT_VISION && /^gpt-4o(?:$|-)/.test(id)),
    credits: AI_TOOL_CREDIT_COSTS.agentChat,
    estimatedCostMicros: AI_TOOL_ESTIMATED_COST_MICROS.agentChat,
    group: resolveCanvasTextGroup(process.env.CANVAS_TEXT_GROUP), maxOutputTokens: 4096, maxInputBytes: 120000,
  };
  if (!process.env.CANVAS_AI_MODELS_JSON) return [fallback];
  const configured: unknown = JSON.parse(process.env.CANVAS_AI_MODELS_JSON);
  if (!Array.isArray(configured) || configured.length === 0 || configured.length > 30) throw new Error('Invalid canvas model catalog');
  const ids = new Set<string>();
  return configured.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid canvas model');
    const configuredModel = entry as Partial<ServerCanvasAiModel> & { preset?: unknown };
    const preset = configuredModel.preset === undefined ? undefined : getCanvasAiPreset(configuredModel.preset);
    if (preset && configuredModel.id !== undefined && configuredModel.id !== preset.id) throw new Error('Canvas model preset ID mismatch');
    const model = { ...preset, ...configuredModel, group: resolveCanvasTextGroup(configuredModel.group ?? preset?.group ?? process.env.CANVAS_TEXT_GROUP), maxOutputTokens: configuredModel.maxOutputTokens ?? 4096, maxInputBytes: configuredModel.maxInputBytes ?? (preset ? 24000 : 120000) };
    if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 120 || ids.has(model.id)
      || typeof model.label !== 'string' || !model.label.trim() || model.label.length > 120
      || typeof model.vision !== 'boolean'
      || typeof model.credits !== 'number' || !Number.isSafeInteger(model.credits) || model.credits < 1 || model.credits > 10000
      || !Number.isSafeInteger(model.estimatedCostMicros) || typeof model.estimatedCostMicros !== 'number' || model.estimatedCostMicros < 1 || model.estimatedCostMicros > 1_000_000_000
      || !Number.isSafeInteger(model.maxOutputTokens) || model.maxOutputTokens < 256 || model.maxOutputTokens > 4096
      || !Number.isSafeInteger(model.maxInputBytes) || model.maxInputBytes < 1024 || model.maxInputBytes > 120000) {
      throw new Error('Invalid canvas model configuration');
    }
    ids.add(model.id);
    return { id: model.id, label: model.label, vision: model.vision, credits: model.credits, estimatedCostMicros: model.estimatedCostMicros, group: model.group, maxOutputTokens: model.maxOutputTokens, maxInputBytes: model.maxInputBytes };
  });
}
