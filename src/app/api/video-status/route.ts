import { NextRequest, NextResponse } from 'next/server';
import { refundCreditsIfNotAlreadyRefunded } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

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

    const normalizedStatus = String(data.status || '').toLowerCase();
    let refundIssued = false;

    if (normalizedStatus === 'failed') {
      const quote = getBillingQuote('generate_video', {
        seconds: data.seconds || 10,
        size: data.size || '720x1280',
      });

      try {
        const refundResult = await refundCreditsIfNotAlreadyRefunded({
          action: 'generate_video',
          quote,
          refundKey: `video:${taskId}`,
          meta: {
            requestPath: '/api/video-status',
            provider: 'video_api',
            taskId,
            status: data.status || 'failed',
            reason: data.error || 'Video task failed',
          },
        });
        refundIssued = !refundResult.skipped;
      } catch (refundError) {
        console.error('Failed to auto-refund failed video task:', refundError);
      }
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: data.progress || 0,
      videoUrl: data.video_url,
      model: data.model,
      createdAt: data.created_at,
      size: data.size,
      seconds: data.seconds,
      refundIssued,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get video status', details: message },
      { status: 500 }
    );
  }
}
