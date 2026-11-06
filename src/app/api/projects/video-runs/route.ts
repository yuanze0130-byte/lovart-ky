import {NextRequest,NextResponse} from 'next/server';
import {requireUser,isNotAuthenticatedError} from '@/lib/require-user';
import {createServiceRoleSupabaseClient} from '@/lib/supabase';

// Reading this ledger never submits a generation or calls the provider.
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const id = request.nextUrl.searchParams.get('id');
    const after = request.nextUrl.searchParams.get('after');
    const history = request.nextUrl.searchParams.get('history') === '1';
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || (after && (after.length > 200 || !/^[a-z0-9_-]+$/i.test(after)))) return NextResponse.json({error:'项目或分页参数无效'}, {status:400});
    let query = createServiceRoleSupabaseClient().from('video_generation_jobs')
      .select('request_id,task_id,status,generator_id,recovery_meta,model_id,charged_credits,refunded_credits,price_version,failure_reason,created_at')
      .eq('user_id',user.id).eq('project_id',id).order(history?'created_at':'request_id',{ascending:!history}).limit(100);
    if (!history) query = query.eq('acknowledged',false);
    if (!history && after) query = query.gt('request_id',after);
    const {data,error} = await query;
    if (error) throw error;
    const rows = data || [];
    return NextResponse.json(rows,{headers:{'Cache-Control':'no-store',...(!history && rows.length === 100 ? {'X-Recovery-Cursor':rows[rows.length-1].request_id} : {})}});
  } catch(error) {
    return NextResponse.json({error:'无法读取视频任务'},{status:isNotAuthenticatedError(error)?401:500});
  }
}
