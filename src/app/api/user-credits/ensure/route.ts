import { NextRequest, NextResponse } from 'next/server';
import { isNotAuthenticatedError, requireUser } from '@/lib/require-user';
import { ensureUserCredits } from '@/lib/credits';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const credits = await ensureUserCredits(user.id);

    return NextResponse.json({
      success: true,
      credits,
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
