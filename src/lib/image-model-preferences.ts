import { IMAGE_MODEL_OPTIONS, normalizeImageModelId, type ImageGenerationExecutionMode, type ImageModelId } from '@/lib/image-models';

const STORAGE_KEY = 'lovart-image-model-preferences-v1';

export interface ImageModelPreferences {
  hiddenModelIds: ImageModelId[];
  modelOrder: ImageModelId[];
  lastUsedModelId: ImageModelId;
  defaults: {
    modelId: ImageModelId;
    resolution: '1K' | '2K' | '4K';
    aspectRatio: string;
    outputCount: number;
    executionMode: ImageGenerationExecutionMode;
  };
}

export const DEFAULT_IMAGE_MODEL_PREFERENCES: ImageModelPreferences = {
  hiddenModelIds: [],
  modelOrder: IMAGE_MODEL_OPTIONS.map((model) => model.id),
  lastUsedModelId: 'nano-banana-pro',
  defaults: {
    modelId: 'nano-banana-pro',
    resolution: '1K',
    aspectRatio: 'auto',
    outputCount: 1,
    executionMode: 'parallel',
  },
};

const ACTIVE_MODEL_IDS = new Set<string>(IMAGE_MODEL_OPTIONS.map((model) => model.id));

function getActiveModelId(value: unknown): ImageModelId | null {
  if (typeof value !== 'string') return null;
  const normalized = value === 'standard' || value === 'pro'
    ? normalizeImageModelId(value)
    : value;
  return ACTIVE_MODEL_IDS.has(normalized) ? normalized as ImageModelId : null;
}

export function sanitizeImageModelPreferences(stored: Partial<ImageModelPreferences>): ImageModelPreferences {
  const modelOrder = Array.isArray(stored.modelOrder)
    ? stored.modelOrder
        .map(getActiveModelId)
        .filter((modelId): modelId is ImageModelId => Boolean(modelId))
    : [];
  const hiddenModelIds = Array.isArray(stored.hiddenModelIds)
    ? stored.hiddenModelIds
        .map(getActiveModelId)
        .filter((modelId): modelId is ImageModelId => Boolean(modelId))
    : [];

  return {
    ...DEFAULT_IMAGE_MODEL_PREFERENCES,
    ...stored,
    hiddenModelIds: Array.from(new Set(hiddenModelIds)),
    modelOrder: Array.from(new Set([...modelOrder, ...DEFAULT_IMAGE_MODEL_PREFERENCES.modelOrder])),
    lastUsedModelId: getActiveModelId(stored.lastUsedModelId) || DEFAULT_IMAGE_MODEL_PREFERENCES.lastUsedModelId,
    defaults: {
      ...DEFAULT_IMAGE_MODEL_PREFERENCES.defaults,
      ...(stored.defaults || {}),
      modelId: getActiveModelId(stored.defaults?.modelId) || DEFAULT_IMAGE_MODEL_PREFERENCES.defaults.modelId,
    },
  };
}

export function loadImageModelPreferences(): ImageModelPreferences {
  if (typeof window === 'undefined') return DEFAULT_IMAGE_MODEL_PREFERENCES;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<ImageModelPreferences>;
    return sanitizeImageModelPreferences(stored);
  } catch {
    return DEFAULT_IMAGE_MODEL_PREFERENCES;
  }
}

export function saveImageModelPreferences(preferences: ImageModelPreferences) {
  const sanitized = sanitizeImageModelPreferences(preferences);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  window.dispatchEvent(new CustomEvent('lovart-image-model-preferences-changed', { detail: sanitized }));
}
