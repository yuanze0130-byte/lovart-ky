import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';
import { findOwnedAsyncGenerationJob, settleAsyncGenerationJob, updateAsyncGenerationJob } from '@/lib/async-generation-jobs';

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function normalizeTracks(payload: Record<string, unknown>) {
  const outer = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {};
  const candidates = Array.isArray(outer.data) ? outer.data : Array.isArray(payload.clips) ? payload.clips : Array.isArray(payload.data) ? payload.data : [];
  return candidates.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const audioUrl = firstString(item.audio_url, item.audioUrl);
    if (!audioUrl) return [];
    return [{
      id: firstString(item.id, item.clip_id) || crypto.randomUUID(),
      title: firstString(item.title) || '未命名音乐',
      audioUrl,
      imageUrl: firstString(item.image_url, item.imageUrl),
      videoUrl: firstString(item.video_url, item.videoUrl),
      duration: typeof item.duration === 'number' && Number.isFinite(item.duration) ? item.duration : undefined,
      status: firstString(item.status, item.state),
    }];
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'canvas-music-status', { limit: 60, windowMs: 60_000 });
    const taskId = request.nextUrl.searchParams.get('taskId')?.trim() || '';
    if (!taskId || taskId.length > 256) return NextResponse.json({ error: '音乐任务 ID 无效' }, { status: 400 });
    const job = await findOwnedAsyncGenerationJob({ userId: user.id, kind: 'music', taskId });
    if (!job) return NextResponse.json({ error: '找不到该音乐任务' }, { status: 404 });
    if (job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({ taskId, status: job.status, error: job.failure_reason || '音乐生成失败', chargedCredits: job.charged_credits, refundedCredits: job.refunded_credits });
    }
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('Missing upstream configuration');
    const response = await fetch(`${normalizeBaseUrl(process.env.XAI_BASE_URL || 'https://ai.comfly.org')}/suno/fetch/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: request.signal,
    });
    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : {}; } catch { payload = {}; }
    if (!response.ok) throw new Error(firstString(payload.message, payload.error, rawText) || '上游状态查询失败');
    const outer = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {};
    const rawStatus = firstString(outer.status, payload.status) || 'running';
    const normalized = rawStatus.toLowerCase();
    const tracks = normalizeTracks(payload);
    const failed = ['failed', 'failure', 'error', 'cancelled', 'canceled'].some((value) => normalized.includes(value));
    const succeeded = ['success', 'succeeded', 'complete', 'completed'].some((value) => normalized === value) && tracks.length > 0;
    const failureReason = firstString(outer.fail_reason, payload.message, payload.error) || '上游音乐任务失败';
    let settled = job;
    if (failed || (['success', 'succeeded', 'complete', 'completed'].includes(normalized) && tracks.length === 0)) {
      settled = await settleAsyncGenerationJob({ job, status: 'failed', failureReason: tracks.length === 0 && !failed ? '音乐任务完成但未返回音频' : failureReason });
    } else if (succeeded) {
      settled = await settleAsyncGenerationJob({ job, status: 'succeeded', outputUrl: tracks[0].audioUrl, meta: { tracks } });
    } else {
      settled = await updateAsyncGenerationJob({ requestId: job.request_id, userId: user.id, kind: 'music', status: normalized.includes('submit') || normalized.includes('queue') ? 'queued' : 'running' });
    }
    return NextResponse.json({
      taskId,
      status: settled.status,
      progress: succeeded ? 100 : typeof outer.progress === 'string' ? Number.parseInt(outer.progress, 10) || 25 : 25,
      tracks: succeeded ? tracks : undefined,
      error: settled.status === 'failed' || settled.status === 'cancelled' ? settled.failure_reason || failureReason : undefined,
      chargedCredits: job.charged_credits,
      refundedCredits: settled.refunded_credits,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: '请先登录' }, { status: 401 });
    if (isAiToolRequestError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: '查询音乐生成状态失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 502 });
  }
}
