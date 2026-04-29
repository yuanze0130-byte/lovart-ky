import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError } from '@/lib/require-user';
import { createAdminServiceRoleClient, requireAdminUser } from '@/lib/admin-auth';

function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const supabase = createAdminServiceRoleClient();

    const { data: batches, error: batchError } = await supabase
      .from('redeem_code_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (batchError) throw batchError;

    const batchIds = (batches || []).map((item) => item.id);
    let codes: Array<{ batch_id: string; status: string }> = [];

    if (batchIds.length > 0) {
      const { data: codeData, error: codeError } = await supabase
        .from('redeem_codes')
        .select('batch_id,status')
        .in('batch_id', batchIds);

      if (codeError) throw codeError;
      codes = codeData || [];
    }

    const summaries = (batches || []).map((batch) => {
      const related = codes.filter((item) => item.batch_id === batch.id);
      return {
        ...batch,
        totalCodes: related.length,
        unusedCodes: related.filter((item) => item.status === 'unused').length,
        redeemedCodes: related.filter((item) => item.status === 'redeemed').length,
        disabledCodes: related.filter((item) => item.status === 'disabled').length,
        expiredCodes: related.filter((item) => item.status === 'expired').length,
      };
    });

    return NextResponse.json({ success: true, batches: summaries });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: '加载卡密批次失败', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const supabase = createAdminServiceRoleClient();
    const body = await request.json();

    const name = String(body.name || '').trim();
    const creditAmount = Number(body.creditAmount);
    const channel = String(body.channel || '').trim() || null;
    const expiresAt = body.expiresAt ? String(body.expiresAt) : null;
    const codes = Array.isArray(body.codes) ? body.codes : [];

    if (!name) {
      return NextResponse.json({ error: '批次名称不能为空' }, { status: 400 });
    }

    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
      return NextResponse.json({ error: '积分数量必须大于 0' }, { status: 400 });
    }

    if (!codes.length) {
      return NextResponse.json({ error: '至少需要导入一条卡密' }, { status: 400 });
    }

    const normalizedCodes = codes.map((item) => ({
      code_hash: String(item.code_hash || '').trim(),
      code_mask: normalizeCode(String(item.code_mask || '').trim()),
      note: String(item.note || '').trim() || null,
    })).filter((item) => item.code_hash && item.code_mask);

    if (!normalizedCodes.length) {
      return NextResponse.json({ error: '卡密数据格式无效' }, { status: 400 });
    }

    const { data: batch, error: batchError } = await supabase
      .from('redeem_code_batches')
      .insert({
        name,
        credit_amount: creditAmount,
        channel,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (batchError || !batch) throw batchError || new Error('CREATE_BATCH_FAILED');

    const { error: codeError } = await supabase
      .from('redeem_codes')
      .insert(normalizedCodes.map((item) => ({
        batch_id: batch.id,
        code_hash: item.code_hash,
        code_mask: item.code_mask,
        note: item.note,
      })));

    if (codeError) {
      await supabase.from('redeem_code_batches').delete().eq('id', batch.id);
      throw codeError;
    }

    return NextResponse.json({
      success: true,
      batch,
      importedCount: normalizedCodes.length,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: '创建卡密批次失败', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
