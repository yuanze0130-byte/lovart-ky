import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { enforceUserRateLimit, isAiToolRequestError, readLimitedJson } from '@/lib/ai-tool-request-guards';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    enforceUserRateLimit(user.id, 'project-thumbnail', { limit: 20, windowMs: 60_000 });
    const body = await readLimitedJson(request, 2 * 1024 * 1024) as { projectId?: string; thumbnail?: string };
    const { projectId, thumbnail } = body;

    if (!projectId || !thumbnail) {
      return NextResponse.json({ error: '缺少 projectId 或 thumbnail 参数' }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();

    // Verify the project belongs to the requesting user
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: '项目不存在或无权限' }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update({ thumbnail })
      .eq('id', projectId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isAiToolRequestError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined },
      );
    }
    return NextResponse.json(
      {
        error: '更新缩略图失败',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
