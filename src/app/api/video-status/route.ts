import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

interface VideoStatusResponse {
  id?: string;
  status?: string;
  progress?: number;
  video_url?: string;
  model?: string;
  created_at?: string;
  size?: string;
  seconds?: number;
  error?: string;
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

    const response = await fetch(`${baseUrl}/videos/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = (await response.json()) as VideoStatusResponse;
    if (!response.ok) throw new Error(data.error || 'Failed to get video status');

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: data.progress || 0,
      videoUrl: data.video_url,
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
