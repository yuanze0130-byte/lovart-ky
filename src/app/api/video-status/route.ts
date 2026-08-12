import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  getGenerationJobFailureKind,
  normalizeGenerationJobStatus,
  normalizeGenerationProgress,
  normalizeProviderStatus,
} from '@/lib/generation-jobs';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { refundCredits } from '@/lib/credits';

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
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data: billingJob, error: billingLookupError } = await supabase
      .from('video_generation_jobs')
      .select('request_id,user_id,task_id,charged_credits,refunded_credits,status')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (billingLookupError) throw billingLookupError;

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

    const resolvedProgress = normalizeGenerationProgress(data.progress, jobStatus);
    const failureReason = data.data?.fail_reason || stringifyErrorPayload(data.error || '上游视频任务失败');

    if (billingJob && jobStatus === 'failed') {
      const refund = await refundCredits({
        userId: user.id,
        amount: billingJob.charged_credits,
        type: 'refund',
        originalType: 'generate_video',
        description: '视频任务最终失败，自动退回积分',
        referenceId: billingJob.request_id,
        meta: { taskId, providerStatus: normalizedStatus || null, reason: failureReason.slice(0, 1000) },
      });
      await supabase.from('video_generation_jobs').update({
        status: 'refunded',
        refunded_credits: refund.refundedCredits,
        failure_reason: failureReason.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq('request_id', billingJob.request_id).eq('user_id', user.id);
    } else if (billingJob && jobStatus === 'succeeded') {
      await supabase.from('video_generation_jobs').update({
        status: 'succeeded',
        updated_at: new Date().toISOString(),
      }).eq('request_id', billingJob.request_id).eq('user_id', user.id);
    } else if (billingJob) {
      await supabase.from('video_generation_jobs').update({
        status: normalizedStatus || jobStatus,
        updated_at: new Date().toISOString(),
      }).eq('request_id', billingJob.request_id).eq('user_id', user.id);
    }

    return NextResponse.json({
      id: data.id || data.task_id,
      status: normalizedStatus || data.status,
      jobStatus,
      failureKind: getGenerationJobFailureKind(normalizedStatus),
      progress: resolvedProgress,
      videoUrl: resolvedVideoUrl,
      model: data.model,
      createdAt: data.created_at,
      size: data.size,
      seconds: data.seconds,
      error: data.data?.fail_reason,
      requestId: billingJob?.request_id,
      chargedCredits: billingJob?.charged_credits,
      refundedCredits: jobStatus === 'failed' ? billingJob?.charged_credits : billingJob?.refunded_credits,
    });
  } catch (error: unknown) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get video status', details: message },
      { status: 500 }
    );
  }
}
