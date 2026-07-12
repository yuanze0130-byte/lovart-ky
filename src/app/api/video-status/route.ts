import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import {
  getGenerationJobFailureKind,
  normalizeGenerationJobStatus,
  normalizeGenerationProgress,
  normalizeProviderStatus,
} from '@/lib/generation-jobs';

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
    await requireUser(request);
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const apiKey = process.env.VIDEO_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = normalizeVideoBaseURL(process.env.VIDEO_API_BASE_URL || process.env.GEMINI_BASE_URL || 'https://ai.t8star.cn');

    if (!apiKey) {
      return NextResponse.json({ error: 'VIDEO_API_KEY or GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
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
