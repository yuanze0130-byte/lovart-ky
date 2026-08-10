export interface CanvasFeatureSettings {
  hideImages: boolean;
  tilt3d: boolean;
  flowAnimation: boolean;
  stopwatch: boolean;
  snap: boolean;
  crosses: boolean;
  follow: boolean;
  marquee: boolean;
  generationAnimation: boolean;
  grid: boolean;
  navigator: boolean;
  groupMode: boolean;
  hideConnectors: boolean;
  gridGap: number;
  gridDotSize: number;
  connectorWidth: number;
  connectorOpacity: number;
}

export const DEFAULT_CANVAS_FEATURE_SETTINGS: CanvasFeatureSettings = {
  hideImages: false,
  tilt3d: false,
  flowAnimation: false,
  stopwatch: false,
  snap: true,
  crosses: false,
  follow: false,
  marquee: false,
  generationAnimation: true,
  grid: true,
  navigator: false,
  groupMode: false,
  hideConnectors: false,
  gridGap: 20,
  gridDotSize: 0.5,
  connectorWidth: 2,
  connectorOpacity: 100,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export function normalizeCanvasFeatureSettings(value: unknown): CanvasFeatureSettings {
  const input = value && typeof value === 'object' ? value as Partial<CanvasFeatureSettings> : {};
  const normalized = { ...DEFAULT_CANVAS_FEATURE_SETTINGS };
  (Object.keys(DEFAULT_CANVAS_FEATURE_SETTINGS) as Array<keyof CanvasFeatureSettings>).forEach((key) => {
    if (typeof DEFAULT_CANVAS_FEATURE_SETTINGS[key] === 'boolean' && typeof input[key] === 'boolean') {
      (normalized[key] as boolean) = input[key] as boolean;
    }
  });
  normalized.gridGap = clamp(input.gridGap, 8, 80, DEFAULT_CANVAS_FEATURE_SETTINGS.gridGap);
  normalized.gridDotSize = clamp(input.gridDotSize, 0.2, 3, DEFAULT_CANVAS_FEATURE_SETTINGS.gridDotSize);
  normalized.connectorWidth = clamp(input.connectorWidth, 1, 8, DEFAULT_CANVAS_FEATURE_SETTINGS.connectorWidth);
  normalized.connectorOpacity = clamp(input.connectorOpacity, 10, 100, DEFAULT_CANVAS_FEATURE_SETTINGS.connectorOpacity);
  return normalized;
}

export function loadCanvasFeatureSettings(storageKey: string) {
  if (typeof window === 'undefined') return DEFAULT_CANVAS_FEATURE_SETTINGS;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? normalizeCanvasFeatureSettings(JSON.parse(stored)) : DEFAULT_CANVAS_FEATURE_SETTINGS;
  } catch {
    return DEFAULT_CANVAS_FEATURE_SETTINGS;
  }
}

export function saveCanvasFeatureSettings(storageKey: string, settings: CanvasFeatureSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Canvas preferences are optional; storage may be unavailable in private/restricted contexts.
  }
}

export function getCanvasFeatureStorageKey(projectId?: string | null) {
  return `doodleverse.canvas-features.${projectId || 'local'}`;
}
