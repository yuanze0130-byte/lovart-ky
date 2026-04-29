import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';

type RedeemResultRow = {
  success: boolean;
  error_code: string | null;
  credits_added: number;
  current_credits: number;
  transaction_id: string | null;
  redemption_id: string | null;
  batch_name: string | null;
};

function normalizeRedeemCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashRedeemCode(normalizedCode: string) {
  return crypto.createHash('sha256').update(normalizedCode).digest('hex');
}

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return request.headers.get('x-real-ip');
}

function mapRedeemError(code: string | null) {
  switch (code) {
    case 'CODE_REDEEMED':
      return { status: 409, error: '卡密已被使用' };
    case 'CODE_DISABLED':
    case 'BATCH_DISABLED':
      return { status: 400, error: '卡密无效或不可使用' };
    case 'CODE_EXPIRED':
      return { status: 400, error: '卡密已过期' };
    case 'INVALID_CODE':
    default:
      return { status: 400, error: '卡密无效或不可使用' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await request.json();
    const rawCode = String(body.code || '');
    const normalizedCode = normalizeRedeemCode(rawCode);

    if (!normalizedCode || normalizedCode.length < 8) {
      return NextResponse.json({ error: '请输入有效的卡密' }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.rpc('redeem_credit_code', {
      p_user_id: user.id,
      p_code_hash: hashRedeemCode(normalizedCode),
      p_ip: getClientIp(request),
      p_user_agent: request.headers.get('user-agent'),
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? (data[0] as RedeemResultRow | undefined) : undefined;

    if (!result?.success) {
      const mapped = mapRedeemError(result?.error_code || null);
      return NextResponse.json({
        success: false,
        error: mapped.error,
        code: result?.error_code || 'INVALID_CODE',
      }, { status: mapped.status });
    }

    return NextResponse.json({
      success: true,
      creditsAdded: result.credits_added,
      currentCredits: result.current_credits,
      batchName: result.batch_name,
      transactionId: result.transaction_id,
      redemptionId: result.redemption_id,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({
      error: '卡密兑换失败',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
