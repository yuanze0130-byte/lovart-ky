import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isNotAuthenticatedError } from '@/lib/require-user';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import { createSignedCanvasAssetUrl, parseCanvasAssetPath } from '@/lib/canvas-asset-access';
import { canReconcileImageRun, reconcileImageRun } from '@/lib/image-task-recovery.server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '项目无效' }, { status: 400 });
    const history = request.nextUrl.searchParams.get('history') === '1';
    const agentRunId = request.nextUrl.searchParams.get('run');
    if (agentRunId && !/^[0-9a-f-]{36}$/i.test(agentRunId)) return NextResponse.json({error:'计划编号无效'}, {status:400});
    const cursor = request.nextUrl.searchParams.get('after');
    const before = request.nextUrl.searchParams.get('before');
    if ((cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) || (before && !Number.isFinite(Date.parse(before)))) return NextResponse.json({error:'分页参数无效'}, {status:400});
    let query = createServiceRoleSupabaseClient().from('canvas_image_runs')
      .select('request_id,status,result,meta,created_at,updated_at').eq('user_id', user.id).eq('project_id', id)
      .order(history ? 'created_at' : 'request_id', { ascending: !history }).limit(100);
    if (!history && !agentRunId) query = query.eq('acknowledged', false);
    if (agentRunId) query = query.eq('meta->>agentRunId', agentRunId);
    if (!history && cursor) query = query.gt('request_id', cursor);
    if (!history && before) query = query.lte('created_at', new Date(before).toISOString());
    const initial = await query;
    const error = initial.error;
    let data = initial.data;
    if (error) throw error;
    const pendingRecovery = (data || []).filter(run => canReconcileImageRun(run)).slice(0,2);
    if (pendingRecovery.length) {
      await Promise.allSettled(pendingRecovery.map(run => reconcileImageRun(user.id,run)));
      const refreshed = await query;
      if (refreshed.error) throw refreshed.error;
      data = refreshed.data;
    }
    const runs = (data || []).map(run => {
      const result = run.result && typeof run.result === 'object' && !Array.isArray(run.result) ? { ...run.result } : null;
      const asset = typeof result?.imageData === 'string' ? parseCanvasAssetPath(result.imageData) : null;
      if (result && asset?.userId === user.id) result.imageData = createSignedCanvasAssetUrl(asset.userId, asset.fileName);
      return { ...run, result: history ? null : result, status: run.status === 'running' && Date.now() - Date.parse(run.created_at) > 15 * 60_000 ? 'outcome_unknown' : run.status };
    });
    return NextResponse.json(runs, { headers: { 'Cache-Control': 'no-store',
      ...(!history && runs.length === 100 ? {'X-Recovery-Cursor':runs[runs.length-1].request_id} : {}),
    } });
  } catch (error) {
    return NextResponse.json({ error: '无法读取图片任务' }, { status: isNotAuthenticatedError(error) ? 401 : 500 });
  }
}
