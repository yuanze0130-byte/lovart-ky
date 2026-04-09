import { NextRequest, NextResponse } from 'next/server';
import { queryUpscaleTask } from '@/lib/upscale';
import { refundCreditsIfNotAlreadyRefunded } from '@/lib/credits';
import { getBillingQuote } from '@/lib/pricing';

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId');
  const scale = Number(request.nextUrl.searchParams.get('scale') || 2);

  try {
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const result = await queryUpscaleTask(taskId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (taskId && /task failed/i.test(message)) {
      const quote = getBillingQuote('upscale', { scale });

      try {
        await refundCreditsIfNotAlreadyRefunded({
          action: 'upscale',
          quote,
          refundKey: `upscale:${taskId}`,
          meta: {
            requestPath: '/api/upscale-status',
            provider: process.env.UPSCALE_PROVIDER || 'stub',
            taskId,
            scale,
            reason: message,
          },
        });
      } catch (refundError) {
        console.error('Failed to auto-refund failed upscale task:', refundError);
      }

      return NextResponse.json(
        { error: 'Failed to get upscale status', details: message, refunded: true },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get upscale status', details: message },
      { status: 500 }
    );
  }
}
