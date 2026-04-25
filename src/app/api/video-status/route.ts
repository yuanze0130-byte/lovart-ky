import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';

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
    content?: {
      video_url?: string;
      url?: string;
      urls?: string[];
    };
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const apiKey = process.env.VIDEO_API_KEY;
    const baseUrl = process.env.VIDEO_API_BASE_URL || 'https://ai.t8star.cn';

    if (!apiKey) {
      return NextResponse.json({ error: 'VIDEO_API_KEY not configured' }, { status: 500 });
    }

    const response = await fetch(`${baseUrl}/seedance/v3/contents/generations/tasks/${taskId}`, {
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
    const normalizedStatus = (nestedStatus || data.status || '').toLowerCase();

    const resolvedVideoUrl =
      data.video_url ||
      data.videoUrl ||
      data.url ||
      data.output?.video_url ||
      data.output?.url ||
      data.urls?.[0] ||
      data.output?.urls?.[0] ||
      data.data?.content?.video_url ||
      data.data?.content?.url ||
      data.data?.content?.urls?.[0];

    const resolvedProgress = typeof data.progress === 'number'
      ? data.progress
      : typeof data.progress === 'string' && data.progress.endsWith('%')
        ? Number.parseInt(data.progress, 10)
        : normalizedStatus === 'succeeded' || normalizedStatus === 'completed' || normalizedStatus === 'success'
          ? 100
          : normalizedStatus === 'failed'
            ? 0
            : 50;

    return NextResponse.json({
      id: data.id || data.task_id,
      status: normalizedStatus || data.status,
      progress: resolvedProgress,
      videoUrl: resolvedVideoUrl,
      model: data.model,
      createdAt: data.created_at,
      size: data.size,
      seconds: data.seconds,
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
