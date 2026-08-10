import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { getGenerationJobFailureKind, normalizeGenerationJobStatus, normalizeGenerationProgress, normalizeProviderStatus } from '@/lib/generation-jobs';

function normalizeVideoBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function stringifyErrorPayload(value: unknown) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseUrl(process.env.VIDEO_API_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.comfly.org');
    const pathTemplate = process.env.MOTION_TRANSFER_STATUS_PATH || '/v2/videos/generations/{taskId}';
    if (!apiKey) throw new Error('VIDEO_API_KEY or GEMINI_API_KEY not configured');
    const path = pathTemplate.replace('{taskId}', encodeURIComponent(taskId));
    const endpoint = /^https?:\/\//i.test(path) ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const rawText = await response.text();
    let result: Record<string, unknown> = {};
    try { result = rawText ? JSON.parse(rawText) as Record<string, unknown> : {}; } catch { result = {}; }
    if (!response.ok) throw new Error(`上游任务查询错误 (${response.status}): ${stringifyErrorPayload(result.error || rawText)}`);

    const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
    const content = data.content && typeof data.content === 'object' && !Array.isArray(data.content) ? data.content as Record<string, unknown> : {};
    const output = result.output && typeof result.output === 'object' && !Array.isArray(result.output) ? result.output as Record<string, unknown> : {};
    const rawStatus = String(data.status || result.status || 'running');
    const normalizedStatus = normalizeProviderStatus(rawStatus);
    const jobStatus = normalizeGenerationJobStatus(normalizedStatus);
    const urls = Array.isArray(result.urls) ? result.urls : [];
    const contentUrls = Array.isArray(content.urls) ? content.urls : [];
    const videoUrl = firstString(
      result.video_url,
      result.videoUrl,
      result.url,
      typeof result.output === 'string' ? result.output : undefined,
      output.video_url,
      output.url,
      urls[0],
      typeof data.output === 'string' ? data.output : undefined,
      content.video_url,
      content.url,
      contentUrls[0],
    ) || '';

    return NextResponse.json({
      taskId,
      status: normalizedStatus,
      jobStatus,
      failureKind: getGenerationJobFailureKind(normalizedStatus),
      progress: normalizeGenerationProgress(result.progress as number | string | undefined, jobStatus),
      videoUrl: videoUrl || undefined,
      error: data.fail_reason || result.error,
      model: result.model,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return NextResponse.json({ error: '查询动作迁移状态失败', details: error instanceof Error ? error.message : '未知错误' }, { status: 500 });
  }
}
