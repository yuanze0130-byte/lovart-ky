import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

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
  status?: string;
  progress?: number;
  video_url?: string;
  videoUrl?: string;
  url?: string;
  urls?: string[];
  model?: string;
  created_at?: string;
  size?: string;
  seconds?: number;
  error?: unknown;
  output?: {
    video_url?: string;
    url?: string;
    urls?: string[];
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
    const baseUrl = process.env.VIDEO_API_BASE_URL || 'https://www.clockapi.fun/v1';

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

    const resolvedVideoUrl =
      data.video_url ||
      data.videoUrl ||
      data.url ||
      data.output?.video_url ||
      data.output?.url ||
      data.urls?.[0] ||
      data.output?.urls?.[0];

    const resolvedProgress = typeof data.progress === 'number'
      ? data.progress
      : data.status === 'succeeded' || data.status === 'completed'
        ? 100
        : data.status === 'failed'
          ? 0
          : 50;

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: resolvedProgress,
      videoUrl: resolvedVideoUrl,
      model: data.model,
      createdAt: data.created_at,
      size: data.size,
      seconds: data.seconds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get video status', details: message },
      { status: 500 }
    );
  }
}
