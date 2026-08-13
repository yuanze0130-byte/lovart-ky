import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { ensureCreditsWithSignupProtection } from '@/lib/signup-bonus';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const { credits, signupBonus } = await ensureCreditsWithSignupProtection(request, user);

    return NextResponse.json({
      success: true,
      credits,
      signupBonus,
    });
  } catch (error) {
    if (isNotAuthenticatedError(error)) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: 'Failed to ensure user credits',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
