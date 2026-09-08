import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, isNotAuthenticatedError } from '@/lib/require-user';
import { AiToolRequestError, enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import { countSpeechCharacters, getSpeechModel, quoteSpeechCredits, SPEECH_MODELS, SpeechPriceUnavailableError } from '@/lib/speech-pricing';

export const runtime = 'nodejs';
const MAX_BYTES = 64 * 1024;
function failure(error: unknown) {
  if (isNotAuthenticatedError(error)) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (isAiToolRequestError(error) || isAiSafetyError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SpeechPriceUnavailableError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  return NextResponse.json({ error: '语音生成失败，请检查 MiniMax 接口配置' }, { status: 502 });
}

function numberValue(value: unknown, fallback: number, min: number, max: number, name: string) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new AiToolRequestError(`${name} 参数无效`, 400, 'INVALID_REQUEST');
  return value;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const configured = Boolean(process.env.XAI_API_KEY);
    return NextResponse.json({ configured, models: configured ? SPEECH_MODELS.map(({ id, label, priceUnitsPer10kCharacters }) => ({ id, label, priceUnitsPer10kCharacters })) : [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-speech', { limit: 6, windowMs: 60_000 });
    const body = await readLimitedJson(request, MAX_BYTES);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AiToolRequestError('请求格式无效', 400, 'INVALID_REQUEST');
    const input = body as Record<string, unknown>;
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const characterCount = countSpeechCharacters(text);
    if (!text || characterCount > 10_000) throw new AiToolRequestError('语音文本不能为空且不能超过 10000 字', 400, 'INVALID_REQUEST');
    const selected = typeof input.model === 'string' ? getSpeechModel(input.model) : undefined;
    if (!selected) throw new AiToolRequestError('该语音模型未开放，请重新选择', 400, 'MODEL_NOT_ALLOWED');
    const quote = quoteSpeechCredits(selected.id, characterCount);
    if (input.expectedCredits !== quote.credits) throw new AiToolRequestError('语音价格已变更，请刷新后重试', 409, 'MODEL_PRICE_CHANGED');
    const voiceId = typeof input.voiceId === 'string' && input.voiceId.trim() ? input.voiceId.trim() : (process.env.CANVAS_SPEECH_DEFAULT_VOICE_ID || 'female-shaonv');
    if (voiceId.length > 120) throw new AiToolRequestError('音色标识过长', 400, 'INVALID_REQUEST');
    const speed = numberValue(input.speed, 1, 0.5, 2, '语速');
    const pitch = numberValue(input.pitch, 0, -12, 12, '音调');
    const format = input.format === 'wav' || input.format === 'flac' ? input.format : 'mp3';
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('Missing upstream configuration');
    const base = (process.env.XAI_BASE_URL || 'https://ai.comfly.org/v1').replace(/\/+$/, '');
    const endpoint = `${base}/minimax/v1/t2a_v2`;
    const { result, billing } = await runMeteredAiOperation({
      requestId: randomUUID(), userId: user.id, scope: 'canvas-speech', creditCost: quote.credits, estimatedCostMicros: quote.costUnits,
      creditType: 'generate_audio', description: '画布语音生成', referenceType: 'canvas_speech', meta: { model: selected.id, upstreamModel: selected.upstreamModel, voiceId, format, characterCount, priceVersion: quote.priceVersion },
      run: async () => {
        const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: selected.upstreamModel, text, stream: false, output_format: 'url', voice_setting: { voice_id: voiceId, speed, vol: 1, pitch }, audio_setting: { sample_rate: 32_000, bitrate: 128_000, format, channel: 1 } }), signal: request.signal });
        const payload = await response.json().catch(() => ({})) as { data?: { audio?: string }; base_resp?: { status_code?: number; status_msg?: string } };
        if (!response.ok || !payload.data?.audio) throw new Error(payload.base_resp?.status_msg || 'Upstream speech response invalid');
        return { audioUrl: payload.data.audio, model: selected.id, voiceId, format, quote };
      },
    });
    return NextResponse.json({ ...result, billing });
  } catch (error) { return failure(error); }
}
