import type { CanvasAiModel } from './canvas-ai';
import { AI_TOOL_CREDIT_COSTS, AI_TOOL_ESTIMATED_COST_MICROS } from './ai-tool-pricing';

export interface ServerCanvasAiModel extends CanvasAiModel { estimatedCostMicros: number }

// Only administrator-configured models can be charged/executed. Never accept arbitrary upstream IDs.
export function getCanvasAiModels(): ServerCanvasAiModel[] {
  const id = process.env.CANVAS_TEXT_MODEL || process.env.XAI_MODEL || 'gpt-4o';
  const fallback: ServerCanvasAiModel = {
    id, label: id, vision: process.env.CANVAS_TEXT_VISION === 'true' || (!process.env.CANVAS_TEXT_VISION && /^gpt-4o(?:$|-)/.test(id)),
    credits: AI_TOOL_CREDIT_COSTS.agentChat,
    estimatedCostMicros: AI_TOOL_ESTIMATED_COST_MICROS.agentChat,
  };
  if (!process.env.CANVAS_AI_MODELS_JSON) return [fallback];
  const configured: unknown = JSON.parse(process.env.CANVAS_AI_MODELS_JSON);
  if (!Array.isArray(configured) || configured.length === 0 || configured.length > 30) throw new Error('Invalid canvas model catalog');
  const ids = new Set<string>();
  return configured.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid canvas model');
    const model = entry as ServerCanvasAiModel;
    if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 120 || ids.has(model.id)
      || typeof model.label !== 'string' || !model.label.trim() || model.label.length > 120
      || typeof model.vision !== 'boolean'
      || !Number.isSafeInteger(model.credits) || model.credits < 1 || model.credits > 10000
      || !Number.isSafeInteger(model.estimatedCostMicros) || model.estimatedCostMicros < 1 || model.estimatedCostMicros > 1_000_000_000) {
      throw new Error('Invalid canvas model configuration');
    }
    ids.add(model.id);
    return { id: model.id, label: model.label, vision: model.vision, credits: model.credits, estimatedCostMicros: model.estimatedCostMicros };
  });
}
