import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { ensureUserCredits } from '@/lib/credits';
import { createServiceRoleSupabaseClient } from '@/lib/supabase';
import type { CreditTransactionRow } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const creditRow = await ensureUserCredits(user.id);
    const supabase = createServiceRoleSupabaseClient();

    const { data: txData, error: txError } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (txError) {
      throw txError;
    }

    return NextResponse.json({
      success: true,
      credits: creditRow.credits,
      creditRow,
      transactions: (txData || []) as CreditTransactionRow[],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load user credits',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
