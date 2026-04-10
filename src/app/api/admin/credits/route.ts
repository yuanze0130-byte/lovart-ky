import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { createClient } from '@supabase/supabase-js';

type AdminTargetUser = {
  id: string;
  email?: string;
};

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveTargetUser(identifier: string) {
  const supabase = createServiceRoleClient();
  const trimmed = identifier.trim();

  if (!trimmed) {
    throw new Error('TARGET_IDENTIFIER_REQUIRED');
  }

  if (!trimmed.includes('@')) {
    const { data, error } = await supabase.auth.admin.getUserById(trimmed);
    if (error || !data.user) {
      throw new Error('TARGET_USER_NOT_FOUND');
    }

    return {
      id: data.user.id,
      email: data.user.email,
    } satisfies AdminTargetUser;
  }

  let page = 1;
  const email = trimmed.toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }

    const matched = data.users.find((user) => (user.email || '').toLowerCase() === email);
    if (matched) {
      return {
        id: matched.id,
        email: matched.email,
      } satisfies AdminTargetUser;
    }

    if (!data.users.length || data.users.length < 200) {
      break;
    }

    page += 1;
  }

  throw new Error('TARGET_USER_NOT_FOUND');
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireUser(request);
    const adminEmails = getAdminEmails();
    const currentEmail = (currentUser.email || '').toLowerCase();

    if (!currentEmail || !adminEmails.includes(currentEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
    const supabase = createServiceRoleClient();

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
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';

    if (message === 'TARGET_USER_NOT_FOUND') {
      return NextResponse.json({ error: '未找到该用户' }, { status: 404 });
    }

    if (message === 'SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED') {
      return NextResponse.json({ error: '服务端未配置 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }

    return NextResponse.json({ error: '管理员积分调整失败', details: message }, { status: 500 });
  }
}
