import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError } from '@/lib/require-user';
import { createAdminServiceRoleClient, requireAdminUser } from '@/lib/admin-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    await requireAdminUser(request);
    const supabase = createAdminServiceRoleClient();
    const { batchId } = await params;
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get('q') || '').trim().toUpperCase();
    const status = (searchParams.get('status') || '').trim();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);

    const { data: batch, error: batchError } = await supabase
      .from('redeem_code_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return NextResponse.json({ error: '未找到该批次' }, { status: 404 });
    }

    let codeQuery = supabase
      .from('redeem_codes')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      codeQuery = codeQuery.eq('status', status);
    }

    if (keyword) {
      codeQuery = codeQuery.ilike('code_mask', `%${keyword}%`);
    }

    const { data: codes, error: codeError } = await codeQuery;
    if (codeError) throw codeError;

    const codeIds = (codes || []).map((item) => item.id);
    let redemptions: Array<{
      id: string;
      code_id: string;
      user_id: string;
      credit_amount: number;
      transaction_id: string | null;
      created_at: string;
    }> = [];

    if (codeIds.length > 0) {
      const { data: redemptionData, error: redemptionError } = await supabase
        .from('redeem_code_redemptions')
        .select('id,code_id,user_id,credit_amount,transaction_id,created_at')
        .in('code_id', codeIds);

      if (redemptionError) throw redemptionError;
      redemptions = redemptionData || [];
    }

    const redemptionMap = new Map(redemptions.map((item) => [item.code_id, item]));
    const detailedCodes = (codes || []).map((code) => ({
      ...code,
      redemption: redemptionMap.get(code.id) || null,
    }));

    const allCounts = {
      totalCodes: detailedCodes.length,
      unusedCodes: detailedCodes.filter((item) => item.status === 'unused').length,
      redeemedCodes: detailedCodes.filter((item) => item.status === 'redeemed').length,
      disabledCodes: detailedCodes.filter((item) => item.status === 'disabled').length,
      expiredCodes: detailedCodes.filter((item) => item.status === 'expired').length,
    };

    return NextResponse.json({
      success: true,
      batch,
      codes: detailedCodes,
      counts: allCounts,
      filters: {
        q: keyword,
        status: status || 'all',
        limit,
      },
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(
      { error: '加载批次详情失败', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
