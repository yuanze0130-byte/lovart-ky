import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { ensureCreditsWithSignupProtection } from '@/lib/signup-bonus';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import type { CreditTransactionRow } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const { credits: creditRow, signupBonus } = await ensureCreditsWithSignupProtection(request, user);
    const supabase = createServiceRoleSupabaseClient();

    const { data: txData, error: txError } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: redemptionData, error: redemptionError } = await supabase
      .from('redeem_code_redemptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (txError) {
      throw txError;
    }

    if (redemptionError) {
      throw redemptionError;
    }

    return NextResponse.json({
      success: true,
      credits: creditRow.credits,
      creditRow,
      transactions: (txData || []) as CreditTransactionRow[],
      redemptions: redemptionData || [],
      signupBonus,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: 'Failed to load user credits',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
