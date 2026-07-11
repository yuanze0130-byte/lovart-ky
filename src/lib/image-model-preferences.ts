import { IMAGE_MODEL_OPTIONS, type ImageGenerationExecutionMode, type ImageModelId } from '@/lib/image-models';

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

export function loadImageModelPreferences(): ImageModelPreferences {
  if (typeof window === 'undefined') return DEFAULT_IMAGE_MODEL_PREFERENCES;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<ImageModelPreferences>;
    return {
      ...DEFAULT_IMAGE_MODEL_PREFERENCES,
      ...stored,
      defaults: { ...DEFAULT_IMAGE_MODEL_PREFERENCES.defaults, ...(stored.defaults || {}) },
      modelOrder: Array.from(new Set([...(stored.modelOrder || []), ...DEFAULT_IMAGE_MODEL_PREFERENCES.modelOrder])),
    };
  } catch {
    return DEFAULT_IMAGE_MODEL_PREFERENCES;
  }
}

export function saveImageModelPreferences(preferences: ImageModelPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent('lovart-image-model-preferences-changed', { detail: preferences }));
}
