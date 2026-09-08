export const MUSIC_POINTS_PER_COMFLY_UNIT = 15;
export const MUSIC_MARKUP_BPS = 500;
export const MUSIC_PRICE_VERSION = 'comfly-web-2026-09-08-v1';
const COMFLY_PRICE_SCALE = 100_000;

export const MUSIC_MODEL = {
  id: 'suno_music',
  upstreamModel: 'suno_music',
  label: 'Suno Music',
  priceUnitsPerRequest: 0.5,
  defaultVersion: 'chirp-fenix',
} as const;

export const MUSIC_VERSIONS = [
  { id: 'chirp-fenix', label: 'Suno v5.5', promptLimit: 5_000, styleLimit: 1_000 },
  { id: 'chirp-crow', label: 'Suno v5', promptLimit: 5_000, styleLimit: 1_000 },
  { id: 'chirp-bluejay', label: 'Suno v4.5+', promptLimit: 5_000, styleLimit: 1_000 },
  { id: 'chirp-v4', label: 'Suno v4', promptLimit: 3_000, styleLimit: 200 },
] as const;

export type MusicVersionId = typeof MUSIC_VERSIONS[number]['id'];

export class MusicPriceUnavailableError extends Error {
  readonly code = 'MUSIC_PRICE_UNAVAILABLE';
  constructor(message = '音乐生成价格暂时无法核验') {
    super(message);
    this.name = 'MusicPriceUnavailableError';
  }
}

export function getMusicVersion(versionId: string) {
  return MUSIC_VERSIONS.find((version) => version.id === versionId);
}

export function quoteMusicCredits(modelId = MUSIC_MODEL.id) {
  if (modelId !== MUSIC_MODEL.id) throw new MusicPriceUnavailableError();
  const costUnits = Math.round(MUSIC_MODEL.priceUnitsPerRequest * COMFLY_PRICE_SCALE);
  const credits = Math.max(1, Math.ceil(
    (costUnits * (10_000 + MUSIC_MARKUP_BPS) * MUSIC_POINTS_PER_COMFLY_UNIT)
      / (10_000 * COMFLY_PRICE_SCALE),
  ));
  return {
    modelId: MUSIC_MODEL.id,
    upstreamModel: MUSIC_MODEL.upstreamModel,
    comflyCost: MUSIC_MODEL.priceUnitsPerRequest,
    costUnits,
    credits,
    markupRate: MUSIC_MARKUP_BPS / 10_000,
    pointsPerUnit: MUSIC_POINTS_PER_COMFLY_UNIT,
    priceVersion: MUSIC_PRICE_VERSION,
  };
}
