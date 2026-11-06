import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { readTextStep } from '@/lib/agent/text-step.server';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const projectId = request.nextUrl.searchParams.get('projectId') || '';
    const requestId = request.nextUrl.searchParams.get('requestId') || '';
    const row = await readTextStep(user.id, projectId, requestId);
    if (!row) return NextResponse.json({ status: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ requestId: row.request_id, status: row.status, result: row.result }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: '无法读取此工作流步骤' }, { status: isNotAuthenticatedError(error) ? 401 : 400 });
  }
}
