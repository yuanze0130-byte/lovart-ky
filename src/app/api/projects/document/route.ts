import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isNotAuthenticatedError } from '@/lib/require-user';
import { createServiceRoleSupabaseClient, type Json } from '@/lib/supabase';
import { readLimitedJson, isAiToolRequestError } from '@/lib/ai-tool-request-guards';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (isNotAuthenticatedError(error)) return reply({ error: '请先登录' }, 401);
  if (isAiToolRequestError(error)) return reply({ error: error.message }, error.status);
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('CANVAS_REVISION_CONFLICT')) return reply({ error: '此项目已在其他窗口更新，请保留本地修改后重新加载。', code: 'CANVAS_REVISION_CONFLICT' }, 409);
  if (message.includes('CANVAS_NOT_FOUND')) return reply({ error: '项目不存在或无权访问' }, 404);
  if (message.includes('INVALID_CANVAS')) return reply({ error: '画布数据不完整，未覆盖已保存内容' }, 400);
  console.error('[project-document]', message);
  return reply({ error: '项目读取或保存失败，请稍后重试' }, 500);
}
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const id = request.nextUrl.searchParams.get('id') || '';
    if (!uuid.test(id)) return reply({ error: '项目编号无效' }, 400);
    const db = createServiceRoleSupabaseClient();
    if (request.nextUrl.searchParams.has('history')) {
      const raw = request.nextUrl.searchParams.get('revision');
      const revision = raw === null ? undefined : Number(raw);
      if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) return reply({ error: '版本无效' }, 400);
      const { data, error } = await db.rpc('canvas_document_history', { p_project_id: id, p_user_id: user.id, p_revision: revision });
      if (error) throw error;
      return reply(data);
    }
    const { data, error } = await db.rpc('load_canvas_document', { p_project_id: id, p_user_id: user.id });
    if (error) throw error;
    return data ? reply(data) : reply({ error: '项目不存在或无权访问' }, 404);
  } catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = await readLimitedJson(request, 20 * 1024 * 1024) as Record<string, unknown>;
    if (typeof input.id !== 'string' || !uuid.test(input.id) || typeof input.title !== 'string'
      || !Number.isSafeInteger(input.revision) || Number(input.revision) < -1 || !Array.isArray(input.elements)) {
      return reply({ error: '项目保存参数无效' }, 400);
    }
    const { data, error } = await createServiceRoleSupabaseClient().rpc('save_canvas_document', {
      p_project_id: input.id, p_user_id: user.id, p_expected_revision: Number(input.revision),
      p_title: input.title, p_elements: input.elements as Json, p_viewport: (input.viewport || null) as Json,
    });
    if (error) throw error;
    return reply({ id: input.id, revision: data });
  } catch (error) { return failure(error); }
}
