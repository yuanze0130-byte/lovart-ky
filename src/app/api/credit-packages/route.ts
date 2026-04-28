import { NextResponse } from 'next/server';
import { listEnabledCreditPackages } from '@/lib/payments/orders';

export async function GET() {
  try {
    const packages = await listEnabledCreditPackages();
    return NextResponse.json({
      success: true,
      packages: packages.map((item) => ({
        ...item,
        total_credits: item.credits + item.bonus_credits,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load credit packages',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
