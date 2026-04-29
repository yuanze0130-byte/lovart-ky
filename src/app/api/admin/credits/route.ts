import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError } from '@/lib/require-user';
import { createAdminServiceRoleClient, requireAdminUser, resolveTargetUser } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireAdminUser(request);

    const body = await request.json();
    const identifier = String(body.identifier || '').trim();
    const credits = Number(body.credits);
    const note = String(body.note || '').trim();

    if (!identifier) {
      return NextResponse.json({ error: '目标用户不能为空' }, { status: 400 });
    }

    if (!Number.isFinite(credits) || credits < 0) {
      return NextResponse.json({ error: '积分必须是大于等于 0 的数字' }, { status: 400 });
    }

    const targetUser = await resolveTargetUser(identifier);
    const supabase = createAdminServiceRoleClient();

    const { data: existingCredits } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', targetUser.id)
      .single();

    const beforeCredits = existingCredits?.credits ?? 0;
    const delta = credits - beforeCredits;

    const { error: upsertError } = await supabase
      .from('user_credits')
      .upsert({ user_id: targetUser.id, credits }, { onConflict: 'user_id' });

    if (upsertError) {
      throw upsertError;
    }

    try {
      await supabase.from('credit_transactions').insert({
        user_id: targetUser.id,
        amount: delta,
        type: 'manual_adjust',
        description: note || `管理员调整积分：${beforeCredits} -> ${credits}`,
        reference_id: currentUser.id,
      });
    } catch {
      // ignore if transactions table / type constraints are not ready
    }

    return NextResponse.json({
      success: true,
      targetUserId: targetUser.id,
      targetEmail: targetUser.email || null,
      beforeCredits,
      credits,
      delta,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';

    if (message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (message === 'TARGET_USER_NOT_FOUND') {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    if (message === 'SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED') {
      return NextResponse.json({ error: '服务端未配置 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    return NextResponse.json({ error: '管理员积分调整失败', details: message }, { status: 500 });
  }
}
