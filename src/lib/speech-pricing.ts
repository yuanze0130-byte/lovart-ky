export const SPEECH_POINTS_PER_COMFLY_UNIT = 15;
export const SPEECH_MARKUP_BPS = 500;
export const SPEECH_PRICE_VERSION = 'comfly-web-2026-09-08-v1';
const COMFLY_PRICE_SCALE = 100_000;

export const SPEECH_MODELS = [
  { id: 'minimax/speech-01-hd', upstreamModel: 'speech-01-hd', label: 'MiniMax Speech 01 HD', priceUnitsPer10kCharacters: 3.5 },
  { id: 'minimax/speech-01-turbo', upstreamModel: 'speech-01-turbo', label: 'MiniMax Speech 01 Turbo', priceUnitsPer10kCharacters: 2 },
  { id: 'minimax/speech-02-hd', upstreamModel: 'speech-02-hd', label: 'MiniMax Speech 02 HD', priceUnitsPer10kCharacters: 3.5 },
  { id: 'minimax/speech-02-turbo', upstreamModel: 'speech-02-turbo', label: 'MiniMax Speech 02 Turbo', priceUnitsPer10kCharacters: 2 },
  { id: 'minimax/speech-2.6-hd', upstreamModel: 'speech-2.6-hd', label: 'MiniMax Speech 2.6 HD', priceUnitsPer10kCharacters: 3.5 },
  { id: 'minimax/speech-2.6-turbo', upstreamModel: 'speech-2.6-turbo', label: 'MiniMax Speech 2.6 Turbo', priceUnitsPer10kCharacters: 3.5 },
] as const;

export type SpeechModelId = typeof SPEECH_MODELS[number]['id'];

export class SpeechPriceUnavailableError extends Error {
  readonly code = 'SPEECH_PRICE_UNAVAILABLE';
  constructor(message = '该语音模型暂无可核验价格') {
    super(message);
    this.name = 'SpeechPriceUnavailableError';
  }
}

export function getSpeechModel(modelId: string) {
  return SPEECH_MODELS.find((model) => model.id === modelId);
}

export function countSpeechCharacters(text: string) {
  return Array.from(text).length;
}

export function quoteSpeechCredits(modelId: string, characterCount: number) {
  const model = getSpeechModel(modelId);
  if (!model) throw new SpeechPriceUnavailableError();
  if (!Number.isSafeInteger(characterCount) || characterCount < 1 || characterCount > 10_000) {
    throw new SpeechPriceUnavailableError('语音文本长度必须为 1 到 10000 个字符');
  }
  const costUnits = Math.max(1, Math.ceil(
    (model.priceUnitsPer10kCharacters * COMFLY_PRICE_SCALE * characterCount) / 10_000,
  ));
  const credits = Math.max(1, Math.ceil(
    (costUnits * (10_000 + SPEECH_MARKUP_BPS) * SPEECH_POINTS_PER_COMFLY_UNIT)
      / (10_000 * COMFLY_PRICE_SCALE),
  ));
  return {
    modelId: model.id,
    upstreamModel: model.upstreamModel,
    characterCount,
    comflyCost: costUnits / COMFLY_PRICE_SCALE,
    costUnits,
    credits,
    markupRate: SPEECH_MARKUP_BPS / 10_000,
    pointsPerUnit: SPEECH_POINTS_PER_COMFLY_UNIT,
    priceVersion: SPEECH_PRICE_VERSION,
  };
}
