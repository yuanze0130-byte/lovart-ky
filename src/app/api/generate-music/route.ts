import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';
import { estimatedCostMicrosFromCredits, isAiSafetyError, runMeteredAiOperation } from '@/lib/ai-safety';
import {
  AsyncGenerationTaskBindingError,
  bindAsyncGenerationTask,
  createAsyncGenerationJob,
  settleAsyncGenerationJob,
} from '@/lib/async-generation-jobs';
import { getMusicVersion, MUSIC_MODEL, MUSIC_VERSIONS, MusicPriceUnavailableError, quoteMusicCredits } from '@/lib/music-pricing';
import type { AsyncGenerationJobRow } from '@/lib/supabase';

export const runtime = 'nodejs';
const MAX_BYTES = 64 * 1024;

class MusicUpstreamResponseError extends Error {}

function isTransportOutcomeUnknown(error: unknown) {
  if (!(error instanceof Error) || error instanceof MusicUpstreamResponseError) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError) return true;
  const code = String((error as Error & { code?: unknown }).code || '').toUpperCase();
  return ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)
    || /fetch failed|network|socket|connection reset|timed? ?out/i.test(error.message);
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function failure(error: unknown) {
  if (isNotAuthenticatedError(error)) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (isAiToolRequestError(error) || isAiSafetyError(error)) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof MusicPriceUnavailableError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  return NextResponse.json({ error: '音乐任务提交失败，请稍后重试' }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const configured = Boolean(process.env.XAI_API_KEY);
    const quote = quoteMusicCredits();
    return NextResponse.json({
      configured,
      model: configured ? MUSIC_MODEL : undefined,
      versions: configured ? MUSIC_VERSIONS : [],
      credits: quote.credits,
      priceVersion: quote.priceVersion,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  let job: AsyncGenerationJobRow | null = null;
  let submissionStarted = false;
  let acceptedTaskId = '';
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-music', { limit: 4, windowMs: 60_000 });
    const body = await readLimitedJson(request, MAX_BYTES);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new MusicUpstreamResponseError('请求格式无效');
    }
    const input = body as Record<string, unknown>;
    const mode = input.mode === 'custom' ? 'custom' : 'inspiration';
    const instrumental = input.instrumental === true;
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const style = typeof input.style === 'string' ? input.style.trim() : '';
    const version = typeof input.version === 'string' ? getMusicVersion(input.version) : undefined;
    if (!version) return NextResponse.json({ error: '该 Suno 版本未开放，请重新选择' }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: mode === 'custom' ? '请输入歌词或音乐创作提示词' : '请输入音乐灵感描述' }, { status: 400 });
    if (prompt.length > version.promptLimit) return NextResponse.json({ error: `提示内容不能超过 ${version.promptLimit} 字符` }, { status: 400 });
    if (mode === 'custom' && !title) return NextResponse.json({ error: '自定义模式需要填写歌名' }, { status: 400 });
    if (title.length > 120) return NextResponse.json({ error: '歌名不能超过 120 字符' }, { status: 400 });
    if (style.length > version.styleLimit) return NextResponse.json({ error: `音乐风格不能超过 ${version.styleLimit} 字符` }, { status: 400 });

    const quote = quoteMusicCredits();
    if (input.expectedCredits !== quote.credits) {
      return NextResponse.json({ error: '音乐价格已变更，请刷新后重试', code: 'MODEL_PRICE_CHANGED' }, { status: 409 });
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('Missing upstream configuration');
    const requestId = randomUUID();
    job = await createAsyncGenerationJob({
      requestId,
      userId: user.id,
      kind: 'music',
      creditType: 'generate_music',
      chargedCredits: quote.credits,
      meta: { model: MUSIC_MODEL.id, version: version.id, mode, instrumental, priceVersion: quote.priceVersion },
    });

    const { result, billing } = await runMeteredAiOperation({
      requestId,
      userId: user.id,
      scope: 'canvas-music',
      creditCost: quote.credits,
      estimatedCostMicros: estimatedCostMicrosFromCredits(quote.credits),
      creditType: 'generate_music',
      description: '画布音乐生成',
      referenceType: 'canvas_music',
      meta: { model: MUSIC_MODEL.id, version: version.id, mode, instrumental, priceVersion: quote.priceVersion },
      shouldRefundOnError: (error) => !(submissionStarted && (Boolean(acceptedTaskId) || isTransportOutcomeUnknown(error))),
      run: async () => {
        const payload = mode === 'inspiration'
          ? { gpt_description_prompt: prompt, prompt: '', mv: version.id, make_instrumental: instrumental }
          : { prompt, tags: style, mv: version.id, title, make_instrumental: instrumental };
        submissionStarted = true;
        const response = await fetch(`${normalizeBaseUrl(process.env.XAI_BASE_URL || 'https://ai.comfly.org')}/suno/submit/music`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: request.signal,
        });
        const rawText = await response.text();
        let data: Record<string, unknown> = {};
        try { data = rawText ? JSON.parse(rawText) as Record<string, unknown> : {}; } catch { data = {}; }
        if (!response.ok) throw new MusicUpstreamResponseError(firstString(data.message, data.error, rawText) || '上游拒绝了音乐任务');
        const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data as Record<string, unknown> : {};
        acceptedTaskId = firstString(data.task_id, data.id, nested.task_id, nested.id) || '';
        const clips = Array.isArray(data.clips) ? data.clips : Array.isArray(nested.clips) ? nested.clips : [];
        if (!acceptedTaskId) throw new MusicUpstreamResponseError('上游未返回音乐任务 ID');
        job = await bindAsyncGenerationTask({ requestId, userId: user.id, kind: 'music', taskId: acceptedTaskId, status: 'queued' });
        return { taskId: acceptedTaskId, status: 'queued', clips, model: MUSIC_MODEL.id, version: version.id, quote };
      },
    });
    return NextResponse.json({ ...result, requestId, billing });
  } catch (error) {
    const recoverableTaskId = error instanceof AsyncGenerationTaskBindingError ? error.taskId : acceptedTaskId;
    const outcomeUnknown = Boolean(recoverableTaskId) || (submissionStarted && isTransportOutcomeUnknown(error));
    if (job && job.status !== 'succeeded') {
      if (outcomeUnknown) {
        await settleAsyncGenerationJob({
          job,
          status: 'outcome_unknown',
          failureReason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
          meta: { ...(recoverableTaskId ? { recoveryTaskId: recoverableTaskId } : {}), upstreamOutcomeUnknown: true },
          refund: false,
        }).catch((settleError) => console.error('[generate-music] failed to preserve recoverable task', settleError));
      } else {
        await settleAsyncGenerationJob({
          job,
          status: 'failed',
          failureReason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        }).catch((settleError) => console.error('[generate-music] failed to settle rejected task', settleError));
      }
    }
    return failure(error);
  }
}
