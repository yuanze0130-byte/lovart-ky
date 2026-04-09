import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      message: 'Authenticated with Supabase Auth',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Not authenticated',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 401 }
    );
  }
}
