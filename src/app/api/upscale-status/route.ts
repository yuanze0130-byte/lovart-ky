import { NextRequest, NextResponse } from 'next/server';
import { queryUpscaleTask } from '@/lib/upscale';
import { requireUser } from '@/lib/require-user';

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const taskId = request.nextUrl.searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const result = await queryUpscaleTask(taskId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to get upscale status', details: message },
      { status: 500 }
    );
  }
}
