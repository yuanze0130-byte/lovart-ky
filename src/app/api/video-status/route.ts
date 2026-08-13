import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  getGenerationJobFailureKind,
  normalizeGenerationJobStatus,
  normalizeGenerationProgress,
  normalizeProviderStatus,
} from '@/lib/generation-jobs';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { enforceUserRateLimit, isAiToolRequestError } from '@/lib/ai-tool-request-guards';

type VideoTerminalStatus = 'succeeded' | 'failed' | 'cancelled';

async function settleVideoJob(params: {
  requestId: string;
  userId: string;
  taskId: string;
  status: VideoTerminalStatus;
  failureReason?: string;
  providerStatus?: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.rpc('settle_video_generation_job_atomic', {
    p_request_id: params.requestId,
    p_user_id: params.userId,
    p_terminal_status: params.status,
    p_task_id: params.taskId,
    p_failure_reason: params.failureReason?.slice(0, 1_000) || null,
    p_meta: {
      taskId: params.taskId,
      providerStatus: params.providerStatus || null,
      failureReason: params.failureReason?.slice(0, 1_000) || null,
    },
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result?.success && result?.error_code !== 'VIDEO_JOB_TERMINAL_CONFLICT') {
    throw new Error(result?.error_code || 'VIDEO_JOB_SETTLEMENT_FAILED');
  }
  return result;
}

function stringifyErrorPayload(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

interface VideoStatusResponse {
  id?: string;
  task_id?: string;
  status?: string;
  progress?: number | string;
  video_url?: string;
  videoUrl?: string;
  url?: string;
  urls?: string[];
  model?: string;
  created_at?: string | number;
  size?: string;
  seconds?: number;
  error?: unknown;
  output?: {
    video_url?: string;
    url?: string;
    urls?: string[];
  };
  data?: {
    status?: string;
    duration?: string;
    output?: string;
    fail_reason?: string;
    content?: {
      video_url?: string;
      url?: string;
      urls?: string[];
    };
  };
}

function normalizeVideoBaseURL(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'video-status', { limit: 60, windowMs: 60_000 });
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }
    if (taskId.length > 256) {
      return NextResponse.json({ error: 'Task ID is invalid' }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: billingJob, error: billingLookupError } = await supabase
      .from('video_generation_jobs')
      .select('request_id,user_id,task_id,charged_credits,refunded_credits,status,failure_reason')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (billingLookupError) throw billingLookupError;
    if (!billingJob) {
      return NextResponse.json({ error: 'Video task not found' }, { status: 404 });
    }

    if (billingJob.status === 'failed' || billingJob.status === 'cancelled' || billingJob.status === 'refunded') {
      const cachedStatus = billingJob.status === 'cancelled' ? 'cancelled' : 'failed';
      return NextResponse.json({
        id: taskId,
        status: cachedStatus,
        jobStatus: cachedStatus,
        failureKind: cachedStatus,
        progress: 0,
        error: billingJob.failure_reason || 'Video task failed',
        requestId: billingJob.request_id,
        chargedCredits: billingJob.charged_credits,
        refundedCredits: billingJob.refunded_credits,
      });
    }

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseURL(process.env.VIDEO_API_BASE_URL || 'https://ai.comfly.org');

    if (!apiKey) {
      return NextResponse.json({ error: 'VIDEO_API_KEY or GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: request.signal,
    });

    const rawText = await response.text();
    let data: VideoStatusResponse = {};

    try {
      data = rawText ? (JSON.parse(rawText) as VideoStatusResponse) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        `Upstream video status API error (${response.status} ${response.statusText}): ${stringifyErrorPayload(data.error || rawText || 'Failed to get video status')}`
      );
    }

    const nestedStatus = data.data?.status;
    const normalizedStatus = normalizeProviderStatus(nestedStatus || data.status);
    const jobStatus = normalizeGenerationJobStatus(normalizedStatus || 'running');

    const resolvedVideoUrl =
      data.video_url ||
      data.videoUrl ||
      data.url ||
      data.output?.video_url ||
      data.output?.url ||
      data.urls?.[0] ||
      data.output?.urls?.[0] ||
      data.data?.output ||
      data.data?.content?.video_url ||
      data.data?.content?.url ||
      data.data?.content?.urls?.[0];

    const failureReason = data.data?.fail_reason || stringifyErrorPayload(data.error || '上游视频任务失败');

    let persistedStatus = jobStatus;
    let refundedCredits = billingJob.refunded_credits;
    if (jobStatus === 'failed' || jobStatus === 'cancelled' || jobStatus === 'succeeded') {
      const settlement = await settleVideoJob({
        requestId: billingJob.request_id,
        userId: user.id,
        taskId,
        status: jobStatus,
        failureReason: jobStatus === 'succeeded' ? undefined : failureReason,
        providerStatus: normalizedStatus || jobStatus,
      });
      const settledStatus = settlement?.job_status;
      persistedStatus = settledStatus === 'refunded' ? 'failed' : normalizeGenerationJobStatus(settledStatus || jobStatus);
      refundedCredits = settlement?.refunded_credits ?? billingJob.refunded_credits;
    } else {
      const { error: statusUpdateError } = await supabase
        .from('video_generation_jobs')
        .update({ status: jobStatus, updated_at: new Date().toISOString() })
        .eq('request_id', billingJob.request_id)
        .eq('user_id', user.id)
        .in('status', ['created', 'starting', 'queued', 'running', 'outcome_unknown']);
      if (statusUpdateError) throw statusUpdateError;
    }

    const persistedFailure = persistedStatus === 'failed' || persistedStatus === 'cancelled';

    return NextResponse.json({
      id: data.id || data.task_id,
      status: persistedFailure || persistedStatus === 'succeeded' ? persistedStatus : normalizedStatus || data.status,
      jobStatus: persistedStatus,
      failureKind: persistedFailure ? getGenerationJobFailureKind(persistedStatus) : undefined,
      progress: normalizeGenerationProgress(data.progress, persistedStatus),
      videoUrl: persistedStatus === 'succeeded' ? resolvedVideoUrl : undefined,
      model: data.model,
      createdAt: data.created_at,
      size: data.size,
      seconds: data.seconds,
      error: persistedFailure ? failureReason : undefined,
      requestId: billingJob.request_id,
      chargedCredits: billingJob.charged_credits,
      refundedCredits,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined,
        },
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get video status', details: message },
      { status: 500 }
    );
  }
}
